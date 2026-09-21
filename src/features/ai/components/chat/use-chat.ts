"use client";

import { useCallback, useRef, useState } from "react";
import { toRequestContext, type EditorBridge } from "@/features/posts/components/editor/editor-context";
import type { AiSlotRunner } from "../use-ai-request";
import { streamChat } from "./chat-client";
import {
  addAction,
  advancePlan,
  appendDelta,
  applicableActions,
  applyFailureNotice,
  dropFailedReply,
  finishPlan,
  markApplied,
  markDiscarded,
  markError,
  markStale,
  markUndoFailed,
  markUndone,
  setAnalysis,
  settleReply,
  startPlan,
  toRequestMessages,
  upsertStep,
  type ChatEntry,
} from "./chat-state";

interface UseChatOptions {
  runSlot: AiSlotRunner;
  // Another AI request (quick action or this chat) holds the single in-flight slot.
  busy: boolean;
  bridge: EditorBridge;
}

function findAction(entries: ChatEntry[], replyId: string, actionId: string) {
  const entry = entries.find(({ id }) => id === replyId);
  return entry?.actions?.find(({ id }) => id === actionId);
}

// In-memory only: the conversation is lost on reload by design.
export function useChat({ runSlot, busy, bridge }: UseChatOptions) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const stopController = useRef<AbortController | null>(null);
  const counter = useRef(0);

  const stream = useCallback(
    async (history: ChatEntry[]) => {
      const replyId = `reply-${++counter.current}`;
      const stop = new AbortController();
      stopController.current = stop;
      setEntries([...history, { id: replyId, role: "assistant", content: "", createdAt: Date.now(), streaming: true }]);

      // Read at send time so the answer reflects what the author just typed or selected.
      const snapshot = bridge.getSnapshot();

      const result = await runSlot(
        (signal) =>
          streamChat(
            { ...toRequestContext(snapshot), messages: toRequestMessages(history) },
            {
              onDelta: (text) => setEntries((current) => appendDelta(current, replyId, text)),
              onStep: (step) => setEntries((current) => startPlan(upsertStep(current, replyId, step), replyId)),
              // Each proposal keeps the snapshot it was made against: that is what staleness is judged from.
              onAction: (action) => setEntries((current) => advancePlan(addAction(current, replyId, action, snapshot), replyId)),
              onAnalysis: (analysis) => setEntries((current) => setAnalysis(current, replyId, analysis)),
              signal,
            },
          ),
        stop.signal,
      );

      if (stopController.current === stop) stopController.current = null;
      setEntries((current) => finishPlan(settleReply(current, replyId, result), replyId));
    },
    [runSlot, bridge],
  );

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || busy) return;

      void stream([...entries, { id: `user-${++counter.current}`, role: "user", content, createdAt: Date.now() }]);
    },
    [busy, entries, stream],
  );

  const retry = useCallback(() => {
    const history = dropFailedReply(entries);
    if (busy || history.at(-1)?.role !== "user") return;

    void stream(history);
  }, [busy, entries, stream]);

  const stop = useCallback(() => stopController.current?.abort(), []);

  // The editor is touched here, outside any state updater, so a re-render can never apply a change twice.
  const applyIn = useCallback(
    (current: ChatEntry[], replyId: string, actionId: string): ChatEntry[] => {
      const state = findAction(current, replyId, actionId);
      if (!state || (state.status !== "pending" && state.status !== "error")) return current;

      const outcome = bridge.apply(state.action, state.snapshot);
      if (outcome.ok) return markApplied(current, replyId, actionId, outcome.undo);
      return outcome.reason === "stale"
        ? markStale(current, replyId, actionId, applyFailureNotice(state, outcome.message))
        : markError(current, replyId, actionId, outcome.message);
    },
    [bridge],
  );

  const applyAction = useCallback(
    (replyId: string, actionId: string) => setEntries(applyIn(entries, replyId, actionId)),
    [applyIn, entries],
  );

  const applyAll = useCallback(
    (replyId: string) => {
      const entry = entries.find(({ id }) => id === replyId);
      if (!entry) return;

      setEntries(applicableActions(entry).reduce((current, { id }) => applyIn(current, replyId, id), entries));
    },
    [applyIn, entries],
  );

  const discardAction = useCallback(
    (replyId: string, actionId: string) => setEntries((current) => markDiscarded(current, replyId, actionId)),
    [],
  );

  const undoAction = useCallback(
    (replyId: string, actionId: string) => {
      const token = findAction(entries, replyId, actionId)?.undo;
      if (!token) return;

      const outcome = bridge.undo(token);
      setEntries(outcome.ok ? markUndone(entries, replyId, actionId) : markUndoFailed(entries, replyId, actionId, outcome.message));
    },
    [bridge, entries],
  );

  return {
    entries,
    streaming: entries.some((entry) => entry.streaming),
    send,
    retry,
    stop,
    applyAction,
    applyAll,
    discardAction,
    undoAction,
  };
}
