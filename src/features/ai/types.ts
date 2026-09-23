import type { z } from "zod";
import type { ArticleAnalysis, ChatStep, EditAction } from "./schemas";

export type AiFeature = "outline" | "titles" | "tone" | "score" | "moderation" | "summary" | "chat";

// Casi todas las features mandan texto plano. La moderación es la excepción: además
// del texto puede llevar imágenes adjuntas (portada y las del cuerpo), en base64 listas
// para el proveedor — quien las baja y codifica es la capa de features, no el adapter.
export type AiContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string };

export type AiContent = string | AiContentPart[];

export type GenerateInput<T> = {
  feature: AiFeature;
  system: string;
  contents: AiContent;
  schema: z.ZodType<T>;
  timeoutMs: number;
  signal?: AbortSignal;
};

export type GenerateTextInput = Omit<GenerateInput<unknown>, "schema">;

// Both functions throw AiError on any failure so callers handle one error type.
// They are injected into the orchestration code so it can be tested without a network.
export type GenerateStructured = <T>(input: GenerateInput<T>) => Promise<T>;
export type GenerateText = (input: GenerateTextInput) => Promise<string>;

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatTurn = { role: "user" | "model"; text: string };

export type StreamTextInput = {
  feature: AiFeature;
  system: string;
  contents: ChatTurn[];
  timeoutMs: number;
  signal?: AbortSignal;
};

export type ChatStreamPart =
  | { kind: "text"; text: string }
  | { kind: "step"; step: ChatStep }
  | { kind: "action"; action: EditAction }
  | { kind: "analysis"; analysis: ArticleAnalysis };

// Yields text deltas, steps and edit actions; throws AiError on any failure (also after some parts were already yielded).
export type StreamText = (input: StreamTextInput) => AsyncGenerator<ChatStreamPart>;
