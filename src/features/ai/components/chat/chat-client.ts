import type { ArticleAnalysis, ChatStep, EditAction } from "@/features/ai/schemas";
import { createNdjsonParser } from "@/features/ai/stream-protocol";
import type { ChatMessage } from "@/features/ai/types";
import type { ChatRequestContext } from "@/features/posts/components/editor/editor-context";
import { UNAVAILABLE, isAbort, isTypedError, type AiResult, type Fetcher } from "../ai-client";
import type { ClientAiError } from "../ai-ui";

export type ChatRequestBody = ChatRequestContext & { messages: ChatMessage[] };

export type ChatStreamHandlers = {
  onDelta: (text: string) => void;
  onStep?: (step: ChatStep) => void;
  onAction?: (action: EditAction) => void;
  onAnalysis?: (analysis: ArticleAnalysis) => void;
};

const ABORTED: ClientAiError = { kind: "aborted", message: "Solicitud cancelada." };

const fail = (error: ClientAiError): AiResult<null> => ({ ok: false, error });

async function readJsonError(response: Response): Promise<AiResult<null>> {
  try {
    const { ok, error } = (await response.json()) as { ok?: unknown; error?: unknown };
    if (ok === false && isTypedError(error)) {
      return fail(error);
    }
  } catch {
    // Not JSON: falls through to the generic error.
  }
  return fail(UNAVAILABLE);
}

async function readStream(body: ReadableStream<Uint8Array>, handlers: ChatStreamHandlers): Promise<AiResult<null>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createNdjsonParser();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      const events = done ? parser.flush() : parser.push(decoder.decode(value, { stream: true }));

      for (const event of events) {
        if (event.type === "delta") handlers.onDelta(event.text);
        else if (event.type === "step") handlers.onStep?.(event.step);
        else if (event.type === "action") handlers.onAction?.(event.action);
        else if (event.type === "analysis") handlers.onAnalysis?.(event.analysis);
        else if (event.type === "error") return fail(event.error);
        else return { ok: true, data: null };
      }

      // The connection closed without `done`: the answer was cut short.
      if (done) return fail(UNAVAILABLE);
    }
  } catch (error) {
    return fail(isAbort(error) ? ABORTED : UNAVAILABLE);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

// Never throws (same contract as `callAiRoute`): pre-stream failures arrive as one JSON body,
// everything else as NDJSON lines, and the content type tells the two apart.
export async function streamChat(
  body: ChatRequestBody,
  {
    signal,
    fetcher = (input, init) => fetch(input, init),
    ...handlers
  }: ChatStreamHandlers & { signal?: AbortSignal; fetcher?: Fetcher },
): Promise<AiResult<null>> {
  let response: Response;
  try {
    response = await fetcher("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });
  } catch (error) {
    return fail(isAbort(error) ? ABORTED : UNAVAILABLE);
  }

  const isStream = /^application\/x-ndjson/i.test(response.headers.get("content-type") ?? "");
  if (!isStream || !response.body) {
    return readJsonError(response);
  }

  return readStream(response.body, handlers);
}
