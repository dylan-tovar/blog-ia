"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PostCover } from "@/features/posts/components/PostCover";
import { resolveCover } from "@/features/posts/cover/cover";
import { draftToCoverValue, type CoverDraft, type CoverMode } from "@/features/posts/cover/cover-draft";
import { COVER_COLORS, COVER_COLOR_STYLES } from "@/features/posts/cover/cover-palette";
import { COVER_TEXT_MAX_LENGTH } from "@/features/posts/cover/cover-schema";
import { describeImageError } from "@/features/posts/images/image-errors";
import { IMAGE_ACCEPTED_TYPES } from "@/features/posts/images/image-limits";
import { uploadPostImage } from "@/features/posts/images/upload-post-image";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

interface CoverPickerProps {
  draft: CoverDraft;
  onDraftChange: Dispatch<SetStateAction<CoverDraft>>;
  contentImages: string[];
  disabled: boolean;
}

const MODES: { value: CoverMode; label: string }[] = [
  { value: "none", label: "Sin portada" },
  { value: "image", label: "Imagen" },
  { value: "text", label: "Texto" },
];

export function CoverPicker({ draft, onDraftChange, contentImages, disabled }: CoverPickerProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();

  const candidates = [...new Set([...uploaded, ...contentImages])];
  const value = draftToCoverValue(draft);
  const preview = resolveCover(value, env.NEXT_PUBLIC_SUPABASE_URL);

  function update(patch: Partial<CoverDraft>) {
    onDraftChange((current) => ({ ...current, ...patch }));
  }

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }
    setUploadError(undefined);
    setUploading(true);
    try {
      const { url } = await uploadPostImage(file);
      setUploaded((current) => [url, ...current.filter((item) => item !== url)]);
      update({ mode: "image", imageUrl: url });
    } catch (error) {
      setUploadError(describeImageError(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">Portada</legend>

      <div role="radiogroup" aria-label="Tipo de portada" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            role="radio"
            aria-checked={draft.mode === mode.value}
            onClick={() => update({ mode: mode.value })}
            className={cn(
              "min-h-9 cursor-pointer rounded-md px-2 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed",
              draft.mode === mode.value
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {draft.mode === "image" && (
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
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
            {uploading ? "Subiendo…" : "Subir imagen"}
          </Button>

          {candidates.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">
                O elegí una imagen que ya está en tu artículo.
              </p>
              <ul className="grid grid-cols-3 gap-2">
                {candidates.map((url, index) => (
                  <li key={url}>
                    <button
                      type="button"
                      aria-pressed={draft.imageUrl === url}
                      aria-label={`Usar la imagen ${index + 1} como portada`}
                      onClick={() => update({ imageUrl: url })}
                      className={cn(
                        "block w-full cursor-pointer overflow-hidden rounded-md border-2 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        draft.imageUrl === url ? "border-primary" : "border-transparent hover:border-border",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- already compressed to WebP <= 1600px at upload */}
                      <img src={url} alt="" loading="lazy" decoding="async" className="aspect-video w-full object-cover" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Subí una imagen, o insertá imágenes en el artículo para elegirlas desde acá.
            </p>
          )}

          {uploadError && (
            <p role="alert" className="text-sm text-destructive">
              {uploadError}
            </p>
          )}
        </div>
      )}

      {draft.mode === "text" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cover-text" className="sr-only">
              Texto de la portada
            </Label>
            <Textarea
              id="cover-text"
              value={draft.text}
              onChange={(event) => update({ text: event.target.value })}
              maxLength={COVER_TEXT_MAX_LENGTH}
              placeholder="Una frase o idea del artículo"
              className="min-h-20"
            />
            <p className="text-right text-xs text-muted-foreground" aria-live="polite">
              {draft.text.length}/{COVER_TEXT_MAX_LENGTH}
            </p>
          </div>

          <div role="radiogroup" aria-label="Color de la portada" className="flex flex-wrap gap-2">
            {COVER_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={draft.color === color}
                aria-label={COVER_COLOR_STYLES[color].label}
                title={COVER_COLOR_STYLES[color].label}
                onClick={() => update({ color })}
                className={cn(
                  "size-9 cursor-pointer rounded-full border-2 border-transparent transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  COVER_COLOR_STYLES[color].className,
                  draft.color === color && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                )}
              />
            ))}
          </div>
        </div>
      )}

      {preview.kind !== "none" && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">Así se verá en el feed</p>
          <div className="overflow-hidden rounded-xl border border-border/80">
            <PostCover cover={preview} />
          </div>
        </div>
      )}
    </fieldset>
  );
}
