import { describe, expect, it } from "vitest";
import type { ArticleAnalysis } from "./schemas";
import { createNdjsonParser, encodeStreamEvent } from "./stream-protocol";

const delta = (text: string) => ({ type: "delta", text }) as const;

const step = { id: "read", label: "Leyendo el artículo", status: "done" } as const;
const action = { op: "insert_after_block", blockId: "b2", markdown: "## Nuevo", label: "Agregar sección" } as const;
const analysis: ArticleAnalysis = {
  score: 85,
  metrics: {
    clarity: 90,
    structure: 80,
    tone: 85,
    engagement: 80,
    grammar: 90,
  },
  verdict: "Buen artículo con bases sólidas.",
  strengths: ["Excelente introducción", "Buen ritmo"],
  weaknesses: ["Falta profundizar en la conclusión"],
  improvements: ["Agregar un llamado a la acción al final"],
};

describe("encodeStreamEvent", () => {
  it("serialises one event per line", () => {
    expect(encodeStreamEvent({ type: "done" })).toBe('{"type":"done"}\n');
    expect(encodeStreamEvent(delta("a\nb"))).toBe('{"type":"delta","text":"a\\nb"}\n');
  });

  it("serialises step, action and analysis events", () => {
    expect(encodeStreamEvent({ type: "step", step })).toBe(`{"type":"step","step":${JSON.stringify(step)}}\n`);
    expect(encodeStreamEvent({ type: "action", action })).toBe(`{"type":"action","action":${JSON.stringify(action)}}\n`);
    expect(encodeStreamEvent({ type: "analysis", analysis })).toBe(`{"type":"analysis","analysis":${JSON.stringify(analysis)}}\n`);
  });
});

describe("createNdjsonParser", () => {
  it("parses several events delivered in one chunk", () => {
    const parser = createNdjsonParser();

    const events = parser.push(`${encodeStreamEvent(delta("hola"))}${encodeStreamEvent(delta(" mundo"))}${encodeStreamEvent({ type: "done" })}`);

    expect(events).toEqual([delta("hola"), delta(" mundo"), { type: "done" }]);
  });

  it("buffers a line split across chunks", () => {
    const parser = createNdjsonParser();

    expect(parser.push('{"type":"del')).toEqual([]);
    expect(parser.push('ta","text":"hola"}')).toEqual([]);
    expect(parser.push("\n")).toEqual([delta("hola")]);
  });

  it("keeps a trailing partial line for the next chunk", () => {
    const parser = createNdjsonParser();

    expect(parser.push('{"type":"delta","text":"a"}\n{"type":"delta","te')).toEqual([delta("a")]);
    expect(parser.push('xt":"b"}\n')).toEqual([delta("b")]);
  });

  it("handles multi-byte text split as decoded strings", () => {
    const parser = createNdjsonParser();

    expect(parser.push(encodeStreamEvent(delta("¿Qué tal? 🙂")))).toEqual([delta("¿Qué tal? 🙂")]);
  });

  it("parses an error event with its retry data", () => {
    const parser = createNdjsonParser();
    const error = { kind: "rate_limited", message: "Esperá", retryAfter: 12, scope: "user" } as const;

    expect(parser.push(encodeStreamEvent({ type: "error", error }))).toEqual([{ type: "error", error }]);
  });

  it("parses step, action and analysis events", () => {
    const parser = createNdjsonParser();

    const events = parser.push(
      `${encodeStreamEvent({ type: "step", step })}${encodeStreamEvent({ type: "action", action })}${encodeStreamEvent({ type: "analysis", analysis })}`,
    );

    expect(events).toEqual([
      { type: "step", step },
      { type: "action", action },
      { type: "analysis", analysis },
    ]);
  });

  it("keeps an action whose markdown holds newlines and quotes intact", () => {
    const parser = createNdjsonParser();
    const markdown = '## Título\n\n"cita" y `código`';

    expect(parser.push(encodeStreamEvent({ type: "action", action: { op: "append", markdown } }))).toEqual([
      { type: "action", action: { op: "append", markdown } },
    ]);
  });

  it.each([
    ["an unknown op", '{"type":"action","action":{"op":"explode","markdown":"x"}}'],
    ["an action without payload", '{"type":"action"}'],
    ["an action missing its block id", '{"type":"action","action":{"op":"replace_block","markdown":"x"}}'],
    ["a step with an unknown status", '{"type":"step","step":{"id":"a","label":"x","status":"exploded"}}'],
    ["a step without payload", '{"type":"step"}'],
    ["an analysis without payload", '{"type":"analysis"}'],
    ["an analysis with out-of-range score", '{"type":"analysis","analysis":{"score":105}}'],
  ])("skips %s and keeps parsing", (_label, line) => {
    const parser = createNdjsonParser();

    expect(parser.push(`${line}\n${encodeStreamEvent(delta("ok"))}`)).toEqual([delta("ok")]);
  });

  it("ignores event types it does not know yet", () => {
    const parser = createNdjsonParser();

    expect(parser.push(`{"type":"citation","url":"x"}\n${encodeStreamEvent({ type: "done" })}`)).toEqual([{ type: "done" }]);
  });

  it("skips malformed lines and keeps parsing", () => {
    const parser = createNdjsonParser();

    const events = parser.push(`not json\n{"type":"nope"}\n{"type":"delta"}\n{"type":"error","error":{}}\n${encodeStreamEvent(delta("ok"))}`);

    expect(events).toEqual([delta("ok")]);
  });

  it("ignores blank lines and tolerates CRLF", () => {
    const parser = createNdjsonParser();

    expect(parser.push('\n\r\n{"type":"done"}\r\n')).toEqual([{ type: "done" }]);
  });

  it("flush emits a final line that has no newline", () => {
    const parser = createNdjsonParser();

    expect(parser.push('{"type":"done"}')).toEqual([]);
    expect(parser.flush()).toEqual([{ type: "done" }]);
    expect(parser.flush()).toEqual([]);
  });

  it("flush drops an incomplete final line", () => {
    const parser = createNdjsonParser();

    parser.push('{"type":"delta","te');

    expect(parser.flush()).toEqual([]);
  });
});
