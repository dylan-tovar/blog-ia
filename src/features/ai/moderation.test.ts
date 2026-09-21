import { describe, expect, it } from "vitest";
import { MODERATION_TIMEOUT_MS } from "./constants";
import { AiError } from "./errors";
import {
  GENERIC_BLOCKED_REASON,
  GENERIC_REJECTION_REASON,
  decideModeration,
  mergeTags,
  moderateArticle,
  type ModerationOutcome,
} from "./moderation";
import type { RateLimitResult } from "./rate-limit";
import type { GenerateInput, GenerateStructured } from "./types";

const okResult = (overrides: Partial<{ is_appropriate: boolean; reason: string; suggested_tags: string[] }> = {}) => ({
  is_appropriate: true,
  reason: "",
  suggested_tags: ["ia", "escritura"],
  ...overrides,
});

const resultOutcome = (overrides = {}): ModerationOutcome => ({ kind: "result", result: okResult(overrides) });
const errorOutcome = (kind: ConstructorParameters<typeof AiError>[0]): ModerationOutcome => ({
  kind: "error",
  error: new AiError(kind),
});

describe("mergeTags", () => {
  it("keeps existing tags first and appends new suggestions", () => {
    expect(mergeTags(["ia"], ["escritura", "nextjs"], 8)).toEqual(["ia", "escritura", "nextjs"]);
  });

  it("dedupes case-insensitively", () => {
    expect(mergeTags(["IA"], ["ia", "Next"], 8)).toEqual(["ia", "next"]);
  });

  it("caps the total at max, preferring existing tags", () => {
    expect(mergeTags(["a1", "b2"], ["c3", "d4", "e5"], 3)).toEqual(["a1", "b2", "c3"]);
  });

  it("never drops existing tags even when they already exceed max", () => {
    expect(mergeTags(["a1", "b2", "c3"], ["d4"], 2)).toEqual(["a1", "b2", "c3"]);
  });

  it("returns an empty list when both inputs are empty", () => {
    expect(mergeTags([], [], 8)).toEqual([]);
  });
});

describe("decideModeration", () => {
  it("publishes an appropriate post with the normalised AI tags", () => {
    const decision = decideModeration(resultOutcome({ suggested_tags: [" IA ", "ia", "Escritura"] }));

    expect(decision).toEqual({ status: "published", tags: ["ia", "escritura"] });
  });

  it("only returns tags that are not already on the post", () => {
    const decision = decideModeration(resultOutcome({ suggested_tags: ["ia", "nextjs"] }), ["ia"]);

    expect(decision).toEqual({ status: "published", tags: ["nextjs"] });
  });

  it("respects the per-post tag cap when adding AI tags", () => {
    const existing = ["t1", "t2", "t3", "t4", "t5", "t6", "t7"];
    const decision = decideModeration(resultOutcome({ suggested_tags: ["nuevo1", "nuevo2"] }), existing);

    expect(decision).toEqual({ status: "published", tags: ["nuevo1"] });
  });

  it("rejects an inappropriate post with the model's reason", () => {
    const decision = decideModeration(resultOutcome({ is_appropriate: false, reason: "  Insultos  " }));

    expect(decision).toEqual({ status: "rejected", reason: "Insultos" });
  });

  it("truncates a very long rejection reason", () => {
    const decision = decideModeration(resultOutcome({ is_appropriate: false, reason: "x".repeat(900) }));

    expect(decision.status).toBe("rejected");
    expect(decision.status === "rejected" && decision.reason).toHaveLength(300);
  });

  it("falls back to a generic reason when the model gives none", () => {
    const decision = decideModeration(resultOutcome({ is_appropriate: false, reason: "   " }));

    expect(decision).toEqual({ status: "rejected", reason: GENERIC_REJECTION_REASON });
  });

  it("rejects when Gemini blocked the content for safety", () => {
    expect(decideModeration(errorOutcome("blocked"))).toEqual({
      status: "rejected",
      reason: GENERIC_BLOCKED_REASON,
    });
  });

  it("keeps the post pending (never fails open) when the rate limit is hit", () => {
    const outcome: ModerationOutcome = {
      kind: "error",
      error: new AiError("rate_limited", { retryAfter: 20, scope: "user" }),
    };

    expect(decideModeration(outcome)).toEqual({ status: "pending", retryAfter: 20 });
  });

  it("falls back to one second when the rate limit gives no wait", () => {
    expect(decideModeration(errorOutcome("rate_limited"))).toEqual({ status: "pending", retryAfter: 1 });
  });

  it.each(["quota", "timeout", "unavailable", "invalid_response", "not_configured"] as const)(
    "publishes without AI tags when the failure is %s",
    (kind) => {
      expect(decideModeration(errorOutcome(kind))).toEqual({
        status: "published",
        tags: [],
        aiSkippedReason: kind,
      });
    },
  );
});

