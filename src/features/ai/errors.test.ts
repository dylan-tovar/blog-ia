import { describe, expect, it } from "vitest";
import {
  AI_ERROR_MESSAGES,
  AI_RATE_LIMITED_GLOBAL_MESSAGE,
  AiError,
  describeUpstreamError,
  isAiError,
  mapGeminiError,
  type AiErrorKind,
} from "./errors";

const KINDS: AiErrorKind[] = [
  "rate_limited",
  "quota",
  "timeout",
  "unavailable",
  "invalid_response",
  "blocked",
  "not_configured",
  "input_too_long",
  "input_too_short",
  "not_allowed",
  "unauthenticated",
];

function withStatus(status: number) {
  return Object.assign(new Error("api error"), { status });
}

describe("AiError", () => {
  it("carries the kind and an optional retryAfter", () => {
    const error = new AiError("rate_limited", { retryAfter: 12 });

    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe("rate_limited");
    expect(error.retryAfter).toBe(12);
  });

  it("uses the Spanish message of the kind by default", () => {
    expect(new AiError("timeout").message).toBe(AI_ERROR_MESSAGES.timeout);
  });

  it("recognises AiError instances only", () => {
    expect(isAiError(new AiError("quota"))).toBe(true);
    expect(isAiError(new Error("quota"))).toBe(false);
    expect(isAiError(null)).toBe(false);
  });

  it.each(KINDS)("has a non-empty user message for %s", (kind) => {
    expect(AI_ERROR_MESSAGES[kind].length).toBeGreaterThan(0);
  });
});

describe("mapGeminiError", () => {
  it("returns AiError instances untouched", () => {
    const original = new AiError("blocked");

    expect(mapGeminiError(original)).toBe(original);
  });

  it("maps HTTP 429 to quota", () => {
    expect(mapGeminiError(withStatus(429)).kind).toBe("quota");
  });

  it.each([500, 502, 503, 504])("maps HTTP %s to unavailable", (status) => {
    expect(mapGeminiError(withStatus(status)).kind).toBe("unavailable");
  });

  it.each([401, 403])("maps HTTP %s (bad key or permissions) to not_configured", (status) => {
    expect(mapGeminiError(withStatus(status)).kind).toBe("not_configured");
  });

  it("maps HTTP 408 to timeout", () => {
    expect(mapGeminiError(withStatus(408)).kind).toBe("timeout");
  });

  it("maps HTTP 404 (unknown model) to not_configured", () => {
    expect(mapGeminiError(withStatus(404)).kind).toBe("not_configured");
  });

  it("maps other 4xx responses to unavailable", () => {
    expect(mapGeminiError(withStatus(400)).kind).toBe("unavailable");
  });

  it.each(["AbortError", "TimeoutError"])("maps a %s to timeout", (name) => {
    const error = new Error("aborted");
    error.name = name;

    expect(mapGeminiError(error).kind).toBe("timeout");
  });

  it("maps a message that mentions a timeout to timeout", () => {
    expect(mapGeminiError(new Error("The operation timed out")).kind).toBe("timeout");
  });

  it("maps network failures to unavailable", () => {
    expect(mapGeminiError(new TypeError("fetch failed")).kind).toBe("unavailable");
  });

  it("maps unknown values to unavailable", () => {
    expect(mapGeminiError("boom").kind).toBe("unavailable");
    expect(mapGeminiError(undefined).kind).toBe("unavailable");
  });
});

describe("not_configured message", () => {
  it("tells the author to check the AI configuration and model", () => {
    expect(AI_ERROR_MESSAGES.not_configured).toMatch(/modelo/i);
  });
});

describe("describeUpstreamError", () => {
  it("reads the HTTP status and the error name", () => {
    expect(describeUpstreamError(withStatus(503))).toEqual({ status: 503, name: "Error" });
  });

  it("reads the code of the underlying cause (undici network errors)", () => {
    const cause = Object.assign(new Error("connect timeout"), { code: "UND_ERR_CONNECT_TIMEOUT" });
    const error = new TypeError("fetch failed", { cause });

    expect(describeUpstreamError(error)).toEqual({ name: "TypeError", causeCode: "UND_ERR_CONNECT_TIMEOUT" });
  });

  it("omits fields that are absent or not the expected type", () => {
    const error = Object.assign(new Error("x", { cause: { code: 42 } }), { status: "500" });

    expect(describeUpstreamError(error)).toEqual({ name: "Error" });
  });

  it("returns an empty object for non-error values", () => {
    expect(describeUpstreamError("boom")).toEqual({});
    expect(describeUpstreamError(undefined)).toEqual({});
  });

  it("never exposes the message", () => {
    const description = describeUpstreamError(new Error("secret prompt text"));

    expect(JSON.stringify(description)).not.toContain("secret");
  });
});

describe("AiError scope", () => {
  it("defaults to no scope", () => {
    expect(new AiError("rate_limited").scope).toBeUndefined();
  });

  it("uses the saturation message for the global scope", () => {
    const error = new AiError("rate_limited", { scope: "global", retryAfter: 5 });

    expect(error.scope).toBe("global");
    expect(error.message).toBe(AI_RATE_LIMITED_GLOBAL_MESSAGE);
    expect(error.message).not.toBe(AI_ERROR_MESSAGES.rate_limited);
  });

  it("keeps the personal message for the user scope", () => {
    expect(new AiError("rate_limited", { scope: "user" }).message).toBe(AI_ERROR_MESSAGES.rate_limited);
  });
});
