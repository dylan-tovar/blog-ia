"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
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
import { useNoteForm } from "@/features/posts/components/use-note-form";
import { ModerationDetails } from "@/features/moderation/components/ModerationNotice";
import { useVisualViewportStyle } from "@/hooks/use-visual-viewport-style";
import { cn } from "@/lib/utils";

interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewerName: string | null;
  avatarUrl: string | null;
}

// The form lives inside DialogContent, which unmounts on close, so its state resets every time.
function NoteForm({
  viewerName,
  avatarUrl,
  onPublished,
}: {
  viewerName: string | null;
  avatarUrl: string | null;
  onPublished: () => void;
}) {
  const { content, setContent, state, formAction, isPending, remaining, showCounter, canSubmit, moderation } =
    useNoteForm(onPublished);

  const [hasAcknowledgedWarning, setHasAcknowledgedWarning] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (moderation.leve > 0 && !hasAcknowledgedWarning) {
      event.preventDefault();
      setHasAcknowledgedWarning(true);
      return;
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-border px-2 py-2 max-md:pt-[max(0.5rem,env(safe-area-inset-top))]">
        <DialogClose
          render={<Button type="button" variant="ghost" size="icon-lg" aria-label="Cerrar" />}
        >
          <X />
        </DialogClose>
        <DialogTitle className="flex-1 text-center text-base font-semibold text-foreground">
          Nueva nota
        </DialogTitle>
        <Button type="submit" size="sm" disabled={!canSubmit} className="min-w-20 min-h-9">
          {isPending && <Loader2 className="animate-spin" aria-hidden />}
          {hasAcknowledgedWarning ? "Sí, publicar" : "Publicar"}
        </Button>
      </div>

      <DialogDescription className="sr-only">
        Publicá una nota corta de hasta {NOTE_MAX_LENGTH} caracteres.
      </DialogDescription>

      <div className="grid min-h-0 flex-1 grid-cols-[auto_1fr] gap-x-3 px-4 pt-5">
        <UserAvatar name={viewerName} avatarUrl={avatarUrl} />
        <div className="flex min-h-0 flex-col">
          <p className="min-h-8 truncate text-base leading-8 font-medium text-foreground">
            {viewerName ?? "Tu nota"}
          </p>
          <Textarea
            name="content"
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setHasAcknowledgedWarning(false);
            }}
            placeholder="¿Qué estás pensando?"
            aria-label="Texto de la nota"
            maxLength={NOTE_MAX_LENGTH}
            autoFocus
            className="max-h-[50dvh] min-h-32 resize-none border-0 bg-transparent px-0 py-1 text-base md:text-base shadow-none focus-visible:ring-0 max-md:max-h-none max-md:flex-1 max-md:field-sizing-fixed dark:bg-transparent"
          />
        </div>
      </div>

      {moderation.matches.length > 0 && (
        <ModerationDetails summary={moderation} />
      )}

      {state?.error && (
        <p role="alert" className="px-4 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end px-4 pt-1 pb-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <span
          className={cn(
            "text-xs tabular-nums text-muted-foreground",
            !showCounter && "invisible",
            showCounter && "text-amber-400",
            remaining === 0 && "text-destructive",
          )}
          aria-live={showCounter ? "polite" : "off"}
        >
          {remaining}
        </span>
      </div>
    </form>
  );
}

export function NoteDialog({ open, onOpenChange, viewerName, avatarUrl }: NoteDialogProps) {
  const viewportStyle = useVisualViewportStyle(open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        style={viewportStyle}
        className={cn(
          "flex flex-col gap-0 p-0 sm:max-w-none md:max-w-lg md:rounded-2xl",
          "max-md:inset-x-0 max-md:top-[var(--vvt,0px)] max-md:h-[var(--vvh,100dvh)] max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:ring-0",
        )}
      >
        <NoteForm viewerName={viewerName} avatarUrl={avatarUrl} onPublished={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
