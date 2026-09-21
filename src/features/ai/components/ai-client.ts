import { SUPERSEDED_MESSAGE, type ClientAiError } from "./ai-ui";
import type { OutlineData, ScoreData, TitlesData, ToneData } from "@/features/ai/handlers.server";
import type { Tone } from "@/features/ai/schemas";

export type AiRoutes = {
  outline: { body: { topic: string }; data: OutlineData };
  titles: { body: { postId: string; regenerate?: boolean }; data: TitlesData };
  tone: { body: { postId: string; tone: Tone }; data: ToneData };
  score: { body: { postId: string; regenerate?: boolean }; data: ScoreData };
};

export type AiFeatureName = keyof AiRoutes;

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: ClientAiError };

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export const UNAVAILABLE: ClientAiError = {
  kind: "unavailable",
  message: "La IA no está disponible en este momento. Intentá de nuevo en un rato.",
};

export function isTypedError(value: unknown): value is ClientAiError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ClientAiError).kind === "string" &&
    typeof (value as ClientAiError).message === "string"
  );
}

// Only the caller knows whether an abort was its own (closing a dialog) or came from another
// feature taking over the single in-flight slot. The latter must surface as a visible error.
export function markSuperseded<T>(result: AiResult<T>, callerAborted: boolean): AiResult<T> {
  if (!result.ok && result.error.kind === "aborted" && !callerAborted) {
    return { ok: false, error: { kind: "superseded", message: SUPERSEDED_MESSAGE } };
  }
  return result;
}

export function isAbort(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

// Never throws: every failure (network, non-JSON, unexpected shape, abort) becomes a typed
// error so a broken AI call can never crash the editor.
export async function callAiRoute<F extends AiFeatureName>(
  feature: F,
  body: AiRoutes[F]["body"],
  signal?: AbortSignal,
  fetcher: Fetcher = (input, init) => fetch(input, init),
): Promise<AiResult<AiRoutes[F]["data"]>> {
  let response: Response;
  try {
    response = await fetcher(`/api/ai/${feature}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });
  } catch (error) {
    if (isAbort(error)) {
      return { ok: false, error: { kind: "aborted", message: "Solicitud cancelada." } };
    }
    return { ok: false, error: UNAVAILABLE };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }

  if (typeof payload === "object" && payload !== null) {
    const { ok, data, error } = payload as { ok?: unknown; data?: unknown; error?: unknown };
    if (ok === true && data !== undefined) {
      return { ok: true, data: data as AiRoutes[F]["data"] };
    }
    if (ok === false && isTypedError(error)) {
      return { ok: false, error };
    }
  }

  return { ok: false, error: UNAVAILABLE };
}
