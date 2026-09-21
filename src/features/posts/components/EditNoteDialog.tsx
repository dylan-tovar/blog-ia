"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_MAX_LENGTH } from "@/features/posts/constants";
import { updateNote } from "@/features/posts/actions";
import { useVisualViewportStyle } from "@/hooks/use-visual-viewport-style";
import { cn } from "@/lib/utils";

interface EditNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
  initialContent: string;
  authorName?: string | null;
  onEdited?: (newContent: string) => void;
}

export function EditNoteDialog({
  open,
  onOpenChange,
  postId,
  initialContent,
  authorName,
  onEdited,
}: EditNoteDialogProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const viewportStyle = useVisualViewportStyle(open);

  const trimmed = content.trim();
  const remaining = NOTE_MAX_LENGTH - content.length;
  const showCounter = remaining <= 50;
  const canSubmit = trimmed.length > 0 && remaining >= 0 && !isPending;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    startTransition(async () => {
      const result = await updateNote(postId, content);
      if (result.ok) {
        onOpenChange(false);
        router.refresh();
        onEdited?.(trimmed);
      } else {
        setError(result.error ?? "No pudimos actualizar la nota.");
      }
    });
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) {
      setContent(initialContent);
    } else {
      setError(null);
      setContent(initialContent);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        style={viewportStyle}
        className={cn(
          "flex flex-col gap-3 p-4 sm:max-w-none md:max-w-lg md:rounded-2xl",
          "max-md:inset-x-0 max-md:top-[var(--vvt,0px)] max-md:h-[var(--vvh,100dvh)] max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:ring-0",
          "max-md:pt-[max(1rem,env(safe-area-inset-top))] max-md:pb-[max(1rem,env(safe-area-inset-bottom))]",
        )}
      >
        <DialogTitle className="sr-only">Editar nota</DialogTitle>
        <DialogDescription className="sr-only">
          Modificá tu nota de hasta {NOTE_MAX_LENGTH} caracteres.
        </DialogDescription>

        <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="grid min-h-0 flex-1 grid-cols-[auto_1fr] gap-x-3">
            <UserAvatar name={authorName ?? null} />
            <div className="flex min-h-0 flex-col">
              <p className="min-h-8 truncate text-base leading-8 font-medium text-foreground">
                {authorName ?? "Tu nota"}
              </p>
              <Textarea
                name="content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="¿Qué estás pensando?"
                aria-label="Texto de la nota"
                maxLength={NOTE_MAX_LENGTH}
                autoFocus
                className="max-h-[50dvh] min-h-32 resize-none border-0 bg-transparent px-0 py-1 text-base md:text-base shadow-none focus-visible:ring-0 max-md:max-h-none max-md:flex-1 max-md:field-sizing-fixed dark:bg-transparent"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <span
              className={cn(
                "mr-auto text-xs tabular-nums text-muted-foreground",
                !showCounter && "invisible",
                showCounter && "text-amber-400",
                remaining === 0 && "text-destructive",
              )}
              aria-live={showCounter ? "polite" : "off"}
            >
              {remaining}
            </span>
            <DialogClose render={<Button type="button" variant="secondary" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={!canSubmit} className="min-w-24">
              {isPending && <Loader2 className="animate-spin" aria-hidden />}
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
