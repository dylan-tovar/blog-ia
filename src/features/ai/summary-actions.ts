"use server";

import { idSchema } from "@/features/posts/schemas";
import { createClient } from "@/lib/supabase/server";
import { saveAiCache } from "./cache.server";
import { runCachedFeature } from "./cached-feature";
import { DEFAULT_TIMEOUT_MS, MIN_WORDS_SUMMARY } from "./constants";
import { AiError, isAiError, mapGeminiError, type AiErrorKind } from "./errors";
import { generateText } from "./gemini";
import { cleanSummary } from "./output";
import { buildSummaryPrompt } from "./prompts";
import { checkAiRateLimit } from "./rate-limit.server";
import { assertMinWords } from "./words";

export type SummaryResult =
  | { ok: true; summary: string; cached: boolean }
  | { ok: false; error: { kind: AiErrorKind; message: string; retryAfter?: number } };

function failure(error: unknown): SummaryResult {
  const mapped = mapGeminiError(error);
  if (!isAiError(error)) {
    console.error("[ai] summary failed", error instanceof Error ? error.name : "unknown");
  }

  return {
    ok: false,
    error: {
      kind: mapped.kind,
      message: mapped.message,
      ...(mapped.retryAfter !== undefined ? { retryAfter: mapped.retryAfter } : {}),
    },
  };
}

// Anyone can read a cached summary (no cost). Generating one spends free-tier quota, so it
// needs a session, the same minimum length the button uses, and the rate limit. A summary
// is only ever produced for a PUBLISHED ARTICLE, never for a note or a draft.
export async function getPostSummary(postId: string): Promise<SummaryResult> {
  try {
    if (!idSchema.safeParse(postId).success) {
      throw new AiError("not_allowed");
    }

    const supabase = await createClient();
    const { data: post, error } = await supabase
      .from("posts")
      .select("id, content, updated_at, ai_generated_summary")
      .eq("id", postId)
      .eq("status", "published")
      .eq("type", "article")
      .maybeSingle();

    if (error) {
      throw new AiError("unavailable");
    }
    if (!post) {
      throw new AiError("not_allowed");
    }

    const stored = post.ai_generated_summary?.trim();
    if (stored) {
      return { ok: true, summary: stored, cached: true };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new AiError("unauthenticated");
    }

    assertMinWords(post.content, MIN_WORDS_SUMMARY);

    const { data } = await runCachedFeature({
      cached: null,
      regenerate: false,
      rateLimit: () => checkAiRateLimit(user.id),
      generate: async () => {
        const { systemInstruction, contents } = buildSummaryPrompt(post.content);
        const text = await generateText({
          feature: "summary",
          system: systemInstruction,
          contents,
          timeoutMs: DEFAULT_TIMEOUT_MS,
        });
        return cleanSummary(text);
      },
      // `updated_at` is passed back exactly as read (Postgres keeps microseconds).
      save: (summary) => saveAiCache(post.id, post.updated_at, { ai_generated_summary: summary }),
    });

    return { ok: true, summary: data, cached: false };
  } catch (error) {
    return failure(error);
  }
}
