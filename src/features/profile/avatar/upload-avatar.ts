import { compressImage } from "@/features/posts/images/compress-image";
import { ImageUploadError } from "@/features/posts/images/image-errors";
import { buildImagePath, validateSourceFile } from "@/features/posts/images/image-utils";
import { AVATAR_BUCKET, AVATAR_MAX_WIDTH, IMAGE_CACHE_CONTROL_SECONDS } from "@/features/profile/avatar/avatar-limits";
import { createClient } from "@/lib/supabase/client";

export interface UploadedAvatar {
  url: string;
  width: number;
  height: number;
}

const AVATAR_PATH_PREFIX = `/storage/v1/object/public/${AVATAR_BUCKET}/`;

function extractAvatarPath(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    const index = pathname.indexOf(AVATAR_PATH_PREFIX);
    return index === -1 ? null : pathname.slice(index + AVATAR_PATH_PREFIX.length);
  } catch {
    return null;
  }
}

// Best-effort cleanup: the old object is orphaned Storage, not app data, so a
// failure here must never surface to the user. Callers must only invoke this
// after the new avatar_url is confirmed saved, so a failed DB write never
// leaves the profile pointing at an already-deleted file.
export function deleteAvatarObject(url: string): void {
  const path = extractAvatarPath(url);
  if (!path) {
    return;
  }
  void createClient().storage.from(AVATAR_BUCKET).remove([path]);
}

export async function uploadAvatar(file: File): Promise<UploadedAvatar> {
  const validation = validateSourceFile(file);
  if (!validation.ok) {
    throw new ImageUploadError(validation.reason);
  }

  const compressed = await compressImage(file, AVATAR_MAX_WIDTH);

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
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, compressed.blob, {
    cacheControl: IMAGE_CACHE_CONTROL_SECONDS,
    contentType: compressed.blob.type,
    upsert: false,
  });
  if (error) {
    throw new ImageUploadError("upload");
  }

  const { data: publicUrl } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  return { url: publicUrl.publicUrl, width: compressed.width, height: compressed.height };
}
