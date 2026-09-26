"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { describeImageError } from "@/features/posts/images/image-errors";
import { IMAGE_ACCEPTED_TYPES } from "@/features/profile/avatar/avatar-limits";
import { deleteAvatarObject, uploadAvatar } from "@/features/profile/avatar/upload-avatar";
import { updateAvatar } from "@/features/profile/actions";
import { cn } from "@/lib/utils";

interface AvatarPickerProps {
  displayName?: string | null;
  avatarUrl?: string | null;
  className?: string;
}

export function AvatarPicker({ displayName, avatarUrl, className }: AvatarPickerProps) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }
    setError(undefined);
    setUploading(true);
    try {
      const { url } = await uploadAvatar(file);
      const result = await updateAvatar(url);
      if (result?.error) {
        setError(result.error);
        return;
      }
      // Only remove the previous file once the new avatar_url is confirmed
      // saved, so a failed update above never leaves a dangling reference.
      if (avatarUrl) {
        deleteAvatarObject(avatarUrl);
      }
      router.refresh();
    } catch (uploadError) {
      setError(describeImageError(uploadError));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileInput}
        type="file"
        accept={IMAGE_ACCEPTED_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={uploading}
        aria-label="Cambiar foto de perfil"
        className={cn("group relative shrink-0 cursor-pointer disabled:cursor-not-allowed", className)}
      >
        <UserAvatar
          name={displayName}
          avatarUrl={avatarUrl}
          className="size-14 rounded-full ring-1 ring-border/50 text-base font-semibold"
        />
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          {uploading ? (
            <Loader2 className="size-4 animate-spin text-white" aria-hidden />
          ) : (
            <Camera className="size-4 text-white" aria-hidden />
          )}
        </span>
      </button>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
