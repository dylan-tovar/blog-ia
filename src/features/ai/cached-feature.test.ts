import { describe, expect, it, vi } from "vitest";
import { runCachedFeature } from "./cached-feature";
import { AiError } from "./errors";
import type { RateLimitResult } from "./rate-limit";

const allowed: RateLimitResult = { ok: true };

function setup(overrides: Partial<Parameters<typeof runCachedFeature<string>>[0]> = {}) {
  const rateLimit = vi.fn(async (): Promise<RateLimitResult> => allowed);
  const generate = vi.fn(async () => "fresh");
  const save = vi.fn(async () => true);

  const options = { cached: null, regenerate: false, rateLimit, generate, save, ...overrides };
  return { options, rateLimit, generate, save };
}

describe("runCachedFeature", () => {
  it("returns the cached value without touching the limiter, the model or the cache", async () => {
    const { options, rateLimit, generate, save } = setup({ cached: "stored" });

    await expect(runCachedFeature(options)).resolves.toEqual({ data: "stored", cached: true });
    expect(rateLimit).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("ignores the cache when regenerating, consuming the rate limit and overwriting the cache", async () => {
    const { options, rateLimit, generate, save } = setup({ cached: "stored", regenerate: true });

    await expect(runCachedFeature(options)).resolves.toEqual({ data: "fresh", cached: false });
    expect(rateLimit).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("fresh");
  });

  it("checks the limiter before generating on a cache miss and stores the result", async () => {
    const order: string[] = [];
    const { options } = setup({
      rateLimit: async () => {
        order.push("limit");
        return allowed;
      },
      generate: async () => {
        order.push("generate");
        return "fresh";
      },
      save: async () => {
        order.push("save");
        return true;
      },
    });

    await expect(runCachedFeature(options)).resolves.toEqual({ data: "fresh", cached: false });
    expect(order).toEqual(["limit", "generate", "save"]);
  });

  it("throws rate_limited with retryAfter and never calls the model when over the limit", async () => {
    const { options, generate, save } = setup({
      rateLimit: async () => ({ ok: false, kind: "rate_limited", scope: "user", retryAfter: 23 }),
    });

    await expect(runCachedFeature(options)).rejects.toMatchObject({ kind: "rate_limited", retryAfter: 23 });
    expect(generate).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("fails closed with unavailable when the limiter itself is broken", async () => {
    const { options, generate } = setup({
      rateLimit: async () => ({ ok: false, kind: "unavailable", retryAfter: 0 }),
    });

    await expect(runCachedFeature(options)).rejects.toMatchObject({ kind: "unavailable" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("propagates model failures untouched and stores nothing", async () => {
    const { options, save } = setup({
      generate: async () => {
        throw new AiError("timeout");
      },
    });

    await expect(runCachedFeature(options)).rejects.toMatchObject({ kind: "timeout" });
    expect(save).not.toHaveBeenCalled();
  });

  it("still returns the result when the cache write fails or is refused", async () => {
    const refused = setup({ save: async () => false });
    const broken = setup({
      save: async () => {
        throw new Error("db down");
      },
    });

    await expect(runCachedFeature(refused.options)).resolves.toEqual({ data: "fresh", cached: false });
    await expect(runCachedFeature(broken.options)).resolves.toEqual({ data: "fresh", cached: false });
  });
});
