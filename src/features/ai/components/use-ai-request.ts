"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { callAiRoute, markSuperseded, type AiFeatureName, type AiResult, type AiRoutes } from "./ai-client";

export type AiRunner = <F extends AiFeatureName>(
  feature: F,
  body: AiRoutes[F]["body"],
  signal?: AbortSignal,
) => Promise<AiResult<AiRoutes[F]["data"]>>;

// Runs any AI task in the single in-flight slot; `run` is the JSON-route flavour, the chat
// streams through `runSlot` directly so both share one `busy` flag.
export type AiSlotRunner = <T>(
  task: (signal: AbortSignal) => Promise<AiResult<T>>,
  signal?: AbortSignal,
) => Promise<AiResult<T>>;

// One AI request in flight for the whole editor: a new request aborts the previous one, and
// only the latest one clears `busy`. Owned by PostEditor and shared through props.
export function useAiRequest() {
  const [busy, setBusy] = useState(false);
  const current = useRef<{ id: number; controller: AbortController } | null>(null);
  const counter = useRef(0);

  const runSlot = useCallback(
    async <T>(task: (signal: AbortSignal) => Promise<AiResult<T>>, signal?: AbortSignal) => {
      current.current?.controller.abort();

      const id = ++counter.current;
      const controller = new AbortController();
      current.current = { id, controller };

      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort);
      setBusy(true);

      try {
        const result = await task(controller.signal);
        return markSuperseded(result, signal?.aborted ?? false);
      } finally {
        signal?.removeEventListener("abort", abort);
        if (current.current?.id === id) {
          current.current = null;
          setBusy(false);
        }
      }
    },
    [],
  ) as AiSlotRunner;

  const run = useCallback(
    (feature: AiFeatureName, body: unknown, signal?: AbortSignal) =>
      runSlot((slotSignal) => callAiRoute(feature, body as never, slotSignal), signal),
    [runSlot],
  ) as AiRunner;

  useEffect(
    () => () => {
      current.current?.controller.abort();
    },
    [],
  );

  return { busy, run, runSlot };
}
