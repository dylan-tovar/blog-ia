import { contentScoreSchema, titlesSchema, type ContentScore } from "./schemas";

// The cache lives in nullable jsonb/text columns; a corrupt value is treated as a miss.
export function parseCachedTitles(value: unknown): string[] | null {
  const parsed = titlesSchema.safeParse({ titles: value });
  return parsed.success ? parsed.data.titles : null;
}

export function parseCachedScore(value: unknown): ContentScore | null {
  const parsed = contentScoreSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isCacheUsable(cached: unknown, regenerate: boolean) {
  return !regenerate && cached !== null && cached !== undefined;
}
