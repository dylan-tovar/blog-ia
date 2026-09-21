import { describe, expect, it } from "vitest";
import { encodeStreamEvent, type ChatStreamEvent } from "@/features/ai/stream-protocol";
import { streamChat } from "./chat-client";

const BODY = {
  title: "Mi artículo",
  blocks: [{ id: "b0", type: "paragraph", markdown: "texto" }],
  totalBlocks: 1,
  selection: null,
  fingerprint: "0badc0de",
  messages: [{ role: "user" as const, content: "hola" }],
};

function ndjsonResponse(chunks: string[], init: { contentType?: string } = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });

  return new Response(body, { headers: { "content-type": init.contentType ?? "application/x-ndjson; charset=utf-8" } });
}

const lines = (...events: ChatStreamEvent[]) => events.map(encodeStreamEvent);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("streamChat", () => {
  it("posts the JSON body to the chat route", async () => {
    let seen: { url: string; init?: RequestInit } | undefined;
    const fetcher = async (url: string, init?: RequestInit) => {
      seen = { url, init };
      return ndjsonResponse(lines({ type: "done" }));
    };

    await streamChat(BODY, { onDelta: () => undefined, fetcher });

    expect(seen?.url).toBe("/api/ai/chat");
    expect(seen?.init?.method).toBe("POST");
    expect(seen?.init?.body).toBe(JSON.stringify(BODY));
    expect(new Headers(seen?.init?.headers).get("content-type")).toBe("application/json");
  });

  it("forwards every delta in order and resolves ok on done", async () => {
    const deltas: string[] = [];
    const fetcher = async () =>
      ndjsonResponse(lines({ type: "delta", text: "Hola" }, { type: "delta", text: " mundo" }, { type: "done" }));

    const result = await streamChat(BODY, { onDelta: (text) => deltas.push(text), fetcher });

    expect(result).toEqual({ ok: true, data: null });
    expect(deltas).toEqual(["Hola", " mundo"]);
  });

  it("forwards steps and actions through their callbacks, in order with the deltas", async () => {
    const seen: string[] = [];
    const step = { id: "read", label: "Leyendo el artículo", status: "done" } as const;
    const action = { op: "insert_after_block", blockId: "b0", markdown: "## Nuevo" } as const;
    const fetcher = async () =>
      ndjsonResponse(
        lines({ type: "step", step }, { type: "delta", text: "Hola" }, { type: "action", action }, { type: "done" }),
      );

    const result = await streamChat(BODY, {
      onDelta: (text) => seen.push(`delta:${text}`),
      onStep: (received) => seen.push(`step:${received.id}`),
      onAction: (received) => seen.push(`action:${received.op}`),
      fetcher,
    });

    expect(result).toEqual({ ok: true, data: null });
    expect(seen).toEqual(["step:read", "delta:Hola", "action:insert_after_block"]);
  });

  it("works without step and action callbacks", async () => {
    const step = { id: "read", label: "Leyendo el artículo", status: "done" } as const;
    const fetcher = async () => ndjsonResponse(lines({ type: "step", step }, { type: "done" }));

    expect(await streamChat(BODY, { onDelta: () => undefined, fetcher })).toEqual({ ok: true, data: null });
  });

  it("ignores events from a newer server that it does not know", async () => {
    const deltas: string[] = [];
    const fetcher = async () =>
      ndjsonResponse(['{"type":"citation","url":"x"}\n', ...lines({ type: "delta", text: "ok" }, { type: "done" })]);

    const result = await streamChat(BODY, { onDelta: (text) => deltas.push(text), fetcher });

    expect(result).toEqual({ ok: true, data: null });
    expect(deltas).toEqual(["ok"]);
  });

  it("reassembles events that arrive split across network chunks", async () => {
    const deltas: string[] = [];
    const [first, second] = lines({ type: "delta", text: "partido" }, { type: "done" });
    const fetcher = async () => ndjsonResponse([first.slice(0, 10), first.slice(10) + second.slice(0, 5), second.slice(5)]);

    const result = await streamChat(BODY, { onDelta: (text) => deltas.push(text), fetcher });

    expect(result.ok).toBe(true);
    expect(deltas).toEqual(["partido"]);
  });

  it("returns the typed error of an error line and keeps the text streamed before it", async () => {
    const deltas: string[] = [];
    const error = { kind: "blocked", message: "Bloqueado" } as const;
    const fetcher = async () => ndjsonResponse(lines({ type: "delta", text: "algo" }, { type: "error", error }));

    const result = await streamChat(BODY, { onDelta: (text) => deltas.push(text), fetcher });

    expect(result).toEqual({ ok: false, error });
    expect(deltas).toEqual(["algo"]);
  });

  it("takes the JSON branch for a pre-stream error, without touching onDelta", async () => {
    const error = { kind: "rate_limited", message: "Esperá", retryAfter: 20 };
    const deltas: string[] = [];
    const fetcher = async () => jsonResponse({ ok: false, error });

    const result = await streamChat(BODY, { onDelta: (text) => deltas.push(text), fetcher });

    expect(result).toEqual({ ok: false, error });
    expect(deltas).toEqual([]);
  });

  it("keeps the typed error of a 4xx JSON response", async () => {
    const error = { kind: "unauthenticated", message: "Iniciá sesión" };

    const result = await streamChat(BODY, { onDelta: () => undefined, fetcher: async () => jsonResponse({ ok: false, error }, 401) });

    expect(result).toEqual({ ok: false, error });
  });

  it("maps an unexpected content type or shape to unavailable", async () => {
    const html = await streamChat(BODY, {
      onDelta: () => undefined,
      fetcher: async () => new Response("<html>oops</html>", { status: 502, headers: { "content-type": "text/html" } }),
    });
    const odd = await streamChat(BODY, { onDelta: () => undefined, fetcher: async () => jsonResponse({ hello: "world" }) });

    expect(html).toMatchObject({ ok: false, error: { kind: "unavailable" } });
    expect(odd).toMatchObject({ ok: false, error: { kind: "unavailable" } });
  });

  it("reports a stream that ends without a done line as unavailable", async () => {
    const deltas: string[] = [];
    const fetcher = async () => ndjsonResponse(lines({ type: "delta", text: "cortado" }));

    const result = await streamChat(BODY, { onDelta: (text) => deltas.push(text), fetcher });

    expect(result).toMatchObject({ ok: false, error: { kind: "unavailable" } });
    expect(deltas).toEqual(["cortado"]);
  });

  it("maps a network failure to unavailable instead of throwing", async () => {
    const fetcher = async () => {
      throw new TypeError("Failed to fetch");
    };

    expect(await streamChat(BODY, { onDelta: () => undefined, fetcher })).toMatchObject({
      ok: false,
      error: { kind: "unavailable" },
    });
  });

  it("reports an abort before the response as aborted", async () => {
    const fetcher = async () => {
      throw new DOMException("Aborted", "AbortError");
    };

    expect(await streamChat(BODY, { onDelta: () => undefined, fetcher })).toMatchObject({
      ok: false,
      error: { kind: "aborted" },
    });
  });

  it("reports an abort in the middle of the stream as aborted and stops reading", async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    const deltas: string[] = [];
    const fetcher = async (_url: string, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(encoder.encode(encodeStreamEvent({ type: "delta", text: "uno" })));
          init?.signal?.addEventListener("abort", () => stream.error(new DOMException("Aborted", "AbortError")));
        },
      });
      return new Response(body, { headers: { "content-type": "application/x-ndjson" } });
    };

    const result = await streamChat(BODY, {
      onDelta: (text) => {
        deltas.push(text);
        controller.abort();
      },
      signal: controller.signal,
      fetcher,
    });

    expect(result).toMatchObject({ ok: false, error: { kind: "aborted" } });
    expect(deltas).toEqual(["uno"]);
  });
});
