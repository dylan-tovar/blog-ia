import type { AiError, AiErrorKind } from "./errors";

export const MAX_AI_BODY_BYTES = 200_000;

export type RouteErrorKind = AiErrorKind | "bad_request" | "forbidden";

export type AiErrorBody = {
  ok: false;
  error: { kind: RouteErrorKind; message: string; retryAfter?: number; scope?: "user" | "global" };
};

export type AiSuccessBody<T> = { ok: true; data: T };

export type AiRouteBody<T> = AiSuccessBody<T> | AiErrorBody;

export type RequestRejection = {
  status: 400 | 403 | 413 | 415;
  kind: "bad_request" | "forbidden";
  message: string;
};

// Route Handlers do not get the Origin check that Server Actions have built in, so
// state-changing AI endpoints must verify it themselves. Pass `x-forwarded-host`
// (when present) or `host` as `hostHeader`.
export function isSameOrigin(originHeader: string | null, hostHeader: string | null) {
  if (!originHeader || !hostHeader) {
    return false;
  }

  try {
    return new URL(originHeader).host.toLowerCase() === hostHeader.toLowerCase();
  } catch {
    return false;
  }
}

export function toErrorBody(error: AiError | { kind: "bad_request" | "forbidden"; message: string }): AiErrorBody {
  const retryAfter = "retryAfter" in error ? error.retryAfter : undefined;
  const scope = "scope" in error ? error.scope : undefined;

  return {
    ok: false,
    error: {
      kind: error.kind,
      message: error.message,
      ...(retryAfter !== undefined ? { retryAfter } : {}),
      ...(scope !== undefined ? { scope } : {}),
    },
  };
}

// Cheap checks that run before anything is read or authenticated. The Origin check comes
// first, and JSON-only content types keep plain cross-site form posts out.
export function checkAiRequestHeaders({
  contentType,
  origin,
  host,
  contentLength,
}: {
  contentType: string | null;
  origin: string | null;
  host: string | null;
  contentLength: string | null;
}): RequestRejection | null {
  if (!isSameOrigin(origin, host)) {
    return { status: 403, kind: "forbidden", message: "Origen no permitido." };
  }

  if (!contentType || !/^application\/json\s*(;|$)/i.test(contentType)) {
    return { status: 415, kind: "bad_request", message: "El contenido debe ser JSON." };
  }

  const declared = contentLength === null ? Number.NaN : Number(contentLength);
  if (declared > MAX_AI_BODY_BYTES) {
    return { status: 413, kind: "bad_request", message: "La petición es demasiado grande." };
  }

  return null;
}

export function parseJsonText(
  text: string,
  maxBytes = MAX_AI_BODY_BYTES,
): { ok: true; value: unknown } | { ok: false; rejection: RequestRejection } {
  // Bytes, not characters: multi-byte text is what actually crosses the wire.
  if (new TextEncoder().encode(text).length > maxBytes) {
    return {
      ok: false,
      rejection: { status: 413, kind: "bad_request", message: "La petición es demasiado grande." },
    };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      rejection: { status: 400, kind: "bad_request", message: "La petición no es un JSON válido." },
    };
  }
}

// Reads the body chunk by chunk with a running byte budget, so an oversized or chunked
// (no Content-Length) upload is cut off as soon as it crosses the limit instead of being
// buffered whole before the size is checked.
export async function readBodyWithLimit(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes = MAX_AI_BODY_BYTES,
): Promise<{ ok: true; text: string } | { ok: false; rejection: RequestRejection }> {
  if (!stream) {
    return { ok: true, text: "" };
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return {
        ok: false,
        rejection: { status: 413, kind: "bad_request", message: "La petición es demasiado grande." },
      };
    }
    text += decoder.decode(value, { stream: true });
  }

  return { ok: true, text: text + decoder.decode() };
}

export function respondJson(body: AiRouteBody<unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
