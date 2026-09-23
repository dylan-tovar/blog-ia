import type { AiFeature } from "./types";

// Política de generación por función, independiente del proveedor: describe qué
// necesita cada tarea (la moderación no debe improvisar, los títulos sí), no cómo
// la implementa Gemini o OpenRouter. Cada adaptador la traduce a su propia API.
export const FEATURE_CONFIG: Record<AiFeature, { temperature: number; maxOutputTokens: number }> = {
  outline: { temperature: 0.8, maxOutputTokens: 2048 },
  titles: { temperature: 0.9, maxOutputTokens: 512 },
  tone: { temperature: 0.6, maxOutputTokens: 8192 },
  score: { temperature: 0.2, maxOutputTokens: 2048 },
  moderation: { temperature: 0, maxOutputTokens: 512 },
  summary: { temperature: 0.3, maxOutputTokens: 512 },
  // Room for a text answer plus edit proposals that carry Markdown.
  chat: { temperature: 0.7, maxOutputTokens: 8192 },
};
