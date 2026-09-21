import "server-only";
import { FunctionCallingConfigMode, GoogleGenAI, type GenerateContentConfig, type GenerateContentResponse } from "@google/genai";
import { getAiEnv } from "@/lib/env.server";
import { CHAT_FIRST_CHUNK_TIMEOUT_MS } from "./constants";
import { AiError, describeUpstreamError, mapGeminiError } from "./errors";
import { withFirstChunkDeadline } from "./first-chunk-deadline";
import { CHAT_TOOL_DECLARATIONS, modelPartsToStreamParts } from "./function-calls";
import { toResponseJsonSchema } from "./schemas";
import { thinkingConfigFor } from "./thinking";
import type {
  AiFeature,
  ChatStreamPart,
  GenerateStructured,
  GenerateText,
  GenerateTextInput,
  StreamText,
  StreamTextInput,
} from "./types";

const FEATURE_CONFIG: Record<AiFeature, { temperature: number; maxOutputTokens: number }> = {
  outline: { temperature: 0.8, maxOutputTokens: 2048 },
  titles: { temperature: 0.9, maxOutputTokens: 512 },
  tone: { temperature: 0.6, maxOutputTokens: 8192 },
  score: { temperature: 0.2, maxOutputTokens: 2048 },
  moderation: { temperature: 0, maxOutputTokens: 512 },
  summary: { temperature: 0.3, maxOutputTokens: 512 },
  // Room for a text answer plus edit proposals that carry Markdown.
  chat: { temperature: 0.7, maxOutputTokens: 8192 },
};

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

  if (!cached || cached.key !== env.GEMINI_API_KEY) {
    cached = { key: env.GEMINI_API_KEY, client: new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }) };
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

// Logs metadata only: never the prompt, the response or the API key.
async function logged<T>(feature: AiFeature, run: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const value = await run();
    console.info("[ai]", { feature, ms: Date.now() - startedAt, ok: true });
    return value;
  } catch (error) {
    const mapped = mapGeminiError(error);
    console.info("[ai]", {
      feature,
      ms: Date.now() - startedAt,
      ok: false,
      kind: mapped.kind,
      ...describeUpstreamError(error),
    });
    throw mapped;
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

export const streamText: StreamText = async function* (input) {
  const startedAt = Date.now();
  try {
    yield* callModelStream(input);
    console.info("[ai]", { feature: input.feature, ms: Date.now() - startedAt, ok: true });
  } catch (error) {
    const mapped = mapGeminiError(error);
    console.info("[ai]", {
      feature: input.feature,
      ms: Date.now() - startedAt,
      ok: false,
      kind: mapped.kind,
      ...describeUpstreamError(error),
    });
    throw mapped;
  }
};
