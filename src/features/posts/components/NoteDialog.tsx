"use client";

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
import { useNoteForm } from "@/features/posts/components/use-note-form";
import { useVisualViewportStyle } from "@/hooks/use-visual-viewport-style";
import { cn } from "@/lib/utils";

interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewerName: string | null;
}

// The form lives inside DialogContent, which unmounts on close, so its state resets every time.
function NoteForm({ viewerName, onPublished }: { viewerName: string | null; onPublished: () => void }) {
  const { content, setContent, state, formAction, isPending, remaining, showCounter, canSubmit } =
    useNoteForm(onPublished);

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid min-h-0 flex-1 grid-cols-[auto_1fr] gap-x-3">
        <UserAvatar name={viewerName} />
        <div className="flex min-h-0 flex-col">
          <p className="min-h-8 truncate text-base leading-8 font-medium text-foreground">
            {viewerName ?? "Tu nota"}
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

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
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
        <DialogClose render={<Button type="button" variant="secondary" />}>Cancelar</DialogClose>
        <Button type="submit" disabled={!canSubmit} className="min-w-24">
          {isPending && <Loader2 className="animate-spin" aria-hidden />}
          Publicar
        </Button>
      </div>
    </form>
  );
}

export function NoteDialog({ open, onOpenChange, viewerName }: NoteDialogProps) {
  const viewportStyle = useVisualViewportStyle(open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        style={viewportStyle}
        className={cn(
          "flex flex-col gap-3 p-4 sm:max-w-none md:max-w-lg md:rounded-2xl",
          "max-md:inset-x-0 max-md:top-[var(--vvt,0px)] max-md:h-[var(--vvh,100dvh)] max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:ring-0",
          "max-md:pt-[max(1rem,env(safe-area-inset-top))] max-md:pb-[max(1rem,env(safe-area-inset-bottom))]",
        )}
      >
        <DialogTitle className="sr-only">Nueva nota</DialogTitle>
        <DialogDescription className="sr-only">
          Publicá una nota corta de hasta {NOTE_MAX_LENGTH} caracteres.
        </DialogDescription>
        <NoteForm viewerName={viewerName} onPublished={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
