import "server-only";
import { getAiEnv } from "@/lib/env.server";
import { CHAT_FIRST_CHUNK_TIMEOUT_MS } from "./constants";
import { AiError } from "./errors";
import { FEATURE_CONFIG } from "./feature-config";
import { modelPartsToStreamParts } from "./function-calls";
import {
  CHAT_TOOLS,
  SSE_DONE,
  accumulateToolCalls,
  readCompletionText,
  scanSse,
  throwIfBlocked,
  throwIfErrorBody,
  toMessages,
  toolCallsToModelParts,
  type OpenAiChunk,
  type PendingToolCall,
} from "./openrouter-protocol";
import { logged, loggedStream } from "./provider-telemetry";
import { toResponseJsonSchema } from "./schemas";
import type {
  ChatStreamPart,
  GenerateStructured,
  GenerateText,
  GenerateTextInput,
  StreamText,
  StreamTextInput,
} from "./types";

const COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

function getConfig() {
  let env: ReturnType<typeof getAiEnv>;
  try {
    env = getAiEnv();
  } catch {
    throw new AiError("not_configured");
  }

  // El esquema ya los exige cuando AI_PROVIDER=openrouter; esto los estrecha para
  // el compilador y cubre el caso de llamar a este adaptador directamente.
  const { OPENROUTER_API_KEY: apiKey, OPENROUTER_MODEL: model } = env;
  if (!apiKey || !model) {
    throw new AiError("not_configured");
  }

  return { apiKey, model };
}

function abortSignalFor(input: Pick<GenerateTextInput, "timeoutMs" | "signal">) {
  const timeout = AbortSignal.timeout(input.timeoutMs);
  return input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
}

// Sin reintentos: `fetch` no reintenta por su cuenta y cada llamada extra gasta
// saldo, igual que en el adaptador de Gemini (ADR 0017).
async function post(body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
  const { apiKey, model } = getConfig();

  const response = await fetch(COMPLETIONS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      // Atribución del tráfico en el panel de OpenRouter. No lleva datos del usuario.
      "x-title": "blog-ia",
    },
    body: JSON.stringify({ model, ...body }),
    signal,
  });

  if (!response.ok) {
    // El cuerpo no se lee (puede repetir fragmentos del prompt) pero sí se cancela:
    // un cuerpo abandonado retiene la conexión hasta que la recoja el recolector,
    // y una racha de errores llega a agotar el pool.
    await response.body?.cancel().catch(() => {});

    // Dos estados de OpenRouter no significan lo mismo que en el mapeo genérico:
    // 403 es su moderación de entrada marcando el contenido, no un problema de
    // credenciales. Equivale al bloqueo de seguridad de Gemini, así que al publicar
    // debe rechazar el artículo en vez de publicarlo sin tags.
    if (response.status === 403) throw new AiError("blocked");
    // 402 es falta de saldo: es agotamiento de cuota, no una caída del servicio.
    if (response.status === 402) throw new AiError("quota");

    throw Object.assign(new Error("openrouter request failed"), { status: response.status });
  }

  return response;
}

async function callModel(input: GenerateTextInput, responseJsonSchema?: unknown): Promise<string> {
  const { temperature, maxOutputTokens } = FEATURE_CONFIG[input.feature];

  const response = await post(
    {
      messages: toMessages(input.system, input.contents),
      temperature,
      max_tokens: maxOutputTokens,
      ...(responseJsonSchema
        ? {
            response_format: {
              type: "json_schema",
              json_schema: { name: input.feature, schema: responseJsonSchema },
            },
          }
        : {}),
    },
    abortSignalFor(input),
  );

  return readCompletionText(await response.json());
}

