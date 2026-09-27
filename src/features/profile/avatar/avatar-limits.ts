export {
  IMAGE_ACCEPTED_TYPES,
  IMAGE_CACHE_CONTROL_SECONDS,
  IMAGE_MAX_SOURCE_BYTES,
} from "@/features/posts/images/image-limits";

export const AVATAR_BUCKET = "avatar-images";

// Avatars are shown small (nav, drawer, profile header); no need for the 1600px
// ceiling used for post covers/content images.
export const AVATAR_MAX_WIDTH = 512;
