import { MAX_TAGS_PER_POST, MODERATION_TIMEOUT_MS } from "./constants";
import { mapGeminiError, type AiError, type AiErrorKind } from "./errors";
import { buildModerationPrompt } from "./prompts";
import { rateLimitToAiError, type RateLimitResult } from "./rate-limit";
import { moderationSchema, normalizeAiTags, truncateReason, type Moderation } from "./schemas";
import type { GenerateStructured } from "./types";

export const GENERIC_REJECTION_REASON = "El contenido no cumple las normas de la comunidad.";
export const GENERIC_BLOCKED_REASON = "El contenido fue bloqueado por los filtros de seguridad.";

export type ModerationOutcome =
  | { kind: "result"; result: Moderation }
  | { kind: "error"; error: AiError };

export type ModerationDecision =
  | { status: "published"; tags: string[]; aiSkippedReason?: AiErrorKind }
  | { status: "rejected"; reason: string }
  | { status: "pending"; retryAfter: number };

const normalizeTag = (tag: string) => tag.trim().toLowerCase();

// Existing tags always win and are never dropped; suggestions fill the remaining slots.
export function mergeTags(existing: string[], suggested: string[], max: number): string[] {
  const merged = new Set(existing.map(normalizeTag).filter(Boolean));

  for (const tag of suggested.map(normalizeTag)) {
    if (merged.size >= max) break;
    if (tag) merged.add(tag);
  }

  return [...merged];
}

// Provider failures (timeout, outage, quota, unusable output) publish without AI tags
// (PRD 5 §3.4): an outage must never stop an author from publishing. Two failures are not
// outages: a safety block means the content itself tripped the filters (rejected), and a
// rate limit is a state an attacker can drive on purpose, so failing open would let anyone
// skip moderation by exhausting it — the post stays pending and the author retries.
export function decideModeration(outcome: ModerationOutcome, existingTags: string[] = []): ModerationDecision {
  if (outcome.kind === "error") {
    if (outcome.error.kind === "blocked") {
      return { status: "rejected", reason: GENERIC_BLOCKED_REASON };
    }
    if (outcome.error.kind === "rate_limited") {
      return { status: "pending", retryAfter: Math.max(1, Math.ceil(outcome.error.retryAfter ?? 1)) };
    }
    return { status: "published", tags: [], aiSkippedReason: outcome.error.kind };
  }

  const { result } = outcome;
  if (!result.is_appropriate) {
    return { status: "rejected", reason: truncateReason(result.reason) || GENERIC_REJECTION_REASON };
  }

  const existing = new Set(existingTags.map(normalizeTag));
  const merged = mergeTags(existingTags, normalizeAiTags(result.suggested_tags), MAX_TAGS_PER_POST);

  return { status: "published", tags: merged.filter((tag) => !existing.has(tag)) };
}

export async function moderateArticle({
  content,
  generate,
  rateLimit,
  signal,
}: {
  content: string;
  generate: GenerateStructured;
  rateLimit: () => Promise<RateLimitResult>;
  signal?: AbortSignal;
}): Promise<ModerationOutcome> {
  const limit = await rateLimit();
  if (!limit.ok) {
    return { kind: "error", error: rateLimitToAiError(limit) };
  }

  try {
    const { systemInstruction, contents } = buildModerationPrompt(content);
    const result = await generate({
      feature: "moderation",
      system: systemInstruction,
      contents,
      schema: moderationSchema,
      timeoutMs: MODERATION_TIMEOUT_MS,
      signal,
    });

    return { kind: "result", result };
  } catch (error) {
    return { kind: "error", error: mapGeminiError(error) };
  }
}
