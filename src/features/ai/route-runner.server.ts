import "server-only";
import type { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AiError, isAiError, mapGeminiError } from "./errors";
import { enforceAiRateLimit } from "./rate-limit.server";
import {
  checkAiRequestHeaders,
  parseJsonText,
  readBodyWithLimit,
  respondJson,
  toErrorBody,
  type AiRouteBody,
} from "./route-helpers";
import { streamAiResponse } from "./stream-response";
import type { ChatStreamPart } from "./types";

export type AiRouteContext<TBody> = {
  body: TBody;
  user: { id: string };
  supabase: Awaited<ReturnType<typeof createClient>>;
  signal: AbortSignal;
};

type Preflight<TBody> =
  | { ok: true; body: TBody; user: { id: string }; supabase: AiRouteContext<TBody>["supabase"] }
  | { ok: false; response: Response };

const reject = (body: AiRouteBody<unknown>, status: number): { ok: false; response: Response } => ({
  ok: false,
  response: respondJson(body, status),
});

// Order matters: cheap header checks (Origin, content type, declared size) run first, then
// authentication, then the body.
async function preflight<TBody>(request: Request, schema: z.ZodType<TBody>): Promise<Preflight<TBody>> {
  const rejection = checkAiRequestHeaders({
    contentType: request.headers.get("content-type"),
    origin: request.headers.get("origin"),
    host: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    contentLength: request.headers.get("content-length"),
  });
  if (rejection) {
    return reject(toErrorBody(rejection), rejection.status);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return reject(toErrorBody(new AiError("unauthenticated")), 401);
  }

  let read: Awaited<ReturnType<typeof readBodyWithLimit>>;
  try {
    read = await readBodyWithLimit(request.body);
  } catch {
    return reject(toErrorBody({ kind: "bad_request", message: "No pudimos leer la petición." }), 400);
  }
  if (!read.ok) {
    return reject(toErrorBody(read.rejection), read.rejection.status);
  }

  const json = parseJsonText(read.text);
  if (!json.ok) {
    return reject(toErrorBody(json.rejection), json.rejection.status);
  }

  const body = schema.safeParse(json.value);
  if (!body.success) {
    return reject(
      toErrorBody({ kind: "bad_request", message: body.error.issues[0]?.message ?? "Datos inválidos." }),
      400,
    );
  }

  return { ok: true, body: body.data, user: { id: user.id }, supabase };
}

// Shared shell of the editor's AI Route Handlers.
// Expected failures (rate limit, timeout, invalid model output...) answer HTTP 200 with
// `{ ok: false, error }` so the client always handles one typed union; only malformed,
// unauthenticated and cross-origin requests get 4xx.
export async function runAiRoute<TBody, TData>(
  request: Request,
  {
    schema,
    handler,
  }: {
    schema: z.ZodType<TBody>;
    handler: (context: AiRouteContext<TBody>) => Promise<TData>;
  },
) {
  const pre = await preflight(request, schema);
  if (!pre.ok) {
    return pre.response;
  }

  try {
    const data = await handler({ body: pre.body, user: pre.user, supabase: pre.supabase, signal: request.signal });
    return respondJson({ ok: true, data });
  } catch (error) {
    if (!isAiError(error)) {
      console.error("[ai] route failed", error instanceof Error ? error.name : "unknown");
    }
    return respondJson(toErrorBody(mapGeminiError(error)));
  }
}

// Same pre-flight and rate limit as `runAiRoute`, but the answer is an NDJSON stream. Anything
// that fails before the stream starts is still the JSON error union; later failures are `error` lines.
export async function runAiStreamRoute<TBody>(
  request: Request,
  {
    schema,
    handler,
  }: {
    schema: z.ZodType<TBody>;
    handler: (context: AiRouteContext<TBody>) => AsyncIterable<ChatStreamPart>;
  },
) {
  const pre = await preflight(request, schema);
  if (!pre.ok) {
    return pre.response;
  }

  return streamAiResponse({
    requestSignal: request.signal,
    rateLimit: () => enforceAiRateLimit(pre.user.id),
    source: (signal) => handler({ body: pre.body, user: pre.user, supabase: pre.supabase, signal }),
  });
}
