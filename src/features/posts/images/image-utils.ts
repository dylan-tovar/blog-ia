import {
  IMAGE_ACCEPTED_TYPES,
  IMAGE_MAX_SOURCE_BYTES,
  IMAGE_MAX_WIDTH,
  POST_IMAGES_BUCKET,
} from "@/features/posts/images/image-limits";

export type SourceFileIssue = "type" | "empty" | "size";

export type SourceFileValidation = { ok: true } | { ok: false; reason: SourceFileIssue };

export function validateSourceFile(file: { type: string; size: number }): SourceFileValidation {
  if (!(IMAGE_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, reason: "type" };
  }
  if (file.size <= 0) {
    return { ok: false, reason: "empty" };
  }
  if (file.size > IMAGE_MAX_SOURCE_BYTES) {
    return { ok: false, reason: "size" };
  }
  return { ok: true };
}

export function computeTargetSize(
  width: number,
  height: number,
  maxWidth: number = IMAGE_MAX_WIDTH,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError("Image dimensions must be positive finite numbers");
  }
  if (width <= maxWidth) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  return { width: maxWidth, height: Math.max(1, Math.round((height * maxWidth) / width)) };
}

export function buildImagePath(
  userId: string,
  uuid: string,
  width: number,
  height: number,
  extension = "webp",
): string {
  return `${userId}/${uuid}-${width}x${height}.${extension}`;
}

const SIZE_IN_FILE_NAME = /-(\d+)x(\d+)\.[a-z0-9]+$/i;

export function parseImageSize(url: string): { width: number; height: number } | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const match = SIZE_IN_FILE_NAME.exec(pathname);
  if (!match) {
    return null;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

const PUBLIC_PATH_PREFIX = `/storage/v1/object/public/${POST_IMAGES_BUCKET}/`;

export function isAllowedImageUrl(url: string, supabaseUrl: string): boolean {
  let image: URL;
  let allowed: URL;
  try {
    image = new URL(url);
    allowed = new URL(supabaseUrl);
  } catch {
    return false;
  }
  if (image.protocol !== "https:" && image.protocol !== "http:") {
    return false;
  }
  if (image.username !== "" || image.password !== "") {
    return false;
  }
  return (
    image.origin === allowed.origin &&
    image.pathname.startsWith(PUBLIC_PATH_PREFIX) &&
    !image.pathname.includes("..")
  );
}

const ALT_MAX_LENGTH = 80;
const GENERIC_NAME_WORDS = new Set([
  "img", "dsc", "dscn", "pxl", "image", "imagen", "photo", "foto",
  "screenshot", "screen", "shot", "captura", "de", "pantalla", "at", "a", "las", "pm", "am",
]);

// A file name only makes useful alt text when it says something ("atardecer-en-la-playa");
// camera and screenshot names are noise for screen readers, so those get an empty alt.
export function defaultAltText(fileName: string): string {
  const text = fileName
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/[[\]()<>`\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const isDescriptive = text
    .split(" ")
    .some((word) => /^\p{L}+$/u.test(word) && !GENERIC_NAME_WORDS.has(word.toLowerCase()));

  return isDescriptive ? text.slice(0, ALT_MAX_LENGTH).trim() : "";
}
