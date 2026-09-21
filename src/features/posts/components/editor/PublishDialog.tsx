"use client";

import { useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_TAGS_PER_POST } from "@/features/ai/constants";
import { formatRetry } from "@/features/ai/components/ai-ui";
import { useCountdown } from "@/features/ai/components/use-countdown";
import { addTag, publishPost, removeTag, savePostCover } from "@/features/posts/actions";
import { CoverPicker } from "@/features/posts/components/editor/CoverPicker";
import { extractImageUrls, filterOwnCoverImages } from "@/features/posts/cover/cover";
import {
  coverValuesEqual,
  draftToCoverValue,
  toCoverDraft,
} from "@/features/posts/cover/cover-draft";
import type { CoverValue } from "@/features/posts/cover/cover-schema";
import { env } from "@/lib/env";

type Tag = { id: string; name: string };

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canPublish: boolean;
  title: string;
  userId: string;
  initialCover: CoverValue;
  tags: Tag[];
  onTagsChange: Dispatch<SetStateAction<Tag[]>>;
  allTagNames: string[];
  ensurePostId: () => Promise<string | null>;
  getContent: () => string;
  onPublished: (postId: string) => void;
  onPublishedStatus: () => void;
  onRejected: (reason: string) => void;
}

type Outcome = { postId: string; aiTags: string[]; skipped: boolean };
type Busy = { retryAfter: number; id: number };

const REDIRECT_DELAY_MS = 1500;

// Shown when moderation is rate limited: the post was NOT published and stays editable.
function BusyNotice({ retryAfter, onRetry, disabled }: { retryAfter: number; onRetry: () => void; disabled: boolean }) {
  const { secondsLeft, counting } = useCountdown(retryAfter);

  return (
    <div className="flex flex-col items-start gap-2 rounded-md bg-muted p-3 text-sm text-foreground">
      <p>
        {counting
          ? `Estamos revisando muchas publicaciones, reintentá en ${formatRetry(secondsLeft)}.`
          : "Ya podés intentar publicar de nuevo."}
      </p>
      <Button type="button" size="sm" variant="secondary" onClick={onRetry} disabled={disabled || counting}>
        Reintentar
      </Button>
    </div>
  );
}

