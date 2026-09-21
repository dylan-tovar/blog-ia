import { ImageUploadError } from "@/features/posts/images/image-errors";
import { IMAGE_MAX_OUTPUT_BYTES, IMAGE_WEBP_QUALITY } from "@/features/posts/images/image-limits";
import { computeTargetSize } from "@/features/posts/images/image-utils";

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  extension: "webp" | "jpg";
}

const QUALITY_STEPS = [IMAGE_WEBP_QUALITY, 0.6];

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageUploadError("decode");
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Browser-only: decodes (honouring EXIF orientation), downscales to the max width and
// re-encodes as WebP so uploads stay small. Browsers without WebP encoding fall back to JPEG.
export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await decode(file);
  try {
    const { width, height } = computeTargetSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new ImageUploadError("decode");
    }
    context.drawImage(bitmap, 0, 0, width, height);

    for (const quality of QUALITY_STEPS) {
      const webp = await encode(canvas, "image/webp", quality);
      if (webp?.type === "image/webp") {
        if (webp.size <= IMAGE_MAX_OUTPUT_BYTES) {
          return { blob: webp, width, height, extension: "webp" };
        }
        continue;
      }

      // JPEG has no alpha channel: paint white under the image instead of letting it turn black.
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      const jpeg = await encode(canvas, "image/jpeg", quality);
      if (jpeg && jpeg.size <= IMAGE_MAX_OUTPUT_BYTES) {
        return { blob: jpeg, width, height, extension: "jpg" };
      }
    }
    throw new ImageUploadError("too-large");
  } finally {
    bitmap.close();
  }
}
