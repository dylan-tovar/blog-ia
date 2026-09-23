import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_MODERATION_IMAGES, MODERATION_TIMEOUT_MS } from "./constants";
import { AiError } from "./errors";
import {
  GENERIC_BLOCKED_REASON,
  GENERIC_REJECTION_REASON,
  decideModeration,
  mergeTags,
  moderateArticle,
  type ModerationImage,
  type ModerationOutcome,
} from "./moderation";
import type { RateLimitResult } from "./rate-limit";
import type { AiContentPart, GenerateInput, GenerateStructured } from "./types";

function fakeResponse(overrides: Partial<{ ok: boolean; contentType: string; bytes: Uint8Array }> = {}) {
  const { ok = true, contentType = "image/webp", bytes = new Uint8Array([1, 2, 3]) } = overrides;
  return {
    ok,
    headers: { get: (name: string) => (name === "content-type" ? contentType : null) },
    arrayBuffer: async () => bytes.buffer,
  } as unknown as Response;
}

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
      title: "Un titulo normal",
      content: "Un articulo normal",
      generate,
      rateLimit: async () => allowed,
    });

    expect(outcome).toEqual({ kind: "result", result: okResult() });
    expect(received?.feature).toBe("moderation");
    expect(received?.timeoutMs).toBe(MODERATION_TIMEOUT_MS);
    expect(received?.contents).toContain("Un articulo normal");
  });

  it("sends the title along with the content, so the AI can judge both", async () => {
    let received: GenerateInput<unknown> | undefined;
    const generate: GenerateStructured = async (input) => {
      received = input as GenerateInput<unknown>;
      return okResult() as never;
    };

    await moderateArticle({
      title: "Titulo ofensivo",
      content: "Contenido normal",
      generate,
      rateLimit: async () => allowed,
    });

    expect(received?.contents).toContain("Titulo ofensivo");
    expect(received?.contents).toContain("Contenido normal");
  });

  it("does not call the model when the rate limit is exceeded", async () => {
    let calls = 0;
    const generate: GenerateStructured = async () => {
      calls += 1;
      return okResult() as never;
    };

    const outcome = await moderateArticle({ title: "", content: "texto", generate, rateLimit: async () => limited });

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
      title: "",
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

    const outcome = await moderateArticle({ title: "", content: "texto", generate, rateLimit: async () => allowed });

    expect(outcome.kind === "error" && outcome.error.kind).toBe("blocked");
  });

  it("maps unknown failures to AiError instead of throwing", async () => {
    const generate: GenerateStructured = async () => {
      throw Object.assign(new Error("boom"), { status: 429 });
    };

    const outcome = await moderateArticle({ title: "", content: "texto", generate, rateLimit: async () => allowed });

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
      title: "",
      content: "texto",
      generate,
      rateLimit: async () => allowed,
      signal: controller.signal,
    });

    expect(received).toBe(controller.signal);
  });
});

describe("moderateArticle with images", () => {
  const allowed: RateLimitResult = { ok: true };
  const images: ModerationImage[] = [
    { url: "https://x.supabase.co/storage/v1/object/public/post-images/u1/cover.webp", label: "la portada" },
    { url: "https://x.supabase.co/storage/v1/object/public/post-images/u1/body.webp", label: "la imagen 1 del cuerpo" },
  ];

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches, encodes and labels each image before calling the model", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse()));

    let received: GenerateInput<unknown> | undefined;
    const generate: GenerateStructured = async (input) => {
      received = input as GenerateInput<unknown>;
      return okResult() as never;
    };

    await moderateArticle({ title: "t", content: "c", images, generate, rateLimit: async () => allowed });

    expect(fetch).toHaveBeenCalledTimes(2);
    const contents = received?.contents;
    if (!contents || typeof contents === "string") throw new Error("se esperaba contents como partes");

    const imageParts = contents.filter((part): part is Extract<AiContentPart, { type: "image" }> => part.type === "image");
    expect(imageParts).toHaveLength(2);
    expect(imageParts[0].mimeType).toBe("image/webp");
    expect(contents.some((part) => part.type === "text" && part.text === "la portada:")).toBe(true);
  });

  it("publishes without AI tags (unavailable) when an image fails to fetch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));

    let calls = 0;
    const generate: GenerateStructured = async () => {
      calls += 1;
      return okResult() as never;
    };

    const outcome = await moderateArticle({ title: "t", content: "c", images, generate, rateLimit: async () => allowed });

    expect(calls).toBe(0);
    expect(outcome.kind === "error" && outcome.error.kind).toBe("unavailable");
  });

  it("drops an image with a disallowed content-type without failing the others", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ contentType: "text/html" }))
      .mockResolvedValueOnce(fakeResponse());
    vi.stubGlobal("fetch", fetchMock);

    let received: GenerateInput<unknown> | undefined;
    const generate: GenerateStructured = async (input) => {
      received = input as GenerateInput<unknown>;
      return okResult() as never;
    };

    await moderateArticle({ title: "t", content: "c", images, generate, rateLimit: async () => allowed });

    const contents = received?.contents;
    if (!contents || typeof contents === "string") throw new Error("se esperaba contents como partes");
    expect(contents.filter((part) => part.type === "image")).toHaveLength(1);
  });

  it("only fetches up to MAX_MODERATION_IMAGES images", async () => {
    const many: ModerationImage[] = Array.from({ length: MAX_MODERATION_IMAGES + 3 }, (_, i) => ({
      url: `https://x.supabase.co/storage/v1/object/public/post-images/u1/${i}.webp`,
      label: `la imagen ${i}`,
    }));
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse()));

    const generate: GenerateStructured = async () => okResult() as never;
    await moderateArticle({ title: "t", content: "c", images: many, generate, rateLimit: async () => allowed });

    expect(fetch).toHaveBeenCalledTimes(MAX_MODERATION_IMAGES);
  });
});
