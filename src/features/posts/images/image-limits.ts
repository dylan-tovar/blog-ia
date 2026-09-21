export const POST_IMAGES_BUCKET = "post-images";

export const IMAGE_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const IMAGE_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const IMAGE_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
export const IMAGE_MAX_WIDTH = 1600;
export const IMAGE_WEBP_QUALITY = 0.8;
export const IMAGE_CACHE_CONTROL_SECONDS = "31536000";
