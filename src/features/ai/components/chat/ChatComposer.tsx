"use client";

import { useState, type Ref } from "react";
import { SendHorizontal, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CHAT_MAX_USER_CHARS } from "@/features/ai/constants";
import { shouldSubmitOnEnter } from "./chat-state";

interface ChatComposerProps {
  ref?: Ref<HTMLTextAreaElement>;
  // Another AI request holds the single in-flight slot.
  busy: boolean;
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function ChatComposer({ ref, busy, streaming, onSend, onStop }: ChatComposerProps) {
  const [draft, setDraft] = useState("");
  const canSend = !busy && draft.trim().length > 0;

  function submit() {
    if (!canSend) return;
    onSend(draft);
    setDraft("");
  }

  return (
    <form
      className="flex shrink-0 items-end gap-2 border-t border-border/60 px-4 py-3 short:py-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor="ai-chat-input" className="sr-only">
        Mensaje para el asistente
      </label>
      <Textarea
        ref={ref}
        id="ai-chat-input"
        rows={1}
        value={draft}
        maxLength={CHAT_MAX_USER_CHARS}
        placeholder="Preguntale a la IA sobre tu artículo"
        className="max-h-[min(8rem,20svh)] min-h-9 resize-none"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (shouldSubmitOnEnter(event.nativeEvent)) {
            event.preventDefault();
            submit();
          }
        }}
      />
      {streaming ? (
        <Button type="button" size="icon" variant="secondary" aria-label="Detener respuesta" onClick={onStop}>
          <Square />
        </Button>
      ) : (
        <Button type="submit" size="icon" disabled={!canSend} aria-label="Enviar mensaje">
          <SendHorizontal />
        </Button>
      )}
    </form>
  );
}
