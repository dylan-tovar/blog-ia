import { ThinkingLevel, type ThinkingConfig } from "@google/genai";

// Thinking tokens eat latency and free-tier quota and these tasks do not need them.
// 2.5 Flash takes a zero budget; 3.x rejects a budget (400) and takes a level instead.
export function thinkingConfigFor(model: string): ThinkingConfig | undefined {
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-3/.test(model)) return { thinkingLevel: ThinkingLevel.MINIMAL };
  return undefined;
}
