"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, MessageSquareQuote, Sparkles } from "lucide-react";
import type { ApplyOutcome } from "@/features/posts/components/editor/apply-action";
import { ChatMessage } from "./ChatMessage";
import type { ChatEntry, InsertTarget } from "./chat-state";

const SUGGESTED_PROMPTS = [
  "¿Cómo puedo mejorar la introducción?",
  "¿Qué partes del artículo son confusas?",
  "Sugerime ideas para el cierre",
];

interface ChatMessagesProps {
  entries: ChatEntry[];
  streaming: boolean;
  busy: boolean;
  onSend: (text: string) => void;
  onRetry: () => void;
  welcomeGrid?: ReactNode;
  onInsertToEditor?: (text: string, target: InsertTarget) => ApplyOutcome;
  canInsertAtCursor?: boolean;
  onApplyAction: (replyId: string, actionId: string) => void;
  onApplyAll: (replyId: string) => void;
  onDiscardAction: (replyId: string, actionId: string) => void;
  onUndoAction: (replyId: string, actionId: string) => void;
}

function EmptyState({
  busy,
  onSend,
  welcomeGrid,
}: Pick<ChatMessagesProps, "busy" | "onSend" | "welcomeGrid">) {
  return (
    <div className="flex flex-col gap-5 py-1">
      {/* Welcome header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="size-4 text-primary" />
          <span>Asistente de Redacción</span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Optimizá tu publicación con herramientas editoriales o chateá directamente con la IA.
        </p>
      </div>

      {/* Tools Grid */}
      {welcomeGrid && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Herramientas del artículo
          </span>
          {welcomeGrid}
        </div>
      )}

      {/* Suggested chat prompts */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          <MessageSquareQuote className="size-3 text-primary/80" />
          <span>Consultas sugeridas</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="group flex items-center justify-between rounded-lg border border-border/70 bg-card/50 p-2.5 text-left text-xs text-foreground/90 transition-all hover:border-primary/40 hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-50"
              disabled={busy}
              onClick={() => onSend(prompt)}
            >
              <span>{prompt}</span>
              <ArrowUpRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// The live region stays mounted (empty) so the first answer is announced too.
export function ChatMessages({
  entries,
  streaming,
  busy,
  onSend,
  onRetry,
  welcomeGrid,
  onInsertToEditor,
  canInsertAtCursor,
  onApplyAction,
  onApplyAll,
  onDiscardAction,
  onUndoAction,
}: ChatMessagesProps) {
  return (
    <div className="flex flex-col gap-3">
      {entries.length === 0 && (
        <EmptyState busy={busy} onSend={onSend} welcomeGrid={welcomeGrid} />
      )}

      <div aria-live="polite" aria-busy={streaming} className="flex flex-col gap-3 empty:hidden">
        {entries.map((entry, index) => (
          <ChatMessage
            key={entry.id}
            entry={entry}
            onRetry={index === entries.length - 1 ? onRetry : undefined}
            retryDisabled={busy}
            onInsert={onInsertToEditor}
            canInsertAtCursor={canInsertAtCursor}
            onApplyAction={(actionId) => onApplyAction(entry.id, actionId)}
            onApplyAll={() => onApplyAll(entry.id)}
            onDiscardAction={(actionId) => onDiscardAction(entry.id, actionId)}
            onUndoAction={(actionId) => onUndoAction(entry.id, actionId)}
          />
        ))}
      </div>
    </div>
  );
}
