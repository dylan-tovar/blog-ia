"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_MAX_LENGTH } from "@/features/posts/constants";
import { useNoteForm } from "@/features/posts/components/use-note-form";
import { cn } from "@/lib/utils";

interface NoteComposerProps {
  parentPostId?: string;
  replyToPostId?: string;
  placeholder?: string;
  onPublished?: () => void;
}

export function NoteComposer({
  parentPostId,
  replyToPostId,
  placeholder = "Escribí una nota…",
  onPublished,
}: NoteComposerProps) {
  const { content, setContent, state, formAction, isPending, remaining, showCounter, canSubmit } =
    useNoteForm(onPublished);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {parentPostId && <input type="hidden" name="parentPostId" value={parentPostId} />}
      {replyToPostId && <input type="hidden" name="replyToPostId" value={replyToPostId} />}
      <Textarea
        name="content"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={NOTE_MAX_LENGTH}
        rows={3}
        className="resize-none"
      />
      <div className="flex items-center justify-between gap-3">
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
        <Button type="submit" disabled={!canSubmit} className="min-w-24">
          {isPending && <Loader2 className="animate-spin" aria-hidden />}
          Publicar
        </Button>
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
