"use client";

import { useActionState, useState } from "react";
import { createNote, type CreateNoteState } from "@/features/posts/actions";
import { NOTE_MAX_LENGTH } from "@/features/posts/constants";
import { useModerationScan } from "@/features/moderation/use-moderation-scan";

export const NOTE_COUNTER_THRESHOLD = 50;

export function useNoteForm(onPublished?: () => void) {
  const [content, setContent] = useState("");

  const [state, formAction, isPending] = useActionState(
    async (previous: CreateNoteState, formData: FormData) => {
      const result = await createNote(previous, formData);
      if (result?.ok) {
        setContent("");
        onPublished?.();
      }
      return result;
    },
    undefined,
  );

  const moderation = useModerationScan("", content);
  const remaining = NOTE_MAX_LENGTH - content.length;

  return {
    content,
    setContent,
    state,
    formAction,
    isPending,
    remaining,
    showCounter: remaining <= NOTE_COUNTER_THRESHOLD,
    canSubmit: content.trim().length > 0 && !isPending && !moderation.blocked,
    moderation,
  };
}
