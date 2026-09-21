import type { AiErrorKind, RateLimitScope } from "./errors";
import {
  articleAnalysisSchema,
  chatStepSchema,
  editActionSchema,
  type ArticleAnalysis,
  type ChatStep,
  type EditAction,
} from "./schemas";

export type StreamErrorPayload = {
  kind: AiErrorKind;
  message: string;
  retryAfter?: number;
  scope?: RateLimitScope;
};

// One JSON object per line (NDJSON) on the wire.
export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "step"; step: ChatStep }
  | { type: "action"; action: EditAction }
  | { type: "analysis"; analysis: ArticleAnalysis }
  | { type: "error"; error: StreamErrorPayload }
  | { type: "done" };

export const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

export function encodeStreamEvent(event: ChatStreamEvent) {
  return `${JSON.stringify(event)}\n`;
}

function parseEvent(line: string): ChatStreamEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }

  if (typeof value !== "object" || value === null) return null;
  const { type, text, error, step, action, analysis } = value as {
    type?: unknown;
    text?: unknown;
    error?: unknown;
    step?: unknown;
    action?: unknown;
    analysis?: unknown;
  };

  if (type === "done") return { type };
  if (type === "delta" && typeof text === "string") return { type, text };
  if (type === "step") {
    const parsed = chatStepSchema.safeParse(step);
    return parsed.success ? { type, step: parsed.data } : null;
  }
  if (type === "action") {
    const parsed = editActionSchema.safeParse(action);
    return parsed.success ? { type, action: parsed.data } : null;
  }
  if (type === "analysis") {
    const parsed = articleAnalysisSchema.safeParse(analysis);
    return parsed.success ? { type, analysis: parsed.data } : null;
  }
  if (type === "error" && typeof error === "object" && error !== null) {
    const { kind, message } = error as { kind?: unknown; message?: unknown };
    if (typeof kind === "string" && typeof message === "string") {
      return { type, error: error as StreamErrorPayload };
    }
  }
  return null;
}

// Unknown event types are skipped (not errors) so a newer server can add events without breaking older clients.
// Feed decoded text as it arrives; a line split across chunks is held until its newline shows up.
// Lines that are not valid events are skipped so one bad line cannot break the whole answer.
export function createNdjsonParser() {
  let buffer = "";

  function parseLines(lines: string[]) {
    const events: ChatStreamEvent[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      const event = trimmed ? parseEvent(trimmed) : null;
      if (event) events.push(event);
    }
    return events;
  }

  return {
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      return parseLines(lines);
    },
    flush() {
      const rest = buffer;
      buffer = "";
      return parseLines([rest]);
    },
  };
}
