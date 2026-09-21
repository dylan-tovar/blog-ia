import { compressImage } from "@/features/posts/images/compress-image";
import { ImageUploadError } from "@/features/posts/images/image-errors";
import {
  IMAGE_CACHE_CONTROL_SECONDS,
  POST_IMAGES_BUCKET,
} from "@/features/posts/images/image-limits";
import { buildImagePath, validateSourceFile } from "@/features/posts/images/image-utils";
import { createClient } from "@/lib/supabase/client";

export interface UploadedImage {
  url: string;
  width: number;
  height: number;
}

export async function uploadPostImage(file: File): Promise<UploadedImage> {
  const validation = validateSourceFile(file);
  if (!validation.ok) {
    throw new ImageUploadError(validation.reason);
  }

  const compressed = await compressImage(file);

  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    throw new ImageUploadError("auth");
  }

  const path = buildImagePath(
    data.user.id,
    crypto.randomUUID(),
    compressed.width,
    compressed.height,
    compressed.extension,
  );
  const { error } = await supabase.storage.from(POST_IMAGES_BUCKET).upload(path, compressed.blob, {
    cacheControl: IMAGE_CACHE_CONTROL_SECONDS,
    contentType: compressed.blob.type,
    upsert: false,
  });
  if (error) {
    throw new ImageUploadError("upload");
  }

  const { data: publicUrl } = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(path);
  return { url: publicUrl.publicUrl, width: compressed.width, height: compressed.height };
}
