import { describe, expect, it } from "vitest";
import { AiError } from "./errors";
import { createNdjsonParser, type ChatStreamEvent } from "./stream-protocol";
import { streamAiResponse } from "./stream-response";
import type { ChatStreamPart } from "./types";

async function readEvents(response: Response) {
  const parser = createNdjsonParser();
  const decoder = new TextDecoder();
  const events: ChatStreamEvent[] = [];
  const reader = response.body!.getReader();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    events.push(...parser.push(decoder.decode(value, { stream: true })));
  }

  return events;
}

async function* yields(...parts: string[]): AsyncGenerator<ChatStreamPart> {
  for (const text of parts) yield { kind: "text", text };
}

async function* emits(...parts: ChatStreamPart[]) {
  for (const part of parts) yield part;
}

const allow = async () => undefined;

describe("streamAiResponse", () => {
  it("streams deltas then done as NDJSON", async () => {
    const response = await streamAiResponse({
      requestSignal: new AbortController().signal,
      rateLimit: allow,
      source: () => yields("Hola", " mundo"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/x-ndjson/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await readEvents(response)).toEqual([
      { type: "delta", text: "Hola" },
      { type: "delta", text: " mundo" },
      { type: "done" },
    ]);
  });

  it("encodes step and action parts in order, between the text", async () => {
    const step = { id: "read", label: "Leyendo el artículo", status: "done" } as const;
    const action = { op: "append", markdown: "## Conclusión" } as const;

    const response = await streamAiResponse({
      requestSignal: new AbortController().signal,
      rateLimit: allow,
      source: () =>
        emits({ kind: "step", step }, { kind: "text", text: "Te propongo" }, { kind: "action", action }),
    });

    expect(await readEvents(response)).toEqual([
      { type: "step", step },
      { type: "delta", text: "Te propongo" },
      { type: "action", action },
      { type: "done" },
    ]);
  });

  it("answers a rate-limit failure as the JSON error union, before any stream exists", async () => {
    let started = false;
    const response = await streamAiResponse({
      requestSignal: new AbortController().signal,
      rateLimit: async () => {
        throw new AiError("rate_limited", { retryAfter: 30, scope: "user" });
      },
      source: () => {
        started = true;
        return yields("nunca");
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { kind: "rate_limited", retryAfter: 30, scope: "user" },
    });
    expect(started).toBe(false);
  });

  it("emits an error line after the text already streamed, then closes", async () => {
    async function* failing(): AsyncGenerator<ChatStreamPart> {
      yield { kind: "text", text: "parcial" };
      throw new AiError("blocked");
    }

    const response = await streamAiResponse({
      requestSignal: new AbortController().signal,
      rateLimit: allow,
      source: () => failing(),
    });

    const events = await readEvents(response);
    expect(events[0]).toEqual({ type: "delta", text: "parcial" });
    expect(events[1]).toMatchObject({ type: "error", error: { kind: "blocked" } });
    expect(events).toHaveLength(2);
  });

  it("maps an unknown failure to a typed error line without leaking its message", async () => {
    async function* failing(): AsyncGenerator<ChatStreamPart> {
      throw new Error("secret internal detail");
    }

    const response = await streamAiResponse({
      requestSignal: new AbortController().signal,
      rateLimit: allow,
      source: () => failing(),
    });

    const [event] = await readEvents(response);
    expect(event).toMatchObject({ type: "error", error: { kind: "unavailable" } });
    expect(JSON.stringify(event)).not.toContain("secret");
  });

  it("frames a failure thrown before the first chunk as an error line", async () => {
    const response = await streamAiResponse({
      requestSignal: new AbortController().signal,
      rateLimit: allow,
      source: () => {
        throw new AiError("not_configured");
      },
    });

    expect(await readEvents(response)).toEqual([
      { type: "error", error: { kind: "not_configured", message: expect.any(String) } },
    ]);
  });

  it("aborts the upstream call when the consumer cancels the stream", async () => {
    let upstream: AbortSignal | undefined;
    async function* endless(signal: AbortSignal): AsyncGenerator<ChatStreamPart> {
      upstream = signal;
      while (!signal.aborted) {
        yield { kind: "text", text: "x" };
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    }

    const response = await streamAiResponse({
      requestSignal: new AbortController().signal,
      rateLimit: allow,
      source: (signal) => endless(signal),
    });
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();

    expect(upstream?.aborted).toBe(true);
  });

  it("aborts the upstream call when the request itself is aborted", async () => {
    const request = new AbortController();
    let upstream: AbortSignal | undefined;
    async function* waits(signal: AbortSignal): AsyncGenerator<ChatStreamPart> {
      upstream = signal;
      await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
      yield { kind: "text", text: "nunca" };
    }

    const response = await streamAiResponse({
      requestSignal: request.signal,
      rateLimit: allow,
      source: (signal) => waits(signal),
    });
    const pending = readEvents(response);
    await new Promise((resolve) => setTimeout(resolve, 5));
    request.abort();

    expect(await pending).toEqual([]);
    expect(upstream?.aborted).toBe(true);
  });
});
