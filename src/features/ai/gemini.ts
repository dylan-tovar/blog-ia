import "server-only";
import { FunctionCallingConfigMode, GoogleGenAI, type GenerateContentConfig, type GenerateContentResponse } from "@google/genai";
import { getAiEnv } from "@/lib/env.server";
import { CHAT_FIRST_CHUNK_TIMEOUT_MS } from "./constants";
import { AiError } from "./errors";
import { FEATURE_CONFIG } from "./feature-config";
import { withFirstChunkDeadline } from "./first-chunk-deadline";
import { CHAT_TOOL_DECLARATIONS, modelPartsToStreamParts } from "./function-calls";
import { logged, loggedStream } from "./provider-telemetry";
import { toResponseJsonSchema } from "./schemas";
import { thinkingConfigFor } from "./thinking";
import type {
  ChatStreamPart,
  GenerateStructured,
  GenerateText,
  GenerateTextInput,
  StreamText,
  StreamTextInput,
} from "./types";

// Finish reasons that mean the content itself tripped Gemini's safety filters.
const BLOCKED_FINISH_REASONS = new Set(["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"]);

let cached: { key: string; client: GoogleGenAI } | undefined;

function getClient() {
  let env: ReturnType<typeof getAiEnv>;
  try {
    env = getAiEnv();
  } catch {
    throw new AiError("not_configured");
  }

  // El esquema ya exige la clave cuando AI_PROVIDER=gemini; esto la estrecha
  // para el compilador y cubre el caso de llamar a este adaptador directamente.
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AiError("not_configured");
  }

  if (!cached || cached.key !== apiKey) {
    cached = { key: apiKey, client: new GoogleGenAI({ apiKey }) };
  }

  return { client: cached.client, model: env.GEMINI_MODEL };
}

function requestConfig(
  input: Pick<GenerateTextInput, "feature" | "system" | "timeoutMs" | "signal">,
  model: string,
): GenerateContentConfig {
  const { temperature, maxOutputTokens } = FEATURE_CONFIG[input.feature];

  const timeout = AbortSignal.timeout(input.timeoutMs);
  const abortSignal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;

  return {
    systemInstruction: input.system,
    temperature,
    maxOutputTokens,
    abortSignal,
    // The SDK retries 429/5xx by default; every retry burns free-tier quota.
    httpOptions: { timeout: input.timeoutMs, retryOptions: { attempts: 1 } },
    thinkingConfig: thinkingConfigFor(model),
  };
}

function throwIfBlocked(response: GenerateContentResponse) {
  if (response.promptFeedback?.blockReason) {
    throw new AiError("blocked");
  }

  const finishReason = String(response.candidates?.[0]?.finishReason ?? "");
  if (BLOCKED_FINISH_REASONS.has(finishReason)) {
    throw new AiError("blocked");
  }

  return finishReason;
}

async function callModel(input: GenerateTextInput, responseJsonSchema?: unknown): Promise<string> {
  const { client, model } = getClient();

  const response = await client.models.generateContent({
    model,
    contents: input.contents,
    config: {
      ...requestConfig(input, model),
      ...(responseJsonSchema ? { responseMimeType: "application/json", responseJsonSchema } : {}),
    },
  });

  const finishReason = throwIfBlocked(response);
  // A cut-off answer is unusable (half a JSON document, half a rewritten article).
  if (finishReason === "MAX_TOKENS") {
    throw new AiError("invalid_response");
  }

  const text = response.text?.trim();
  if (!text) {
    throw new AiError("invalid_response");
  }

  return text;
}

async function* rawModelStream(input: StreamTextInput): AsyncGenerator<ChatStreamPart> {
  const { client, model } = getClient();

  const stream = await client.models.generateContentStream({
    model,
    contents: input.contents.map(({ role, text }) => ({ role, parts: [{ text }] })),
    config: {
      ...requestConfig(input, model),
      // Terminal calls: proposals are shown to the author, never answered with a functionResponse.
      tools: [{ functionDeclarations: [...CHAT_TOOL_DECLARATIONS] }],
      toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
    },
  });

  let emitted = false;
  for await (const chunk of stream) {
    throwIfBlocked(chunk);

    // MAX_TOKENS is not an error here: a chat answer cut short is still useful, unlike JSON or a rewrite.
    // Parts are read directly: `chunk.text` warns whenever the chunk carries a function call.
    const { parts, dropped } = modelPartsToStreamParts(chunk.candidates?.[0]?.content?.parts);
    if (dropped.length > 0) console.info("[ai]", { feature: input.feature, droppedToolCalls: dropped });

    for (const part of parts) {
      emitted = true;
      yield part;
    }
  }

  if (!emitted) {
    throw new AiError("invalid_response");
  }
}

// The deadline also aborts the request, otherwise the stalled call would keep running upstream.
function callModelStream(input: StreamTextInput): AsyncGenerator<ChatStreamPart> {
  const deadline = new AbortController();
  const signal = input.signal ? AbortSignal.any([input.signal, deadline.signal]) : deadline.signal;

  return withFirstChunkDeadline(
    rawModelStream({ ...input, signal }),
    CHAT_FIRST_CHUNK_TIMEOUT_MS,
    () => deadline.abort(),
  );
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
  loggedStream(input.feature, () => callModelStream(input));