export function PublishDialog({
  open,
  onOpenChange,
  canPublish,
  title,
  userId,
  initialCover,
  tags,
  onTagsChange,
  allTagNames,
  ensurePostId,
  getContent,
  onPublished,
  onPublishedStatus,
  onRejected,
}: PublishDialogProps) {
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState<string>();
  const [outcome, setOutcome] = useState<Outcome>();
  const [busy, setBusy] = useState<Busy>();
  const [reviewing, setReviewing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const atTagLimit = tags.length >= MAX_TAGS_PER_POST;
  const [coverDraft, setCoverDraft] = useState(() => toCoverDraft(initialCover));
  const [savedCover, setSavedCover] = useState(initialCover);
  const coverValue = draftToCoverValue(coverDraft);
  const coverDirty = !coverValuesEqual(coverValue, savedCover);
  const [coverUploading, setCoverUploading] = useState(false);
  const locked = isPending || coverUploading;
  const contentImages = open
    ? filterOwnCoverImages(
        extractImageUrls(getContent(), env.NEXT_PUBLIC_SUPABASE_URL),
        env.NEXT_PUBLIC_SUPABASE_URL,
        userId,
      )
    : [];

  async function persistCover(postId: string): Promise<boolean> {
    if (!coverDirty) {
      return true;
    }
    const result = await savePostCover(postId, coverValue);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setSavedCover(coverValue);
    return true;
  }

  function handleAddTag() {
    const name = tagInput.trim();
    if (!name) {
      return;
    }

    setError(undefined);
    setTagInput("");
    startTransition(async () => {
      const postId = await ensurePostId();
      if (!postId) {
        setError("Escribí algo antes de agregar tags.");
        return;
      }

      const result = await addTag(postId, name);
      if (!result.ok || !result.tag) {
        setError(result.error ?? "No pudimos agregar el tag.");
        return;
      }

      const added = result.tag;
      onTagsChange((current) =>
        current.some((tag) => tag.id === added.id) ? current : [...current, added],
      );
    });
  }

  function handleRemoveTag(tag: Tag) {
    setError(undefined);
    startTransition(async () => {
      const postId = await ensurePostId();
      if (!postId) {
        return;
      }

      const result = await removeTag(postId, tag.id);
      if (result.ok) {
        onTagsChange((current) => current.filter((item) => item.id !== tag.id));
      } else {
        setError("No pudimos quitar el tag.");
      }
    });
  }

  function handlePublish() {
    setError(undefined);
    setBusy(undefined);
    if (!getContent().trim()) {
      setError("El artículo no puede estar vacío para publicarlo.");
      return;
    }

    setReviewing(true);
    startTransition(async () => {
      const postId = await ensurePostId();
      if (!postId) {
        setReviewing(false);
        setError("No pudimos guardar el artículo para publicarlo.");
        return;
      }

      if (!(await persistCover(postId))) {
        setReviewing(false);
        return;
      }

      const result = await publishPost(postId);
      setReviewing(false);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (result.status === "rejected") {
        onRejected(result.reason);
        return;
      }

      if (result.status === "busy") {
        setBusy({ retryAfter: result.retryAfter, id: Date.now() });
        return;
      }

      const skipped = result.aiSkippedReason !== undefined;
      onPublishedStatus();
      setOutcome({ postId, aiTags: result.aiTags, skipped });
      if (!skipped) {
        setTimeout(() => onPublished(postId), REDIRECT_DELAY_MS);
      }
    });
  }

  // Only a request in flight locks the dialog: once there is an outcome the author can
  // always dismiss it (Escape, backdrop, "Seguir editando") and keep working.
  function close() {
    setOutcome(undefined);
    setBusy(undefined);
    setError(undefined);
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next && locked) {
      return;
    }
    if (!next) {
      close();
      return;
    }
    onOpenChange(next);
  }

  // The footer's dismiss buttons keep the chosen cover; Escape and the backdrop only close.
  function handleDone() {
    if (!coverDirty) {
      close();
      return;
    }

    setError(undefined);
    startTransition(async () => {
      const postId = await ensurePostId();
      if (!postId || (await persistCover(postId))) {
        close();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{canPublish ? "Publicar artículo" : "Tags del artículo"}</DialogTitle>
          <DialogDescription>
            Los tags ayudan a que lectores interesados encuentren tu artículo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tag-input">Tags</Label>
          {tags.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <li key={tag.id}>
                  <Badge variant="secondary" className="gap-1">
                    {tag.name}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      disabled={isPending}
                      aria-label={`Quitar tag ${tag.name}`}
                      className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input
              id="tag-input"
              list="existing-tags"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="Agregar tag"
              disabled={isPending}
            />
            <datalist id="existing-tags">
              {allTagNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <Button type="button" variant="secondary" onClick={handleAddTag} disabled={isPending || atTagLimit}>
              Agregar
            </Button>
          </div>
          {atTagLimit && (
            <p className="text-xs text-muted-foreground">
              Llegaste al máximo de {MAX_TAGS_PER_POST} tags por artículo.
            </p>
          )}
        </div>

        <CoverPicker
          draft={coverDraft}
          title={title}
          onDraftChange={setCoverDraft}
          contentImages={contentImages}
          disabled={isPending}
          onUploadingChange={setCoverUploading}
        />

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div aria-live="polite" className="flex flex-col gap-2">
          {reviewing && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Revisando contenido… puede tardar unos segundos.
            </p>
          )}

          {outcome && !outcome.skipped && (
            <p className="rounded-md bg-muted p-3 text-sm text-foreground">
              Publicado.
              {outcome.aiTags.length > 0
                ? ` Tags sugeridos: ${outcome.aiTags.join(", ")}.`
                : " Te llevamos a tu artículo…"}
            </p>
          )}

          {busy && (
            <BusyNotice key={busy.id} retryAfter={busy.retryAfter} onRetry={handlePublish} disabled={isPending} />
          )}

          {outcome?.skipped && (
            <p className="rounded-md bg-muted p-3 text-sm text-foreground">
              Publicado sin tags automáticos: la IA no estuvo disponible. Podés agregarlos desde el
              editor.
            </p>
          )}
        </div>

        <DialogFooter>
          {outcome ? (
            <>
              {outcome.skipped && (
                <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                  Seguir editando
                </Button>
              )}
              <Button type="button" onClick={() => onPublished(outcome.postId)}>
                Ver publicación
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={handleDone} disabled={locked}>
                {canPublish ? "Seguir editando" : "Listo"}
              </Button>
              {canPublish && (
                <Button type="button" onClick={handlePublish} disabled={locked}>
                  {isPending && <Loader2 className="animate-spin" aria-hidden />}
                  {isPending ? "Revisando contenido…" : "Publicar"}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
