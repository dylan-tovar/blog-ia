import { CHAT_TOOL_DECLARATIONS, type ModelPart } from "./function-calls";
import type { AiContent, AiContentPart, AiFeature } from "./types";

// Traducción entre el protocolo de la API de Claude y los tipos internos. Vive
// aparte de `claude.ts` y sin `server-only` para poder probarla sin red, igual que
// `openrouter-protocol.ts` y `function-calls.ts` con sus respectivos formatos.

// Subconjunto estructural del bloque de contenido de Anthropic: el mismo motivo que
// `ClaudeStreamEvent` más abajo, para no depender del SDK acá. `claude.ts` lo angosta
// al tipo real (`Anthropic.ContentBlockParam`) en el borde.
export type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

// El bloque de imagen de Anthropic anida el mime type en `source` en vez de tenerlo
// al lado de `data`, como en el resto del proyecto (Gemini, y AiContentPart mismo).
export function toClaudeContent(contents: AiContent): string | ClaudeContentBlock[] {
  if (typeof contents === "string") return contents;

  return contents.map((part: AiContentPart) =>
    part.type === "text"
      ? { type: "text" as const, text: part.text }
      : { type: "image" as const, source: { type: "base64" as const, media_type: part.mimeType, data: part.data } },
  );
}

// Subconjunto estructural de los eventos del SDK, para que este módulo no dependa
// de él y siga siendo comprobable con objetos literales.
export type ClaudeStreamEvent =
  | { type: "content_block_start"; index: number; content_block: { type: string; name?: string } }
  | {
      type: "content_block_delta";
      index: number;
      delta: { type: string; text?: string; partial_json?: string };
    }
  | { type: "content_block_stop"; index: number }
  | { type: string; index?: number };

export type ToolBlock = { name: string; json: string };
export type ToolBlocks = Record<number, ToolBlock>;

// Cota defensiva sobre el índice del bloque, que llega del proveedor. Una respuesta
// del chat nunca se acerca a este número de bloques.
const MAX_BLOCKS = 64;

// Las declaraciones ya están en JSON Schema; para Claude el campo se llama
// `input_schema` en vez de `parametersJsonSchema`.
export const CLAUDE_TOOLS = CHAT_TOOL_DECLARATIONS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.parametersJsonSchema,
}));

// Claude no acepta `temperature` en los modelos actuales: devuelve 400. El
// equivalente para graduar cuánto razona es el esfuerzo, que se elige por función.
// Bajo para las tareas mecánicas; medio para el chat, que es la que propone
// ediciones sobre el texto del autor y sí se beneficia de pensar un poco más.
export const CLAUDE_EFFORT: Record<AiFeature, "low" | "medium" | "high"> = {
  outline: "low",
  titles: "low",
  tone: "medium",
  score: "medium",
  moderation: "low",
  summary: "low",
  chat: "medium",
};

// El razonamiento comparte presupuesto con la respuesta, así que los topes
// pensados para un modelo sin razonamiento visible se quedan cortos y la
// respuesta llega truncada. `max_tokens` es un techo, no un cargo: subir el piso
// no cuesta nada si no se usa.
export const CLAUDE_MIN_MAX_TOKENS = 4_096;

export const claudeMaxTokens = (featureMaxTokens: number) =>
  Math.max(featureMaxTokens, CLAUDE_MIN_MAX_TOKENS);

const isUsableIndex = (index: number | undefined): index is number =>
  typeof index === "number" && Number.isInteger(index) && index >= 0 && index < MAX_BLOCKS;

/** Registra el comienzo de un bloque de llamada a herramienta. */
export function startBlock(blocks: ToolBlocks, event: ClaudeStreamEvent): ToolBlocks {
  if (event.type !== "content_block_start") return blocks;

  const { index, content_block: block } = event as Extract<
    ClaudeStreamEvent,
    { type: "content_block_start" }
  >;
  if (!isUsableIndex(index) || block?.type !== "tool_use" || !block.name) return blocks;

  return { ...blocks, [index]: { name: block.name, json: "" } };
}

/** Acumula los argumentos, que llegan troceados como JSON parcial. */
export function appendJson(blocks: ToolBlocks, event: ClaudeStreamEvent): ToolBlocks {
  if (event.type !== "content_block_delta") return blocks;

  const { index, delta } = event as Extract<ClaudeStreamEvent, { type: "content_block_delta" }>;
  if (!isUsableIndex(index) || delta?.type !== "input_json_delta") return blocks;

  const current = blocks[index];
  if (!current) return blocks;

  return { ...blocks, [index]: { ...current, json: current.json + (delta.partial_json ?? "") } };
}

/** Texto a emitir de un evento, o `undefined` si el evento no lo lleva. */
export function deltaText(event: ClaudeStreamEvent): string | undefined {
  if (event.type !== "content_block_delta") return undefined;

  const { delta } = event as Extract<ClaudeStreamEvent, { type: "content_block_delta" }>;
  // Solo `text_delta`: el razonamiento llega como `thinking_delta` y no se muestra.
  return delta?.type === "text_delta" ? delta.text || undefined : undefined;
}

const DECLARED_TOOLS = new Set(CHAT_TOOL_DECLARATIONS.map((tool) => tool.name));

/**
 * Cierra un bloque: a diferencia de OpenRouter, acá los argumentos están completos
 * en cuanto el bloque termina, así que la propuesta se puede emitir en el acto.
 * `invalid` solo lleva nombres declarados, o "unknown": el que informa el modelo
 * puede derivar del texto del autor y no debe llegar al registro.
 */
export function finishBlock(
  blocks: ToolBlocks,
  event: ClaudeStreamEvent,
): { blocks: ToolBlocks; part?: ModelPart; invalid?: string } {
  if (event.type !== "content_block_stop") return { blocks };

  const { index } = event as Extract<ClaudeStreamEvent, { type: "content_block_stop" }>;
  if (!isUsableIndex(index)) return { blocks };

  const pending = blocks[index];
  if (!pending) return { blocks };

  const rest = { ...blocks };
  delete rest[index];
  const safeName = DECLARED_TOOLS.has(pending.name) ? pending.name : "unknown";

  let args: unknown;
  try {
    args = JSON.parse(pending.json || "{}");
  } catch {
    return { blocks: rest, invalid: safeName };
  }

  if (typeof args !== "object" || args === null) {
    return { blocks: rest, invalid: safeName };
  }

  return {
    blocks: rest,
    part: { functionCall: { name: pending.name, args: args as Record<string, unknown> } },
  };
}