describe("moderateArticle", () => {
  const allowed: RateLimitResult = { ok: true };
  const limited: RateLimitResult = { ok: false, kind: "rate_limited", scope: "user", retryAfter: 20 };

  it("returns the model's verdict on success", async () => {
    let received: GenerateInput<unknown> | undefined;
    const generate: GenerateStructured = async (input) => {
      received = input as GenerateInput<unknown>;
      return okResult() as never;
    };

    const outcome = await moderateArticle({
      content: "Un articulo normal",
      generate,
      rateLimit: async () => allowed,
    });

    expect(outcome).toEqual({ kind: "result", result: okResult() });
    expect(received?.feature).toBe("moderation");
    expect(received?.timeoutMs).toBe(MODERATION_TIMEOUT_MS);
    expect(received?.contents).toContain("Un articulo normal");
  });

  it("does not call the model when the rate limit is exceeded", async () => {
    let calls = 0;
    const generate: GenerateStructured = async () => {
      calls += 1;
      return okResult() as never;
    };

    const outcome = await moderateArticle({ content: "texto", generate, rateLimit: async () => limited });

    expect(calls).toBe(0);
    expect(outcome.kind).toBe("error");
    expect(outcome.kind === "error" && outcome.error.kind).toBe("rate_limited");
    expect(outcome.kind === "error" && outcome.error.retryAfter).toBe(20);
  });

  it("does not call the model when the limiter itself is down", async () => {
    let calls = 0;
    const generate: GenerateStructured = async () => {
      calls += 1;
      return okResult() as never;
    };

    const outcome = await moderateArticle({
      content: "texto",
      generate,
      rateLimit: async () => ({ ok: false, kind: "unavailable", retryAfter: 0 }),
    });

    expect(calls).toBe(0);
    expect(outcome.kind === "error" && outcome.error.kind).toBe("unavailable");
  });

  it("keeps an AiError thrown by the model call", async () => {
    const generate: GenerateStructured = async () => {
      throw new AiError("blocked");
    };

    const outcome = await moderateArticle({ content: "texto", generate, rateLimit: async () => allowed });

    expect(outcome.kind === "error" && outcome.error.kind).toBe("blocked");
  });

  it("maps unknown failures to AiError instead of throwing", async () => {
    const generate: GenerateStructured = async () => {
      throw Object.assign(new Error("boom"), { status: 429 });
    };

    const outcome = await moderateArticle({ content: "texto", generate, rateLimit: async () => allowed });

    expect(outcome.kind === "error" && outcome.error.kind).toBe("quota");
  });

  it("passes the abort signal to the model call", async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const generate: GenerateStructured = async (input) => {
      received = input.signal;
      return okResult() as never;
    };

    await moderateArticle({
      content: "texto",
      generate,
      rateLimit: async () => allowed,
      signal: controller.signal,
    });

    expect(received).toBe(controller.signal);
  });
});
