import { AiError } from "./errors";

export type RateLimitResult =
  | { ok: true }
  | { ok: false; kind: "rate_limited"; scope: "user" | "global"; retryAfter: number }
  | { ok: false; kind: "unavailable"; retryAfter: number };

type RateLimitRow = { allowed: boolean; scope: string | null; retry_after: number };

export type RateLimitLane = "assist" | "moderation";

export function userRateLimitKey(userId: string) {
  return `user:${userId}`;
}

// Moderation has its own counters so the assistant features (outline, titles, tone, score,
// summary) can never exhaust the budget that publishing depends on.
export function laneKeys(userId: string, lane: RateLimitLane) {
  return lane === "moderation"
    ? { userKey: `moderation:user:${userId}`, globalKey: "moderation:global" }
    : { userKey: userRateLimitKey(userId), globalKey: "global" };
}

function isRateLimitRow(value: unknown): value is RateLimitRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.allowed === "boolean" && typeof row.retry_after === "number";
}

// A missing or malformed answer from the limiter fails CLOSED: no AI call is made
// without a working limiter. Moderation treats a limiter outage like any provider outage
// (publishes without AI tags), but a real rate limit keeps the post pending.
export function interpretRateLimitRows(rows: unknown): RateLimitResult {
  const row = Array.isArray(rows) ? rows[0] : undefined;

  if (!isRateLimitRow(row)) {
    return { ok: false, kind: "unavailable", retryAfter: 0 };
  }
  if (row.allowed) {
    return { ok: true };
  }

  return {
    ok: false,
    kind: "rate_limited",
    scope: row.scope === "global" ? "global" : "user",
    retryAfter: Math.max(1, Math.ceil(row.retry_after)),
  };
}

export function rateLimitToAiError(result: Exclude<RateLimitResult, { ok: true }>) {
  return result.kind === "rate_limited"
    ? new AiError("rate_limited", { retryAfter: result.retryAfter, scope: result.scope })
    : new AiError("unavailable");
}
