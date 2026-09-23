import "server-only";
import { getAiEnv } from "@/lib/env.server";
import { AiError } from "./errors";
import * as claude from "./claude";
import * as gemini from "./gemini";
import * as openrouter from "./openrouter";
import { logNotConfigured } from "./provider-telemetry";
import type { AiFeature, GenerateStructured, GenerateText, StreamText } from "./types";

// Punto único donde se elige el proveedor de IA. El resto de la capa depende del
// puerto de `types.ts` (GenerateText, GenerateStructured, StreamText) y no sabe
// cuál está activo. Un proveedor a la vez, según AI_PROVIDER (ADR 0031).
const ADAPTERS = { claude, gemini, openrouter } as const;

function adapter(feature: AiFeature) {
  try {
    return ADAPTERS[getAiEnv().AI_PROVIDER];
  } catch {
    // Falta la clave o el modelo del proveedor elegido: mismo error que ya
    // devolvía el adaptador de Gemini cuando no estaba configurado.
    logNotConfigured(feature);
    throw new AiError("not_configured");
  }
}

// Las tres son perezosas a propósito: el proveedor se resuelve al ejecutar, no al
// importar, así un entorno sin IA no rompe los módulos que las importan y el
// fallo llega como rechazo de la promesa o del stream, nunca como excepción
// síncrona en el llamador.
export const generateText: GenerateText = async (input) =>
  adapter(input.feature).generateText(input);

export const generateStructured: GenerateStructured = async (input) =>
  adapter(input.feature).generateStructured(input);

export const streamText: StreamText = async function* (input) {
  yield* adapter(input.feature).streamText(input);
};
