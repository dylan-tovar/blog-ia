"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_MAX_LENGTH } from "@/features/posts/constants";
import { useNoteForm } from "@/features/posts/components/use-note-form";
import { ModerationDetails } from "@/features/moderation/components/ModerationNotice";
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
  const [hasAcknowledgedWarning, setHasAcknowledgedWarning] = useState(false);

  const { content, setContent, state, formAction, isPending, remaining, showCounter, canSubmit, moderation } =
    useNoteForm(() => {
      setHasAcknowledgedWarning(false);
      onPublished?.();
    });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (moderation.leve > 0 && !hasAcknowledgedWarning) {
      event.preventDefault();
      setHasAcknowledgedWarning(true);
      return;
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-2">
      {parentPostId && <input type="hidden" name="parentPostId" value={parentPostId} />}
      {replyToPostId && <input type="hidden" name="replyToPostId" value={replyToPostId} />}
      <Textarea
        name="content"
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          setHasAcknowledgedWarning(false);
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={NOTE_MAX_LENGTH}
        rows={3}
        className="resize-none"
      />
      {moderation.matches.length > 0 && (
        <ModerationDetails summary={moderation} />
      )}
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
          {hasAcknowledgedWarning ? "Sí, publicar" : "Publicar"}
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
