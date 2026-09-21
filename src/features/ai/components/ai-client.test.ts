import { describe, expect, it } from "vitest";
import { callAiRoute, markSuperseded } from "./ai-client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("callAiRoute", () => {
  it("posts JSON to the feature route and returns the data on success", async () => {
    let seen: { url: string; init?: RequestInit } | undefined;
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), init };
      return jsonResponse({ ok: true, data: { titles: ["a"], cached: false } });
    };

    const result = await callAiRoute("titles", { postId: "p1" }, undefined, fetcher);

    expect(result).toEqual({ ok: true, data: { titles: ["a"], cached: false } });
    expect(seen?.url).toBe("/api/ai/titles");
    expect(seen?.init?.method).toBe("POST");
    expect(seen?.init?.body).toBe(JSON.stringify({ postId: "p1" }));
    expect(new Headers(seen?.init?.headers).get("content-type")).toBe("application/json");
  });

  it("passes a typed server error through untouched", async () => {
    const error = { kind: "rate_limited", message: "Esperá", retryAfter: 9 };
    const fetcher = async () => jsonResponse({ ok: false, error });

    expect(await callAiRoute("score", { postId: "p1" }, undefined, fetcher)).toEqual({
      ok: false,
      error,
    });
  });

  it("keeps the typed error from a 4xx response", async () => {
    const error = { kind: "unauthenticated", message: "Iniciá sesión" };
    const fetcher = async () => jsonResponse({ ok: false, error }, 401);

    expect(await callAiRoute("outline", { topic: "x" }, undefined, fetcher)).toEqual({
      ok: false,
      error,
    });
  });

  it("maps a non-JSON body to an unavailable error instead of throwing", async () => {
    const fetcher = async () => new Response("<html>oops</html>", { status: 502 });

    const result = await callAiRoute("tone", { postId: "p", tone: "formal" }, undefined, fetcher);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unavailable");
  });

  it("maps a JSON body with an unexpected shape to unavailable", async () => {
    const fetcher = async () => jsonResponse({ hello: "world" });

    const result = await callAiRoute("outline", { topic: "x" }, undefined, fetcher);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unavailable");
  });

  it("maps a network failure to unavailable", async () => {
    const fetcher = async () => {
      throw new TypeError("Failed to fetch");
    };

    const result = await callAiRoute("titles", { postId: "p" }, undefined, fetcher);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unavailable");
  });

  it("reports an aborted request as aborted", async () => {
    const fetcher = async () => {
      throw new DOMException("Aborted", "AbortError");
    };

    const result = await callAiRoute("titles", { postId: "p" }, undefined, fetcher);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("aborted");
  });
});

describe("markSuperseded", () => {
  const aborted = { ok: false as const, error: { kind: "aborted" as const, message: "Solicitud cancelada." } };

  it("turns an abort the caller did not ask for into a visible 'superseded' error", () => {
    const result = markSuperseded(aborted, false);

    expect(result).toMatchObject({ ok: false, error: { kind: "superseded" } });
  });

  it("keeps a silent abort when the caller itself cancelled", () => {
    expect(markSuperseded(aborted, true)).toBe(aborted);
  });

  it("leaves successes and other errors untouched", () => {
    const ok = { ok: true as const, data: 1 };
    const timeout = { ok: false as const, error: { kind: "timeout" as const, message: "t" } };

    expect(markSuperseded(ok, false)).toBe(ok);
    expect(markSuperseded(timeout, false)).toBe(timeout);
  });
});
