import { describe, expect, it } from "vitest";
import {
  CLAUDE_EFFORT,
  CLAUDE_MIN_MAX_TOKENS,
  CLAUDE_TOOLS,
  appendJson,
  claudeMaxTokens,
  deltaText,
  finishBlock,
  startBlock,
  type ToolBlocks,
} from "./claude-protocol";
import { PRESENT_ANALYSIS, PROPOSE_EDIT } from "./function-calls";
import type { AiFeature } from "./types";

const start = (index: number, type: string, name?: string) =>
  ({ type: "content_block_start", index, content_block: { type, name } }) as const;

const jsonDelta = (index: number, partial_json: string) =>
  ({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json } }) as const;

const stop = (index: number) => ({ type: "content_block_stop", index }) as const;

describe("CLAUDE_TOOLS", () => {
  it("traduce las declaraciones al campo que espera Claude", () => {
    expect(CLAUDE_TOOLS.map((tool) => tool.name)).toContain(PROPOSE_EDIT);
    expect(CLAUDE_TOOLS.every((tool) => typeof tool.input_schema === "object")).toBe(true);
  });
});

describe("CLAUDE_EFFORT", () => {
  it("cubre todas las funciones de IA", () => {
    const features: AiFeature[] = ["outline", "titles", "tone", "score", "moderation", "summary", "chat"];

    for (const feature of features) {
      expect(CLAUDE_EFFORT[feature]).toBeDefined();
    }
  });
});

describe("claudeMaxTokens", () => {
  it("sube el tope al piso, porque el razonamiento comparte presupuesto", () => {
    expect(claudeMaxTokens(512)).toBe(CLAUDE_MIN_MAX_TOKENS);
  });

  it("respeta un tope ya mayor que el piso", () => {
    expect(claudeMaxTokens(8192)).toBe(8192);
  });
});

describe("startBlock", () => {
  it("registra un bloque de llamada a herramienta", () => {
    expect(startBlock({}, start(0, "tool_use", PROPOSE_EDIT))).toEqual({
      0: { name: PROPOSE_EDIT, json: "" },
    });
  });

  it("ignora los bloques que no son llamadas a herramienta", () => {
    expect(startBlock({}, start(0, "text"))).toEqual({});
    expect(startBlock({}, start(0, "thinking"))).toEqual({});
  });

  it("descarta un índice fuera de rango, que lo controla el proveedor", () => {
    expect(startBlock({}, start(2147483000, "tool_use", PROPOSE_EDIT))).toEqual({});
    expect(startBlock({}, start(-1, "tool_use", PROPOSE_EDIT))).toEqual({});
  });
});

describe("appendJson", () => {
  it("acumula los argumentos que llegan troceados", () => {
    let blocks: ToolBlocks = startBlock({}, start(0, "tool_use", PROPOSE_EDIT));
    blocks = appendJson(blocks, jsonDelta(0, '{"op":"'));
    blocks = appendJson(blocks, jsonDelta(0, 'append"}'));

    expect(blocks[0].json).toBe('{"op":"append"}');
  });

  it("ignora un delta de un bloque que nunca empezó", () => {
    expect(appendJson({}, jsonDelta(3, "{}"))).toEqual({});
  });
});

describe("deltaText", () => {
  it("devuelve el texto de la respuesta", () => {
    expect(deltaText({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hola" } })).toBe(
      "hola",
    );
  });

  it("no devuelve el razonamiento ni los argumentos de herramienta", () => {
    expect(
      deltaText({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", text: "pensando" } }),
    ).toBeUndefined();
    expect(deltaText(jsonDelta(0, '{"op":"append"}'))).toBeUndefined();
  });

  it("ignora los eventos que no son deltas", () => {
    expect(deltaText({ type: "message_start" })).toBeUndefined();
  });
});

describe("finishBlock", () => {
  it("emite la propuesta en cuanto cierra el bloque y lo saca del acumulador", () => {
    let blocks: ToolBlocks = startBlock({}, start(0, "tool_use", PROPOSE_EDIT));
    blocks = appendJson(blocks, jsonDelta(0, '{"op":"append","markdown":"hola"}'));

    const result = finishBlock(blocks, stop(0));

    expect(result.blocks).toEqual({});
    expect(result.invalid).toBeUndefined();
    expect(result.part).toEqual({
      functionCall: { name: PROPOSE_EDIT, args: { op: "append", markdown: "hola" } },
    });
  });

  it("trata los argumentos vacíos como un objeto vacío", () => {
    const blocks = startBlock({}, start(1, "tool_use", PRESENT_ANALYSIS));

    expect(finishBlock(blocks, stop(1)).part).toEqual({
      functionCall: { name: PRESENT_ANALYSIS, args: {} },
    });
  });

  it("reporta el bloque cuyos argumentos quedaron truncados sin romper el stream", () => {
    let blocks: ToolBlocks = startBlock({}, start(0, "tool_use", PROPOSE_EDIT));
    blocks = appendJson(blocks, jsonDelta(0, '{"op":'));

    const result = finishBlock(blocks, stop(0));

    expect(result.part).toBeUndefined();
    expect(result.invalid).toBe(PROPOSE_EDIT);
    expect(result.blocks).toEqual({});
  });

  it("no filtra al registro un nombre inventado por el modelo", () => {
    let blocks: ToolBlocks = startBlock({}, start(0, "tool_use", "buscar_sobre_el_borrador_del_autor"));
    blocks = appendJson(blocks, jsonDelta(0, "{"));

    expect(finishBlock(blocks, stop(0)).invalid).toBe("unknown");
  });

  it("no hace nada al cerrar un bloque de texto", () => {
    expect(finishBlock({}, stop(0))).toEqual({ blocks: {} });
  });
});
