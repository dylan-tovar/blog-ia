import { describeUpstreamError, mapGeminiError } from "./errors";
import type { AiFeature, ChatStreamPart } from "./types";

// Registro compartido por los adaptadores de proveedor. Solo metadatos: nunca el
// prompt, la respuesta ni la clave. Todo fallo sale como AiError, de modo que los
// llamadores manejan un único tipo de error sin importar el proveedor.
function logFailure(feature: AiFeature, startedAt: number, error: unknown) {
  const mapped = mapGeminiError(error);
  console.info("[ai]", {
    feature,
    ms: Date.now() - startedAt,
    ok: false,
    kind: mapped.kind,
    ...describeUpstreamError(error),
  });
  return mapped;
}

// El fallo de configuración ocurre antes de llamar al proveedor, fuera de `logged`:
// sin esta línea un despliegue mal configurado no dejaría ninguna traza en el
// servidor y el único síntoma sería el mensaje que ve la persona.
export function logNotConfigured(feature: AiFeature) {
  console.info("[ai]", { feature, ms: 0, ok: false, kind: "not_configured" });
}

export async function logged<T>(feature: AiFeature, run: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const value = await run();
    console.info("[ai]", { feature, ms: Date.now() - startedAt, ok: true });
    return value;
  } catch (error) {
    throw logFailure(feature, startedAt, error);
  }
}

// El fallo puede llegar con partes ya emitidas: se registra igual y se propaga
// como AiError para que el stream lo cierre con un evento de error.
export async function* loggedStream(
  feature: AiFeature,
  run: () => AsyncGenerator<ChatStreamPart>,
): AsyncGenerator<ChatStreamPart> {
  const startedAt = Date.now();
  try {
    yield* run();
    console.info("[ai]", { feature, ms: Date.now() - startedAt, ok: true });
  } catch (error) {
    throw logFailure(feature, startedAt, error);
  }
}
