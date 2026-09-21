import "server-only";
import { getAiEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  interpretRateLimitRows,
  laneKeys,
  rateLimitToAiError,
  type RateLimitLane,
  type RateLimitResult,
} from "./rate-limit";

export async function checkAiRateLimit(userId: string, lane: RateLimitLane = "assist"): Promise<RateLimitResult> {
  try {
    const env = getAiEnv();
    const { userKey, globalKey } = laneKeys(userId, lane);
    const { data, error } = await createAdminClient().rpc("ai_rate_limit_hit", {
      p_user_key: userKey,
      p_user_limit: env.AI_RATE_LIMIT_USER_PER_MIN,
      p_global_limit:
        lane === "moderation" ? env.AI_RATE_LIMIT_MODERATION_GLOBAL_PER_MIN : env.AI_RATE_LIMIT_GLOBAL_PER_MIN,
      p_global_key: globalKey,
    });

    if (error) {
      console.error("[ai] rate limit check failed", error.code);
      return { ok: false, kind: "unavailable", retryAfter: 0 };
    }

    return interpretRateLimitRows(data);
  } catch (error) {
    console.error("[ai] rate limit check failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, kind: "unavailable", retryAfter: 0 };
  }
}

// For features without a cache: throws the AiError the routes and actions already map.
export async function enforceAiRateLimit(userId: string) {
  const result = await checkAiRateLimit(userId);
  if (!result.ok) {
    throw rateLimitToAiError(result);
  }
}
