import "server-only";
import type { z } from "zod";
import { saveAiCache } from "./cache.server";
import { parseCachedScore, parseCachedTitles } from "./cache";
import { runCachedFeature } from "./cached-feature";
import {
  CHAT_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  MIN_WORDS_SCORE,
  MIN_WORDS_TITLES,
  MIN_WORDS_TONE,
  OUTLINE_MAX_SECTIONS,
  OUTLINE_MAX_SUBSECTIONS,
  TITLES_COUNT,
  TONE_MAX_INPUT_CHARS,
  TONE_TIMEOUT_MS,
} from "./constants";
import { runChatStream } from "./chat-stream";
import { AiError } from "./errors";
import { generateStructured, generateText, streamText } from "./provider.server";
import { cleanToneOutput } from "./output";
import { loadOwnArticleForAi } from "./posts.server";
import {
  buildChatContents,
  buildOutlinePrompt,
  buildScorePrompt,
  buildTitlesPrompt,
  buildTonePrompt,
  selectVisibleBlocks,
} from "./prompts";
import { checkAiRateLimit, enforceAiRateLimit } from "./rate-limit.server";
import type { AiRouteContext } from "./route-runner.server";
import {
  contentScoreSchema,
  outlineSchema,
  titlesSchema,
  type ContentScore,
  type chatRequestSchema,
  type outlineRequestSchema,
  type postAiRequestSchema,
  type toneRequestSchema,
} from "./schemas";
import { assertMinWords } from "./words";

type OutlineBody = z.infer<typeof outlineRequestSchema>;
type PostBody = z.infer<typeof postAiRequestSchema>;
type ToneBody = z.infer<typeof toneRequestSchema>;
type ChatBody = z.infer<typeof chatRequestSchema>;

export type OutlineData = { sections: { title: string; subsections: string[] }[] };
export type TitlesData = { titles: string[]; cached: boolean };
export type ToneData = { markdown: string };
export type ScoreData = { analysis: ContentScore; cached: boolean };

export async function handleOutline({ body, user, signal }: AiRouteContext<OutlineBody>): Promise<OutlineData> {
  await enforceAiRateLimit(user.id);

  const { systemInstruction, contents } = buildOutlinePrompt(body.topic);
  const outline = await generateStructured({
    feature: "outline",
    system: systemInstruction,
    contents,
    schema: outlineSchema,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    signal,
  });

  return {
    sections: outline.sections.slice(0, OUTLINE_MAX_SECTIONS).map((section) => ({
      title: section.title,
      subsections: section.subsections.slice(0, OUTLINE_MAX_SUBSECTIONS),
    })),
  };
}

export async function handleTitles(context: AiRouteContext<PostBody>): Promise<TitlesData> {
  const { body, user, signal } = context;
  const post = await loadOwnArticleForAi(context, body.postId);
  assertMinWords(post.content, MIN_WORDS_TITLES);

  const { data, cached } = await runCachedFeature({
    cached: parseCachedTitles(post.ai_generated_titles),
    regenerate: body.regenerate,
    rateLimit: () => checkAiRateLimit(user.id),
    generate: async () => {
      const { systemInstruction, contents } = buildTitlesPrompt(post.content);
      const result = await generateStructured({
        feature: "titles",
        system: systemInstruction,
        contents,
        schema: titlesSchema,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        signal,
      });
      return result.titles.slice(0, TITLES_COUNT);
    },
    // `updated_at` goes back exactly as read: Postgres keeps microseconds, a JS Date
    // round-trip would truncate them and the compare-and-set would never match.
    save: (titles) => saveAiCache(post.id, post.updated_at, { ai_generated_titles: titles }),
  });

  return { titles: data, cached };
}

export async function handleScore(context: AiRouteContext<PostBody>): Promise<ScoreData> {
  const { body, user, signal } = context;
  const post = await loadOwnArticleForAi(context, body.postId);
  assertMinWords(post.content, MIN_WORDS_SCORE);

  const { data, cached } = await runCachedFeature({
    cached: parseCachedScore(post.content_score),
    regenerate: body.regenerate,
    rateLimit: () => checkAiRateLimit(user.id),
    generate: async () => {
      const { systemInstruction, contents } = buildScorePrompt(post.content);
      return generateStructured({
        feature: "score",
        system: systemInstruction,
        contents,
        schema: contentScoreSchema,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        signal,
      });
    },
    save: (analysis) => saveAiCache(post.id, post.updated_at, { content_score: analysis }),
  });

  return { analysis: data, cached };
}

export async function handleTone(context: AiRouteContext<ToneBody>): Promise<ToneData> {
  const { body, user, signal } = context;
  const post = await loadOwnArticleForAi(context, body.postId);

  if (post.content.length > TONE_MAX_INPUT_CHARS) {
    throw new AiError("input_too_long");
  }
  assertMinWords(post.content, MIN_WORDS_TONE);

  await enforceAiRateLimit(user.id);

  const { systemInstruction, contents } = buildTonePrompt(post.content, body.tone);
  const text = await generateText({
    feature: "tone",
    system: systemInstruction,
    contents,
    timeoutMs: TONE_TIMEOUT_MS,
    signal,
  });

  return { markdown: cleanToneOutput(text) };
}

// Rate limiting (assist lane, shared with the quick actions) happens in `runAiStreamRoute`.
export function handleChat({ body, signal }: AiRouteContext<ChatBody>) {
  const article = { title: body.title, blocks: body.blocks, totalBlocks: body.totalBlocks, selection: body.selection };
  const { systemInstruction, contents } = buildChatContents(article, body.messages);

  const model = streamText({ feature: "chat", system: systemInstruction, contents, timeoutMs: CHAT_TIMEOUT_MS, signal });

  return runChatStream(model, {
    // Actions are checked against exactly what the model was shown.
    blocks: selectVisibleBlocks(article),
    totalBlocks: body.totalBlocks,
    hasSelection: Boolean(body.selection),
    // Metadata only, like the rest of the AI logs: never the article or the proposed text.
    onDrop: ({ op, reason }) => console.info("[ai]", { feature: "chat", droppedAction: op, reason }),
  });
}
