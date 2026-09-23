import { describe, expect, it } from "vitest";
import { AiError } from "./errors";
import { PRESENT_ANALYSIS, PROPOSE_EDIT } from "./function-calls";
import {
  CHAT_TOOLS,
  accumulateToolCalls,
  readCompletionText,
  scanSse,
  throwIfBlocked,
  throwIfErrorBody,
  toMessages,
  toolCallsToModelParts,
} from "./openrouter-protocol";

describe("toMessages", () => {
  it("puts the system instruction first and the string content as the only user turn", () => {
    expect(toMessages("sos un editor", "el artículo")).toEqual([
      { role: "system", content: "sos un editor" },
      { role: "user", content: "el artículo" },
    ]);
  });

  it("maps the model role to assistant, which is como lo nombra el protocolo", () => {
    const messages = toMessages("sistema", [
      { role: "user", text: "hola" },
      { role: "model", text: "qué tal" },
      { role: "user", text: "mejorá el cierre" },
    ]);

    expect(messages.map((message) => message.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(messages[2].content).toBe("qué tal");
  });

  it("keeps only the text parts when given AiContentPart[], dropping images", () => {
    const messages = toMessages("sistema", [
      { type: "text", text: "primera parte" },
      { type: "image", mimeType: "image/webp", data: "AAA" },
      { type: "text", text: "segunda parte" },
    ]);

    expect(messages).toEqual([
      { role: "system", content: "sistema" },
      { role: "user", content: "primera parte\n\nsegunda parte" },
    ]);
  });
});

describe("CHAT_TOOLS", () => {
  it("envuelve cada declaración en el formato de herramientas del protocolo", () => {
    const names = CHAT_TOOLS.map((tool) => tool.function.name);

    expect(names).toContain(PROPOSE_EDIT);
    expect(names).toContain(PRESENT_ANALYSIS);
    expect(CHAT_TOOLS.every((tool) => tool.type === "function")).toBe(true);
    expect(CHAT_TOOLS.every((tool) => typeof tool.function.parameters === "object")).toBe(true);
  });
});

describe("scanSse", () => {
  it("devuelve las cargas completas y guarda la línea cortada para el próximo chunk", () => {
    const { payloads, rest } = scanSse('data: {"a":1}\ndata: {"b":2');

    expect(payloads).toEqual(['{"a":1}']);
    expect(rest).toBe('data: {"b":2');
  });

  it("descarta los comentarios de señal de vida y las líneas vacías", () => {
    const { payloads } = scanSse(': OPENROUTER PROCESSING\n\ndata: {"a":1}\n');

    expect(payloads).toEqual(['{"a":1}']);
  });

  it("tolera el retorno de carro de los saltos de línea del protocolo", () => {
    const { payloads } = scanSse('data: {"a":1}\r\ndata: [DONE]\r\n');

    expect(payloads).toEqual(['{"a":1}', "[DONE]"]);
  });
});

describe("accumulateToolCalls", () => {
  it("junta los argumentos que llegan troceados entre chunks", () => {
    let pending = accumulateToolCalls([], [
      { index: 0, function: { name: PROPOSE_EDIT, arguments: '{"op":"append"' } },
    ]);
    pending = accumulateToolCalls(pending, [{ index: 0, function: { arguments: ',"markdown":"hola"}' } }]);

    expect(pending).toEqual([{ name: PROPOSE_EDIT, args: '{"op":"append","markdown":"hola"}' }]);
  });

  it("separa las llamadas por índice y no por orden de llegada", () => {
    let pending = accumulateToolCalls([], [{ index: 1, function: { name: PRESENT_ANALYSIS, arguments: "{}" } }]);
    pending = accumulateToolCalls(pending, [{ index: 0, function: { name: PROPOSE_EDIT, arguments: "{}" } }]);

    expect(pending[0].name).toBe(PROPOSE_EDIT);
    expect(pending[1].name).toBe(PRESENT_ANALYSIS);
  });

  it("acumula la secuencia real del proveedor: el nombre llega en el primer delta y los argumentos después", () => {
    // Forma observada con `pnpm ai:smoke:openrouter`: el primer delta trae id, type
    // y el nombre con los argumentos vacíos; los siguientes solo traen fragmentos.
    const primero = [
      { index: 0, id: "call_yyt4h3aDXehfI1EldJTSfC42", type: "function", function: { name: PROPOSE_EDIT, arguments: "" } },
    ];
    const siguientes = [{ index: 0, function: { arguments: '{"op":"' } }, { index: 0, function: { arguments: 'append"}' } }];

    let pending = accumulateToolCalls([], primero);
    for (const delta of siguientes) pending = accumulateToolCalls(pending, [delta]);

    expect(pending).toEqual([{ name: PROPOSE_EDIT, args: '{"op":"append"}' }]);
  });

  it("descarta un índice fuera de rango: el proveedor lo controla y se usa como índice de array", () => {
    // Sin esta cota, copiar el acumulador reserva memoria para todos los huecos y
    // el proceso muere con un fallo de V8 que el stream no puede capturar.
    const enorme = accumulateToolCalls([], [{ index: 2147483000, function: { name: PROPOSE_EDIT, arguments: "{}" } }]);
    expect(enorme).toEqual([]);

    for (const index of [-1, 1.5, 32, Number.NaN]) {
      expect(accumulateToolCalls([], [{ index, function: { name: PROPOSE_EDIT, arguments: "{}" } }])).toEqual([]);
    }
  });

  it("deja el acumulador igual cuando el chunk no trae llamadas", () => {
    const pending = [{ name: PROPOSE_EDIT, args: "{}" }];

    expect(accumulateToolCalls(pending, undefined)).toBe(pending);
    expect(accumulateToolCalls(pending, [])).toBe(pending);
  });
});

describe("toolCallsToModelParts", () => {
  it("convierte una llamada completa en la parte que ya sabe validar function-calls", () => {
    const { parts, invalid } = toolCallsToModelParts([
      { name: PROPOSE_EDIT, args: '{"op":"append","markdown":"hola"}' },
    ]);

    expect(invalid).toEqual([]);
    expect(parts).toEqual([
      { functionCall: { name: PROPOSE_EDIT, args: { op: "append", markdown: "hola" } } },
    ]);
  });

  it("reporta la llamada cuyos argumentos no son JSON válido en lugar de romper el stream", () => {
    const { parts, invalid } = toolCallsToModelParts([{ name: PROPOSE_EDIT, args: '{"op":' }]);

    expect(parts).toEqual([]);
    expect(invalid).toEqual([PROPOSE_EDIT]);
  });

  it("trata los argumentos vacíos como un objeto vacío y omite las llamadas sin nombre", () => {
    const { parts, invalid } = toolCallsToModelParts([
      { name: PRESENT_ANALYSIS, args: "" },
      { name: "", args: "{}" },
    ]);

    expect(invalid).toEqual([]);
    expect(parts).toEqual([{ functionCall: { name: PRESENT_ANALYSIS, args: {} } }]);
  });

  it("no filtra al registro el nombre que inventó el modelo: puede derivar del texto del autor", () => {
    const { parts, invalid } = toolCallsToModelParts([
      { name: "buscar_datos_sobre_el_borrador_del_autor", args: "{" },
    ]);

    expect(parts).toEqual([]);
    expect(invalid).toEqual(["unknown"]);
  });

  it("reporta un JSON que no es un objeto, porque no puede ser un juego de argumentos", () => {
    const { parts, invalid } = toolCallsToModelParts([{ name: PROPOSE_EDIT, args: '"texto"' }]);

    expect(parts).toEqual([]);
    expect(invalid).toEqual([PROPOSE_EDIT]);
  });
});

describe("throwIfErrorBody", () => {
  it("no hace nada cuando el cuerpo no trae error", () => {
    expect(() => throwIfErrorBody({})).not.toThrow();
  });

  it("propaga el código del proveedor como status para que el mapeo de errores lo lea", () => {
    expect(() => throwIfErrorBody({ error: { code: 429 } })).toThrowError(
      expect.objectContaining({ status: 429 }),
    );
  });

  it("usa 502 cuando el error no trae código", () => {
    expect(() => throwIfErrorBody({ error: { message: "boom" } })).toThrowError(
      expect.objectContaining({ status: 502 }),
    );
  });
});

describe("throwIfBlocked", () => {
  it("trata el filtro de contenido como bloqueo, igual que los filtros de Gemini", () => {
    expect(() => throwIfBlocked("content_filter")).toThrow(AiError);
    expect(() => throwIfBlocked("content_filter")).toThrowError(
      expect.objectContaining({ kind: "blocked" }),
    );
  });

  it("devuelve el motivo tal cual en cualquier otro caso", () => {
    expect(throwIfBlocked("stop")).toBe("stop");
    expect(throwIfBlocked(null)).toBe("");
  });
});

describe("readCompletionText", () => {
  it("devuelve el texto de la respuesta sin espacios sobrantes", () => {
    expect(readCompletionText({ choices: [{ message: { content: "  hola  " } }] })).toBe("hola");
  });

  it("rechaza una respuesta cortada por tokens: medio JSON no sirve", () => {
    expect(() =>
      readCompletionText({ choices: [{ message: { content: "{" }, finish_reason: "length" }] }),
    ).toThrowError(expect.objectContaining({ kind: "invalid_response" }));
  });

  it("rechaza una respuesta vacía", () => {
    expect(() => readCompletionText({ choices: [{ message: { content: "" } }] })).toThrowError(
      expect.objectContaining({ kind: "invalid_response" }),
    );
    expect(() => readCompletionText({})).toThrowError(
      expect.objectContaining({ kind: "invalid_response" }),
    );
  });

  it("propaga un error que viene dentro del cuerpo con HTTP 200", () => {
    expect(() => readCompletionText({ error: { code: 402 } })).toThrowError(
      expect.objectContaining({ status: 402 }),
    );
  });
});
