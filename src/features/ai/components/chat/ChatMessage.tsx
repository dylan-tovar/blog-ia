"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Check, Copy, CornerDownRight, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { Message, MessageAvatar, MessageContent, MessageFooter } from "@/components/ui/message";
import type { ApplyOutcome } from "@/features/posts/components/editor/apply-action";
import { MarkdownContent } from "@/features/posts/components/MarkdownContent";
import { AiErrorMessage } from "../AiErrorMessage";
import { ActionCard } from "./ActionCard";
import {
  applicableActions,
  cleanChatContent,
  formatMessageTime,
  isInsertableContent,
  shouldShowSteps,
  type ChatEntry,
  type InsertTarget,
} from "./chat-state";
import { StepsList } from "./StepsList";
import { AnalysisCard } from "./AnalysisCard";

interface ChatMessageProps {
  entry: ChatEntry;
  onRetry?: () => void;
  retryDisabled?: boolean;
  // Manual insertion of the whole message, through the same engine as the proposals.
  onInsert?: (text: string, target: InsertTarget) => ApplyOutcome;
  // Only offered when the author has a cursor in the article.
  canInsertAtCursor?: boolean;
  onApplyAction: (actionId: string) => void;
  onApplyAll: () => void;
  onDiscardAction: (actionId: string) => void;
  onUndoAction: (actionId: string) => void;
}

const COPIED_MS = 2000;
const ENTER_ANIMATION = "animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <Button type="button" variant="ghost" size="xs" className="h-6 gap-1 px-2 text-muted-foreground hover:text-foreground" onClick={copy}>
      {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
      <span>{copied ? "Copiado" : "Copiar"}</span>
    </Button>
  );
}

function InsertButtons({
  onInsert,
  text,
  canInsertAtCursor,
}: {
  onInsert: (text: string, target: InsertTarget) => ApplyOutcome;
  text: string;
  canInsertAtCursor: boolean;
}) {
  const [inserted, setInserted] = useState<InsertTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function handleInsert(target: InsertTarget) {
    const outcome = onInsert(text, target);
    clearTimeout(timer.current);

    if (!outcome.ok) {
      setInserted(null);
      setError(outcome.message);
      return;
    }

    setError(null);
    setInserted(target);
    timer.current = setTimeout(() => setInserted(null), COPIED_MS);
  }

  const buttons: { target: InsertTarget; label: string; done: string; icon: typeof CornerDownRight }[] = [
    ...(canInsertAtCursor ? [{ target: "cursor" as const, label: "Insertar en cursor", done: "Insertado", icon: CornerDownRight }] : []),
    { target: "end", label: "Insertar al final", done: "Insertado", icon: ArrowDownToLine },
  ];

  return (
    <>
      {buttons.map(({ target, label, done, icon: Icon }) => (
        <Button
          key={target}
          type="button"
          variant="ghost"
          size="xs"
          className="h-6 gap-1 px-2 text-muted-foreground hover:text-foreground"
          onClick={() => handleInsert(target)}
        >
          {inserted === target ? <Check className="size-3 text-emerald-500" /> : <Icon className="size-3" />}
          <span>{inserted === target ? done : label}</span>
        </Button>
      ))}
      {error && (
        <p role="alert" className="basis-full text-xs text-destructive [overflow-wrap:anywhere]">
          {error}
        </p>
      )}
    </>
  );
}

export function ChatMessage({
  entry,
  onRetry,
  retryDisabled,
  onInsert,
  canInsertAtCursor = false,
  onApplyAction,
  onApplyAll,
  onDiscardAction,
  onUndoAction,
}: ChatMessageProps) {
  if (entry.role === "user") {
    return (
      <Message align="end" className={ENTER_ANIMATION}>
        <MessageContent>
          <Bubble>
            <BubbleContent className="whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.content}</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  }

  const thinking = entry.streaming && !entry.content && (!entry.steps || entry.steps.length === 0);
  const applicable = applicableActions(entry);
  const cleanedContent = cleanChatContent(entry.content);

  return (
    <Message className={ENTER_ANIMATION}>
      <MessageAvatar className="min-w-6 self-start bg-transparent group-has-data-[slot=message-footer]/message:translate-y-0">
        <Avatar size="sm">
          <AvatarFallback>
            <Sparkles className="size-3.5" />
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>

      <MessageContent>
        {thinking && (
          <Marker className="min-h-6">
            <MarkerContent className="shimmer">Pensando…</MarkerContent>
          </Marker>
        )}

        {shouldShowSteps(entry) && <StepsList steps={entry.steps ?? []} streaming={Boolean(entry.streaming)} />}

        {entry.content && (
          <Bubble variant="ghost">
            <BubbleContent>
              <MarkdownContent className="text-sm prose-sm">{cleanedContent}</MarkdownContent>
              {entry.streaming && (
                <span
                  aria-hidden="true"
                  className="mt-1 inline-block h-4 w-1.5 animate-pulse bg-foreground/70 motion-reduce:animate-none"
                />
              )}
            </BubbleContent>
          </Bubble>
        )}

        {entry.analysis && <AnalysisCard analysis={entry.analysis} />}

        {entry.actions && entry.actions.length > 0 && (
          <div className="flex min-w-0 flex-col gap-2">
            {entry.actions.map((state) => (
              <ActionCard
                key={state.id}
                state={state}
                streaming={Boolean(entry.streaming)}
                onApply={() => onApplyAction(state.id)}
                onDiscard={() => onDiscardAction(state.id)}
                onUndo={() => onUndoAction(state.id)}
              />
            ))}
            {applicable.length > 1 && (
              <Button type="button" size="sm" variant="secondary" className="w-fit" onClick={onApplyAll}>
                <Check aria-hidden="true" />
                <span>Aplicar todo ({applicable.length})</span>
              </Button>
            )}
          </div>
        )}

        {entry.error && <AiErrorMessage error={entry.error} onRetry={onRetry} disabled={retryDisabled} />}

        {!entry.streaming && entry.content && (
          <MessageFooter className="justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <CopyButton text={cleanedContent} />
              {onInsert && isInsertableContent(entry) && (
                <InsertButtons onInsert={onInsert} text={cleanedContent} canInsertAtCursor={canInsertAtCursor} />
              )}
            </div>
            <time dateTime={new Date(entry.createdAt).toISOString()} className="tabular-nums">
              {formatMessageTime(entry.createdAt)}
            </time>
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  );
}
