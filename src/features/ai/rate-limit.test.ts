import { describe, expect, it } from "vitest";
import { AiError } from "./errors";
import { interpretRateLimitRows, laneKeys, rateLimitToAiError, userRateLimitKey } from "./rate-limit";

describe("userRateLimitKey", () => {
  it("namespaces the user id", () => {
    expect(userRateLimitKey("abc")).toBe("user:abc");
  });
});

describe("interpretRateLimitRows", () => {
  it("accepts an allowed row", () => {
    expect(interpretRateLimitRows([{ allowed: true, scope: null, retry_after: 0 }])).toEqual({ ok: true });
  });

  it("reports the scope and wait of a blocked row", () => {
    expect(interpretRateLimitRows([{ allowed: false, scope: "user", retry_after: 17 }])).toEqual({
      ok: false,
      kind: "rate_limited",
      scope: "user",
      retryAfter: 17,
    });
  });

  it("treats the global scope as blocked too", () => {
    expect(interpretRateLimitRows([{ allowed: false, scope: "global", retry_after: 3 }])).toMatchObject({
      ok: false,
      scope: "global",
    });
  });

  it("never reports a wait shorter than one second", () => {
    expect(interpretRateLimitRows([{ allowed: false, scope: "user", retry_after: 0 }])).toMatchObject({
      retryAfter: 1,
    });
  });

  it.each([
    ["null", null],
    ["an empty list", []],
    ["a malformed row", [{ nope: true }]],
  ])("fails closed on %s", (_label, rows) => {
    expect(interpretRateLimitRows(rows)).toEqual({ ok: false, kind: "unavailable", retryAfter: 0 });
  });
});

describe("rateLimitToAiError", () => {
  it("maps a limited result to rate_limited with retryAfter", () => {
    const error = rateLimitToAiError({ ok: false, kind: "rate_limited", scope: "user", retryAfter: 9 });

    expect(error).toBeInstanceOf(AiError);
    expect(error.kind).toBe("rate_limited");
    expect(error.retryAfter).toBe(9);
  });

  it("maps a limiter outage to unavailable", () => {
    expect(rateLimitToAiError({ ok: false, kind: "unavailable", retryAfter: 0 }).kind).toBe("unavailable");
  });
});

describe("rateLimitToAiError scope", () => {
  it("carries the global scope and uses the saturation message", () => {
    const error = rateLimitToAiError({ ok: false, kind: "rate_limited", scope: "global", retryAfter: 4 });

    expect(error.scope).toBe("global");
    expect(error.message).toMatch(/saturada/i);
    expect(error.retryAfter).toBe(4);
  });

  it("keeps the personal message for the user scope", () => {
    const error = rateLimitToAiError({ ok: false, kind: "rate_limited", scope: "user", retryAfter: 4 });

    expect(error.scope).toBe("user");
    expect(error.message).toMatch(/muy rápido/i);
  });
});

describe("laneKeys", () => {
  it("uses the shared keys for the assistant lane", () => {
    expect(laneKeys("abc", "assist")).toEqual({ userKey: "user:abc", globalKey: "global" });
  });

  it("uses separate keys for the moderation lane so assistants cannot starve it", () => {
    const assist = laneKeys("abc", "assist");
    const moderation = laneKeys("abc", "moderation");

    expect(moderation).toEqual({ userKey: "moderation:user:abc", globalKey: "moderation:global" });
    expect(moderation.userKey).not.toBe(assist.userKey);
    expect(moderation.globalKey).not.toBe(assist.globalKey);
  });
});
