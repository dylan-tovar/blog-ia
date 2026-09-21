"use client";

import { useEffect, useRef, type ReactNode, type Ref } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AI_DRAWER_ID } from "./ai-drawer";
import { ChatComposer } from "./ChatComposer";
import type { ApplyOutcome } from "@/features/posts/components/editor/apply-action";
import { ChatMessages } from "./ChatMessages";
import type { InsertTarget } from "./chat-state";
import type { useChat } from "./use-chat";
import { useAutoScroll } from "./use-auto-scroll";

interface AiChatDrawerProps {
  ref?: Ref<HTMLElement>;
  open: boolean;
  onClose: () => void;
  quickActions: ReactNode;
  welcomeGrid?: ReactNode;
  // Analysis section rendered inside the scroll body (ScorePanel); null when closed.
  analysis?: ReactNode;
  chat: ReturnType<typeof useChat>;
  // Another AI request (a quick action) holds the single in-flight slot.
  busy: boolean;
  onInsertToEditor?: (text: string, target: InsertTarget) => ApplyOutcome;
  // The author has a cursor in the article, so "insert at cursor" makes sense.
  canInsertAtCursor?: boolean;
}

// Outer width animates; the inner box keeps the final width so content never reflows mid-transition.
const DRAWER_WIDTH = "w-[clamp(24rem,32vw,34rem)]";

export function AiChatDrawer({
  ref,
  open,
  onClose,
  quickActions,
  welcomeGrid,
  analysis,
  chat,
  busy,
  onInsertToEditor,
  canInsertAtCursor,
}: AiChatDrawerProps) {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const wasOpen = useRef(open);
  const { ref: scrollRef, onScroll } = useAutoScroll(chat.entries);

  useEffect(() => {
    if (open && !wasOpen.current) {
      composerRef.current?.focus({ preventScroll: true });
    }
    wasOpen.current = open;
  }, [open]);

  return (
    <aside
      ref={ref}
      id={AI_DRAWER_ID}
      aria-label="Asistente de IA"
      inert={!open}
      className={cn(
        "sticky top-(--editor-header-h) h-[calc(100svh-var(--editor-header-h))] shrink-0 self-start overflow-hidden border-l border-border/60 bg-background transition-[width] duration-200 ease-out motion-reduce:transition-none",
        open ? DRAWER_WIDTH : "w-0 border-l-0",
      )}
    >
      <div className={cn("flex h-full flex-col", DRAWER_WIDTH)}>
        <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Asistente de IA</h2>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Cerrar asistente" onClick={onClose}>
            <X />
          </Button>
        </div>

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex min-h-24 flex-1 flex-col gap-3 overflow-y-auto p-4"
        >
          {analysis}
          <ChatMessages
            entries={chat.entries}
            streaming={chat.streaming}
            busy={busy}
            onSend={chat.send}
            onRetry={chat.retry}
            welcomeGrid={welcomeGrid}
            onInsertToEditor={onInsertToEditor}
            canInsertAtCursor={canInsertAtCursor}
            onApplyAction={chat.applyAction}
            onApplyAll={chat.applyAll}
            onDiscardAction={chat.discardAction}
            onUndoAction={chat.undoAction}
          />
        </div>

        {quickActions}

        <ChatComposer ref={composerRef} busy={busy} streaming={chat.streaming} onSend={chat.send} onStop={chat.stop} />

        <p role="note" className="shrink-0 px-4 pb-3 text-xs text-muted-foreground short:pb-2">
          El texto se envía a Google Gemini. En la capa gratuita, Google puede usarlo para mejorar sus productos.
        </p>
      </div>
    </aside>
  );
}
