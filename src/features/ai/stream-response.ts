import { mapGeminiError } from "./errors";
import { respondJson, toErrorBody } from "./route-helpers";
import { NDJSON_CONTENT_TYPE, encodeStreamEvent, type ChatStreamEvent } from "./stream-protocol";
import type { ChatStreamPart } from "./types";

type StreamAiResponseOptions = {
  requestSignal: AbortSignal;
  // Runs before the stream exists so a rejection can still be answered as plain JSON.
  rateLimit: () => Promise<void>;
  source: (signal: AbortSignal) => AsyncIterable<ChatStreamPart>;
};

function toEvent(part: ChatStreamPart): ChatStreamEvent {
  switch (part.kind) {
    case "text":
      return { type: "delta", text: part.text };
    case "step":
      return { type: "step", step: part.step };
    case "action":
      return { type: "action", action: part.action };
    case "analysis":
      return { type: "analysis", analysis: part.analysis };
  }
}

function toErrorEvent(error: unknown): ChatStreamEvent {
  const { kind, message, retryAfter, scope } = mapGeminiError(error);
  return {
    type: "error",
    error: {
      kind,
      message,
      ...(retryAfter !== undefined ? { retryAfter } : {}),
      ...(scope !== undefined ? { scope } : {}),
    },
  };
}

// Pull-based on purpose: the source is only advanced while the client keeps reading, and a
// cancel (client closed the connection) aborts the upstream call instead of leaving it running.
function ndjsonStream(source: StreamAiResponseOptions["source"], requestSignal: AbortSignal) {
  const cancelController = new AbortController();
  const signal = AbortSignal.any([requestSignal, cancelController.signal]);
  const encoder = new TextEncoder();
  let iterator: AsyncIterator<ChatStreamPart> | undefined;
  let cancelled = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const send = (event: ChatStreamEvent) => controller.enqueue(encoder.encode(encodeStreamEvent(event)));

      try {
        iterator ??= source(signal)[Symbol.asyncIterator]();
        const next = await iterator.next();
        if (cancelled) return;

        if (next.done) {
          send({ type: "done" });
          controller.close();
        } else {
          send(toEvent(next.value));
        }
      } catch (error) {
        if (cancelled) return;
        // Nobody is listening if the request itself was aborted.
        if (!signal.aborted) send(toErrorEvent(error));
        controller.close();
      }
    },
    cancel() {
      cancelled = true;
      cancelController.abort();
      void iterator?.return?.().catch(() => undefined);
    },
  });
}

export async function streamAiResponse({ requestSignal, rateLimit, source }: StreamAiResponseOptions) {
  try {
    await rateLimit();
  } catch (error) {
    return respondJson(toErrorBody(mapGeminiError(error)));
  }

  return new Response(ndjsonStream(source, requestSignal), {
    headers: { "Content-Type": NDJSON_CONTENT_TYPE, "Cache-Control": "no-store" },
  });
}
