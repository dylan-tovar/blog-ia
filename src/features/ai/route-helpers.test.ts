import { describe, expect, it } from "vitest";
import { AiError } from "./errors";
import {
  MAX_AI_BODY_BYTES,
  checkAiRequestHeaders,
  isSameOrigin,
  parseJsonText,
  readBodyWithLimit,
  toErrorBody,
} from "./route-helpers";

describe("isSameOrigin", () => {
  it("accepts an origin whose host matches the request host", () => {
    expect(isSameOrigin("http://localhost:3000", "localhost:3000")).toBe(true);
    expect(isSameOrigin("https://blog.example.com", "blog.example.com")).toBe(true);
  });

  it("compares hosts case-insensitively", () => {
    expect(isSameOrigin("https://Blog.Example.com", "blog.example.com")).toBe(true);
  });

  it("rejects a different host", () => {
    expect(isSameOrigin("https://evil.example.com", "blog.example.com")).toBe(false);
  });

  it("rejects a different port", () => {
    expect(isSameOrigin("http://localhost:4000", "localhost:3000")).toBe(false);
  });

  it("rejects a host that only shares a suffix", () => {
    expect(isSameOrigin("https://evilblog.example.com", "blog.example.com")).toBe(false);
  });

  it.each([
    ["a missing origin", null],
    ["an empty origin", ""],
    ["the opaque 'null' origin", "null"],
    ["a malformed origin", "not a url"],
  ])("rejects %s", (_label, origin) => {
    expect(isSameOrigin(origin, "localhost:3000")).toBe(false);
  });

  it("rejects a missing host", () => {
    expect(isSameOrigin("http://localhost:3000", null)).toBe(false);
  });
});

describe("checkAiRequestHeaders", () => {
  const valid = {
    contentType: "application/json",
    origin: "http://localhost:3000",
    host: "localhost:3000",
    contentLength: "120",
  };

  it("accepts a same-origin JSON request", () => {
    expect(checkAiRequestHeaders(valid)).toBeNull();
  });

  it("accepts a JSON content type with parameters", () => {
    expect(checkAiRequestHeaders({ ...valid, contentType: "application/json; charset=utf-8" })).toBeNull();
  });

  it("accepts a request without content-length", () => {
    expect(checkAiRequestHeaders({ ...valid, contentLength: null })).toBeNull();
  });

  it("rejects a foreign origin with 403", () => {
    expect(checkAiRequestHeaders({ ...valid, origin: "https://evil.example.com" })).toMatchObject({
      status: 403,
      kind: "forbidden",
    });
  });

  it("rejects a missing origin with 403", () => {
    expect(checkAiRequestHeaders({ ...valid, origin: null })).toMatchObject({ status: 403, kind: "forbidden" });
  });

  it.each([
    ["missing", null],
    ["form-encoded", "application/x-www-form-urlencoded"],
    ["plain text", "text/plain"],
    ["multipart", "multipart/form-data; boundary=x"],
  ])("rejects a %s content type with 415", (_label, contentType) => {
    expect(checkAiRequestHeaders({ ...valid, contentType })).toMatchObject({
      status: 415,
      kind: "bad_request",
    });
  });

  it("rejects a declared body larger than the limit with 413", () => {
    expect(checkAiRequestHeaders({ ...valid, contentLength: String(MAX_AI_BODY_BYTES + 1) })).toMatchObject({
      status: 413,
      kind: "bad_request",
    });
  });

  it("checks the origin before anything else", () => {
    expect(
      checkAiRequestHeaders({ ...valid, origin: "https://evil.example.com", contentType: "text/plain" }),
    ).toMatchObject({ status: 403 });
  });
});

describe("parseJsonText", () => {
  it("parses valid JSON", () => {
    expect(parseJsonText('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("rejects malformed JSON with 400", () => {
    expect(parseJsonText("{not json")).toMatchObject({ ok: false, rejection: { status: 400, kind: "bad_request" } });
  });

  it("rejects an empty body with 400", () => {
    expect(parseJsonText("")).toMatchObject({ ok: false, rejection: { status: 400 } });
  });

  it("rejects a body over the limit with 413, measuring bytes and not characters", () => {
    const multiByte = "é".repeat(MAX_AI_BODY_BYTES / 2 + 1);

    expect(parseJsonText(JSON.stringify({ text: multiByte }))).toMatchObject({
      ok: false,
      rejection: { status: 413 },
    });
  });

  it("honours a custom limit", () => {
    expect(parseJsonText('{"a":"bbbbbbbbbb"}', 5)).toMatchObject({ ok: false, rejection: { status: 413 } });
  });
});

describe("toErrorBody", () => {
  it("serialises an AiError with its Spanish message", () => {
    expect(toErrorBody(new AiError("timeout"))).toEqual({
      ok: false,
      error: { kind: "timeout", message: new AiError("timeout").message },
    });
  });

  it("includes retryAfter only when present", () => {
    expect(toErrorBody(new AiError("rate_limited", { retryAfter: 12 })).error.retryAfter).toBe(12);
    expect("retryAfter" in toErrorBody(new AiError("quota")).error).toBe(false);
  });

  it("serialises a request rejection", () => {
    expect(toErrorBody({ kind: "forbidden", message: "Origen no permitido." })).toEqual({
      ok: false,
      error: { kind: "forbidden", message: "Origen no permitido." },
    });
  });
});

describe("toErrorBody scope", () => {
  it("includes the rate-limit scope when present", () => {
    const body = toErrorBody(new AiError("rate_limited", { retryAfter: 3, scope: "global" }));

    expect(body.error.scope).toBe("global");
  });

  it("omits the scope when there is none", () => {
    expect("scope" in toErrorBody(new AiError("quota")).error).toBe(false);
  });
});

function streamOf(chunks: string[], onCancel?: () => void) {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index += 1;
      } else {
        controller.close();
      }
    },
    cancel() {
      onCancel?.();
    },
  });
}

describe("readBodyWithLimit", () => {
  it("returns the whole text when it fits in the budget", async () => {
    const result = await readBodyWithLimit(streamOf(['{"a":', '"b"}']), 100);

    expect(result).toEqual({ ok: true, text: '{"a":"b"}' });
  });

  it("returns an empty text when there is no body", async () => {
    expect(await readBodyWithLimit(null, 100)).toEqual({ ok: true, text: "" });
  });

  it("rejects with 413 as soon as the running total exceeds the budget", async () => {
    let cancelled = false;
    const stream = streamOf(["aaaa", "bbbb", "cccc", "dddd"], () => {
      cancelled = true;
    });

    const result = await readBodyWithLimit(stream, 6);

    expect(result).toMatchObject({ ok: false, rejection: { status: 413 } });
    expect(cancelled).toBe(true);
  });

  it("counts bytes, not characters", async () => {
    const result = await readBodyWithLimit(streamOf(["éééé"]), 5);

    expect(result).toMatchObject({ ok: false, rejection: { status: 413 } });
  });

  it("accepts a body of exactly the budget", async () => {
    expect(await readBodyWithLimit(streamOf(["12345"]), 5)).toEqual({ ok: true, text: "12345" });
  });
});
