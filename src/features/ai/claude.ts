import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAiEnv } from "@/lib/env.server";
import { AiError } from "./errors";
import {
  CLAUDE_EFFORT,
  CLAUDE_TOOLS,
  appendJson,
  claudeMaxTokens,
  deltaText,
  finishBlock,
  startBlock,
  toClaudeContent,
  type ClaudeStreamEvent,
  type ToolBlocks,
} from "./claude-protocol";
import { FEATURE_CONFIG } from "./feature-config";
import { modelPartsToStreamParts } from "./function-calls";
import { logged, loggedStream } from "./provider-telemetry";
import type {
  ChatStreamPart,
  GenerateStructured,
  GenerateText,
  GenerateTextInput,
  StreamText,
  StreamTextInput,
} from "./types";

// `toClaudeContent` (claude-protocol.ts) no depende del SDK, así que su `media_type`
// es un `string` suelto; se angosta acá a la unión cerrada que exige el SDK. Es un
// cast seguro porque quien arma las partes de imagen (fetchModerationImage, en
// moderation.ts) ya valida contra IMAGE_ACCEPTED_TYPES (jpeg/png/webp), subconjunto
// de los 4 formatos que Anthropic acepta.
function toRequestContent(contents: GenerateTextInput["contents"]): string | Anthropic.MessageParam["content"] {
  const content = toClaudeContent(contents);
  if (typeof content === "string") return content;

  return content.map((block) =>
    block.type === "text"
      ? block
      : { ...block, source: { ...block.source, media_type: block.source.media_type as Anthropic.Base64ImageSource["media_type"] } },
  );
}

let cached: { key: string; client: Anthropic } | undefined;

function getClient() {
  let env: ReturnType<typeof getAiEnv>;
  try {
    env = getAiEnv();
  } catch {
    throw new AiError("not_configured");
  }

  // El esquema ya la exige cuando AI_PROVIDER=claude; esto la estrecha para el
  // compilador y cubre el caso de llamar a este adaptador directamente.
  const apiKey = env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new AiError("not_configured");
  }

  if (!cached || cached.key !== apiKey) {
    cached = {
      key: apiKey,
      // Sin reintentos del SDK: cada uno gasta cuota, igual que en el adaptador de
      // Gemini (ADR 0017). El tiempo límite lo pone cada función.
      client: new Anthropic({ apiKey, maxRetries: 0 }),
    };
  }

  return { client: cached.client, model: env.CLAUDE_MODEL };
}

// El SDK acepta las opciones de petición como segundo argumento; el AbortSignal
// del llamador se combina con el tiempo límite de la función.
function requestOptions(input: Pick<GenerateTextInput, "timeoutMs" | "signal">) {
  const timeout = AbortSignal.timeout(input.timeoutMs);
  return {
    timeout: input.timeoutMs,
    signal: input.signal ? AbortSignal.any([input.signal, timeout]) : timeout,
  };
}

// Un `stop_reason` de rechazo significa que el contenido tropezó con los filtros:
// equivale al bloqueo de seguridad de Gemini y debe rechazar el artículo, no
// publicarlo sin tags.
function throwIfRefused(stopReason: string | null | undefined) {
  if (stopReason === "refusal") {
    throw new AiError("blocked");
  }
  return stopReason ?? "";
}

async function callText(input: GenerateTextInput): Promise<string> {
  const { client, model } = getClient();
  const { maxOutputTokens } = FEATURE_CONFIG[input.feature];

  const response = await client.messages.create(
    {
      model,
      max_tokens: claudeMaxTokens(maxOutputTokens),
      system: input.system,
      messages: [{ role: "user", content: toRequestContent(input.contents) }],
      output_config: { effort: CLAUDE_EFFORT[input.feature] },
    },
    requestOptions(input),
  );

  // Una respuesta cortada es inservible: medio artículo reescrito no sirve.
  if (throwIfRefused(response.stop_reason) === "max_tokens") {
    throw new AiError("invalid_response");
  }

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  if (!text) {
    throw new AiError("invalid_response");
  }

  return text;
}

async function* rawModelStream(input: StreamTextInput): AsyncGenerator<ChatStreamPart> {
  const { client, model } = getClient();
  const { maxOutputTokens } = FEATURE_CONFIG[input.feature];

  const stream = client.messages.stream(
    {
      model,
      max_tokens: claudeMaxTokens(maxOutputTokens),
      system: input.system,
      messages: input.contents.map(({ role, text }) => ({
        role: role === "model" ? ("assistant" as const) : ("user" as const),
        content: text,
      })),
      // Llamadas terminales: la propuesta se le muestra al autor, nunca se responde
      // al modelo con el resultado de la herramienta. El esquema va tipado como
      // `unknown` en las declaraciones compartidas porque los otros dos proveedores
      // lo toman opaco; acá se estrecha al tipo del SDK.
      tools: CLAUDE_TOOLS as Anthropic.Tool[],
      output_config: { effort: CLAUDE_EFFORT[input.feature] },
    },
    requestOptions(input),
  );

  let blocks: ToolBlocks = {};
  let emitted = false;
  const discarded: string[] = [];

  try {
    for await (const event of stream as AsyncIterable<ClaudeStreamEvent>) {
      blocks = startBlock(blocks, event);
      blocks = appendJson(blocks, event);

      const text = deltaText(event);
      if (text) {
        emitted = true;
        yield { kind: "text", text };
      }

      // A diferencia de OpenRouter, los argumentos están completos al cerrar el
      // bloque, así que la propuesta se emite en el acto y no al final del stream.
      const closed = finishBlock(blocks, event);
      blocks = closed.blocks;
      if (closed.invalid) discarded.push(closed.invalid);
      if (!closed.part) continue;

      const { parts, dropped } = modelPartsToStreamParts([closed.part]);
      discarded.push(...dropped);

      for (const part of parts) {
        emitted = true;
        yield part;
      }
    }

    throwIfRefused((await stream.finalMessage()).stop_reason);
  } finally {
    if (discarded.length > 0) {
      console.info("[ai]", { feature: input.feature, droppedToolCalls: discarded });
    }
  }

  if (!emitted) {
    throw new AiError("invalid_response");
  }
}

export const generateText: GenerateText = (input) => logged(input.feature, () => callText(input));

export const generateStructured: GenerateStructured = (input) =>
  logged(input.feature, async () => {
    const { client, model } = getClient();
    const { maxOutputTokens } = FEATURE_CONFIG[input.feature];

    const response = await client.messages.parse(
      {
        model,
        max_tokens: claudeMaxTokens(maxOutputTokens),
        system: input.system,
        messages: [{ role: "user", content: toRequestContent(input.contents) }],
        output_config: { format: zodOutputFormat(input.schema), effort: CLAUDE_EFFORT[input.feature] },
      },
      requestOptions(input),
    );

    throwIfRefused(response.stop_reason);

    // `parsed_output` viene nulo si la respuesta no encajó en el esquema; se trata
    // igual que un JSON inválido en los otros adaptadores.
    const parsed = response.parsed_output;
    if (parsed === null || parsed === undefined) {
      throw new AiError("invalid_response");
    }

    return parsed;
  });

export const streamText: StreamText = (input) =>
  loggedStream(input.feature, () => rawModelStream(input));
