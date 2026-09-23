import { AiError } from "./errors";
import { CHAT_TOOL_DECLARATIONS, type ModelPart } from "./function-calls";
import type { ChatTurn } from "./types";

// Traducción entre el protocolo de OpenRouter (compatible con OpenAI) y los tipos
// internos. Vive aparte de `openrouter.ts` y sin `server-only` para poder probarla
// sin red, igual que `function-calls.ts` con el formato de Gemini.

export type OpenAiMessage = { role: "system" | "user" | "assistant"; content: string };

export type OpenAiToolCallDelta = {
  index?: number;
  function?: { name?: string; arguments?: string };
};

export type OpenAiChunk = {
  choices?: {
    delta?: { content?: string | null; tool_calls?: OpenAiToolCallDelta[] };
    finish_reason?: string | null;
  }[];
  error?: { message?: string; code?: number };
};

export type OpenAiCompletion = {
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  error?: { message?: string; code?: number };
};

export type PendingToolCall = { name: string; args: string };

export const SSE_DONE = "[DONE]";

// Cota defensiva sobre `index`, que lo controla el proveedor y se usa como índice
// de array. Sin ella, un valor enorme deja un array disperso cuya copia reserva
// memoria para todos los huecos y tumba el proceso con un fallo de V8 que el
// `try` del stream ni siquiera puede capturar. El chat nunca necesita tantas.
const MAX_TOOL_CALLS = 32;

// Las declaraciones ya están en JSON Schema, así que la traducción es envolverlas.
export const CHAT_TOOLS = CHAT_TOOL_DECLARATIONS.map((tool) => ({
  type: "function" as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parametersJsonSchema,
  },
}));

// La instrucción de sistema es un mensaje más, no un campo aparte como en Gemini.
export function toMessages(system: string, contents: string | ChatTurn[]): OpenAiMessage[] {
  const turns: OpenAiMessage[] =
    typeof contents === "string"
      ? [{ role: "user", content: contents }]
      : contents.map(({ role, text }) => ({
          role: role === "model" ? ("assistant" as const) : ("user" as const),
          content: text,
        }));

  return [{ role: "system", content: system }, ...turns];
}

// Un error puede llegar con HTTP 200, dentro del cuerpo o del propio stream.
export function throwIfErrorBody(body: { error?: { message?: string; code?: number } }) {
  if (!body.error) return;
  throw Object.assign(new Error("openrouter error"), { status: body.error.code ?? 502 });
}

// El filtro de contenido del proveedor equivale al bloqueo de seguridad de Gemini.
export function throwIfBlocked(finishReason: string | null | undefined) {
  if (finishReason === "content_filter") {
    throw new AiError("blocked");
  }
  return finishReason ?? "";
}

export function readCompletionText(body: OpenAiCompletion): string {
  throwIfErrorBody(body);

  const choice = body.choices?.[0];
  // Una respuesta cortada es inservible: medio JSON o medio artículo reescrito.
  if (throwIfBlocked(choice?.finish_reason) === "length") {
    throw new AiError("invalid_response");
  }

  const text = choice?.message?.content?.trim();
  if (!text) {
    throw new AiError("invalid_response");
  }

  return text;
}

// Separa el buffer en cargas `data:` completas y devuelve el resto sin terminar.
// Descarta los comentarios `:` que OpenRouter envía como señal de vida.
export function scanSse(buffer: string): { payloads: string[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const payloads: string[] = [];

  for (const line of lines) {
    const clean = line.replace(/\r$/, "");
    if (!clean || clean.startsWith(":")) continue;
    if (!clean.startsWith("data:")) continue;
    payloads.push(clean.slice(5).trim());
  }

  return { payloads, rest };
}

// Los argumentos de una llamada a herramienta llegan troceados entre chunks y se
// identifican por `index`, no por posición de llegada.
export function accumulateToolCalls(
  pending: PendingToolCall[],
  deltas: OpenAiToolCallDelta[] | undefined,
): PendingToolCall[] {
  if (!deltas?.length) return pending;

  const next = [...pending];
  for (const delta of deltas) {
    const index = delta.index ?? 0;
    if (!Number.isInteger(index) || index < 0 || index >= MAX_TOOL_CALLS) continue;

    const current = next[index] ?? { name: "", args: "" };
    next[index] = {
      name: delta.function?.name ?? current.name,
      args: current.args + (delta.function?.arguments ?? ""),
    };
  }

  return next;
}

const DECLARED_TOOLS = new Set(CHAT_TOOL_DECLARATIONS.map((tool) => tool.name));

// `invalid` solo lleva nombres declarados por nosotros, o la constante "unknown":
// el nombre que manda el modelo puede derivar del texto del autor y no debe llegar
// al registro. Es el mismo criterio que aplica `modelPartsToStreamParts` con Gemini.
export function toolCallsToModelParts(pending: PendingToolCall[]): {
  parts: ModelPart[];
  invalid: string[];
} {
  const parts: ModelPart[] = [];
  const invalid: string[] = [];
  const safeName = (name: string) => (DECLARED_TOOLS.has(name) ? name : "unknown");

  for (const call of pending) {
    if (!call?.name) continue;

    let args: unknown;
    try {
      args = JSON.parse(call.args || "{}");
    } catch {
      invalid.push(safeName(call.name));
      continue;
    }

    if (typeof args !== "object" || args === null) {
      invalid.push(safeName(call.name));
      continue;
    }

    parts.push({ functionCall: { name: call.name, args: args as Record<string, unknown> } });
  }

  return { parts, invalid };
}