async function* rawModelStream(input: StreamTextInput): AsyncGenerator<ChatStreamPart> {
  const { temperature, maxOutputTokens } = FEATURE_CONFIG[input.feature];

  // El plazo del primer fragmento vigila que el proveedor esté respondiendo, no que
  // ya haya una parte que emitir. Es la diferencia con Gemini: aquí una respuesta
  // hecha solo de llamadas a herramienta no produce ninguna parte hasta que el
  // stream termina, y medirlo con `withFirstChunkDeadline` convertiría este plazo
  // en el de la respuesta entera y cortaría respuestas que iban bien.
  const stalled = new AbortController();
  let firstChunkTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(
    () => stalled.abort(),
    CHAT_FIRST_CHUNK_TIMEOUT_MS,
  );
  const providerIsAlive = () => {
    if (!firstChunkTimer) return;
    clearTimeout(firstChunkTimer);
    firstChunkTimer = undefined;
  };

  let pending: PendingToolCall[] = [];
  let emitted = false;

  try {
    const response = await post(
      {
        messages: toMessages(input.system, input.contents),
        temperature,
        max_tokens: maxOutputTokens,
        stream: true,
        // Llamadas terminales: la propuesta se le muestra al autor, nunca se responde
        // al modelo con el resultado de la herramienta.
        tools: CHAT_TOOLS,
        tool_choice: "auto",
      },
      AbortSignal.any([abortSignalFor(input), stalled.signal]),
    );

    if (!response.body) {
      throw new AiError("invalid_response");
    }

    // Acumula el estado de una carga y devuelve el texto que haya que emitir. El
    // `yield` queda en el bucle porque una función anidada no puede emitirlo.
    const consume = (payload: string): { text?: string; done?: boolean } => {
      if (payload === SSE_DONE) return { done: true };

      let chunk: OpenAiChunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        // Una línea suelta ilegible no invalida el resto del stream.
        return {};
      }

      throwIfErrorBody(chunk);

      const choice = chunk.choices?.[0];
      // Que la respuesta se corte no es un error en el chat, a diferencia del JSON
      // o de una reescritura: el texto parcial le sigue sirviendo al autor.
      throwIfBlocked(choice?.finish_reason);

      pending = accumulateToolCalls(pending, choice?.delta?.tool_calls);

      const text = choice?.delta?.content;
      return text ? { text } : {};
    };

    const decoder = new TextDecoder();
    let buffer = "";
    let done = false;

    for await (const bytes of response.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(bytes, { stream: true });

      const { payloads, rest } = scanSse(buffer);
      buffer = rest;
      if (payloads.length > 0) providerIsAlive();

      for (const payload of payloads) {
        const { text, done: finished } = consume(payload);
        if (finished) {
          done = true;
          break;
        }
        if (text) {
          emitted = true;
          yield { kind: "text", text };
        }
      }

      if (done) break;
    }

    // El proveedor puede cortar sin el salto de línea final, y esa última carga
    // todavía puede traer el cierre del JSON de una propuesta.
    buffer += decoder.decode();
    if (!done && buffer.trim()) {
      for (const payload of scanSse(`${buffer}\n`).payloads) {
        const { text, done: finished } = consume(payload);
        if (finished) break;
        if (text) {
          emitted = true;
          yield { kind: "text", text };
        }
      }
    }
  } finally {
    providerIsAlive();
  }

  // Las llamadas a herramienta llegan troceadas entre chunks: solo se pueden
  // validar y emitir cuando el stream termina y los argumentos están completos.
  const { parts: modelParts, invalid } = toolCallsToModelParts(pending);
  const { parts, dropped } = modelPartsToStreamParts(modelParts);

  const discarded = [...invalid, ...dropped];
  if (discarded.length > 0) {
    console.info("[ai]", { feature: input.feature, droppedToolCalls: discarded });
  }

  for (const part of parts) {
    emitted = true;
    yield part;
  }

  if (!emitted) {
    throw new AiError("invalid_response");
  }
}

export const generateText: GenerateText = (input) => logged(input.feature, () => callModel(input));

export const generateStructured: GenerateStructured = (input) =>
  logged(input.feature, async () => {
    const text = await callModel(input, toResponseJsonSchema(input.schema));

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AiError("invalid_response");
    }

    const parsed = input.schema.safeParse(json);
    if (!parsed.success) {
      throw new AiError("invalid_response");
    }

    return parsed.data;
  });

export const streamText: StreamText = (input) =>
  loggedStream(input.feature, () => rawModelStream(input));
