export type AiErrorKind =
  | "rate_limited"
  | "quota"
  | "timeout"
  | "unavailable"
  | "invalid_response"
  | "blocked"
  | "not_configured"
  | "input_too_long"
  | "input_too_short"
  | "not_allowed"
  | "unauthenticated";

export const AI_ERROR_MESSAGES: Record<AiErrorKind, string> = {
  rate_limited: "Estás generando muy rápido, esperá un momento e intentá de nuevo.",
  quota: "Se alcanzó el límite de uso de la IA por ahora. Probá de nuevo más tarde.",
  timeout: "La IA tardó demasiado en responder. Intentá de nuevo.",
  unavailable: "La IA no está disponible en este momento. Intentá de nuevo en un rato.",
  invalid_response: "La IA devolvió una respuesta que no pudimos usar. Intentá de nuevo.",
  blocked: "El contenido fue bloqueado por los filtros de seguridad de la IA.",
  not_configured: "La IA no está configurada en este entorno. Revisá la clave y el modelo (GEMINI_MODEL).",
  input_too_long: "El texto es demasiado largo para procesarlo con IA.",
  input_too_short: "Escribí un poco más antes de usar esta función.",
  not_allowed: "Esta función de IA no está disponible para este contenido.",
  unauthenticated: "Iniciá sesión para usar esta función.",
};

export const AI_RATE_LIMITED_GLOBAL_MESSAGE =
  "La IA está saturada en este momento, probá de nuevo en un momento.";

export type RateLimitScope = "user" | "global";

export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly retryAfter?: number;
  readonly scope?: RateLimitScope;

  constructor(
    kind: AiErrorKind,
    options: { retryAfter?: number; message?: string; scope?: RateLimitScope } = {},
  ) {
    super(
      options.message ??
        (kind === "rate_limited" && options.scope === "global"
          ? AI_RATE_LIMITED_GLOBAL_MESSAGE
          : AI_ERROR_MESSAGES[kind]),
    );
    this.name = "AiError";
    this.kind = kind;
    this.retryAfter = options.retryAfter;
    this.scope = options.scope;
  }
}

export function isAiError(value: unknown): value is AiError {
  return value instanceof AiError;
}

function statusOf(error: unknown) {
  if (typeof error === "object" && error !== null && "status" in error) {
    const { status } = error as { status: unknown };
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

export type UpstreamErrorDetail = { status?: number; name?: string; causeCode?: string };

// Safe to log: never includes the message, which can echo prompt text.
export function describeUpstreamError(error: unknown): UpstreamErrorDetail {
  const status = statusOf(error);
  const cause = typeof error === "object" && error !== null && "cause" in error ? error.cause : undefined;
  const causeCode =
    typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
      ? cause.code
      : undefined;

  return {
    ...(status !== undefined ? { status } : {}),
    ...(error instanceof Error ? { name: error.name } : {}),
    ...(causeCode !== undefined ? { causeCode } : {}),
  };
}

// Duck-typed on `status` (the SDK's ApiError) so this module stays free of the SDK.
export function mapGeminiError(error: unknown): AiError {
  if (isAiError(error)) {
    return error;
  }

  const status = statusOf(error);
  if (status === 429) return new AiError("quota");
  // 404 means the configured model does not exist for this key.
  if (status === 401 || status === 403 || status === 404) return new AiError("not_configured");
  if (status === 408) return new AiError("timeout");
  if (status !== undefined) return new AiError("unavailable");

  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return new AiError("timeout");
    }
    if (/timeout|timed out|aborted/i.test(error.message)) {
      return new AiError("timeout");
    }
  }

  return new AiError("unavailable");
}
