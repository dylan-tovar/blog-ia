import { z } from "zod";
import { idSchema } from "@/features/posts/schemas";
import { POST_TITLE_MAX_LENGTH } from "@/features/posts/constants";
import {
  AI_MAX_INPUT_CHARS,
  AI_TAG_MAX_LENGTH,
  AI_TAG_MIN_LENGTH,
  CHAT_MAX_BLOCKS,
  CHAT_MAX_BLOCK_TYPE_CHARS,
  CHAT_MAX_MESSAGES,
  CHAT_MAX_MESSAGE_CHARS,
  CHAT_MAX_STEPS,
  CHAT_MAX_TOTAL_CHARS,
  CHAT_SELECTION_MAX_CHARS,
  CHAT_STEP_LABEL_MAX_CHARS,
  EDIT_LABEL_MAX_CHARS,
  EDIT_MAX_MARKDOWN_CHARS,
  MAX_AI_TAGS,
  REASON_MAX_LENGTH,
} from "./constants";

const ARTICLE_TOO_LONG = "El artículo es demasiado largo para consultarlo con IA.";

// Response schemas are deliberately a bit more lenient than the prompts ask for
// (e.g. 3–8 titles when we request 5): a slightly-off but usable answer should not
// become a failure. Callers slice to the exact counts.
export const outlineSchema = z.object({
  sections: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(150),
        subsections: z.array(z.string().trim().min(1).max(150)).max(12).default([]),
      }),
    )
    .min(1)
    .max(24),
});

export const titlesSchema = z.object({
  titles: z.array(z.string().trim().min(1).max(150)).min(3).max(8),
});

export const suggestionTypeSchema = z.enum(["claridad", "seo", "engagement"]);

export const contentScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  suggestions: z
    .array(
      z.object({
        type: suggestionTypeSchema,
        text: z.string().trim().min(1).max(400),
      }),
    )
    .max(15),
  keywords: z.array(z.string().trim().min(1).max(60)).max(15),
});

export const articleMetricsSchema = z.object({
  clarity: z.number().int().min(0).max(100).default(70),
  structure: z.number().int().min(0).max(100).default(70),
  tone: z.number().int().min(0).max(100).default(70),
  engagement: z.number().int().min(0).max(100).default(70),
  grammar: z.number().int().min(0).max(100).default(70),
});

export const articleAnalysisSchema = z.object({
  score: z.number().int().min(0).max(100),
  metrics: articleMetricsSchema.default({
    clarity: 70,
    structure: 70,
    tone: 70,
    engagement: 70,
    grammar: 70,
  }),
  verdict: z.string().trim().min(1).max(600),
  strengths: z.array(z.string().trim().min(1).max(300)).max(10),
  weaknesses: z.array(z.string().trim().min(1).max(300)).max(10),
  improvements: z.array(z.string().trim().min(1).max(300)).max(10),
});

export type ArticleMetrics = z.infer<typeof articleMetricsSchema>;
export type ArticleAnalysis = z.infer<typeof articleAnalysisSchema>;

export const moderationSchema = z.object({
  is_appropriate: z.boolean(),
  reason: z.string().default(""),
  suggested_tags: z.array(z.string().max(80)).max(20),
});

export const toneSchema = z.enum(["informal", "formal", "investigacion"]);

export const outlineRequestSchema = z.object({
  topic: z.string().trim().min(3).max(200),
});

export const postAiRequestSchema = z.object({
  postId: idSchema,
  regenerate: z.boolean().default(false),
});

export const toneRequestSchema = z.object({
  postId: idSchema,
  tone: toneSchema,
});

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1, "Escribí un mensaje.").max(CHAT_MAX_MESSAGE_CHARS, "El mensaje es demasiado largo."),
});

// Ids are `b<index of the top-level node>` in the editor document.
export const blockIdSchema = z.string().regex(/^b\d{1,5}$/, "Bloque inválido.");

const chatBlockSchema = z.object({
  id: blockIdSchema,
  type: z.string().min(1).max(CHAT_MAX_BLOCK_TYPE_CHARS),
  level: z.number().int().min(1).max(6).optional(),
  markdown: z.string().max(AI_MAX_INPUT_CHARS, ARTICLE_TOO_LONG),
});

const chatSelectionSchema = z.object({
  blockIds: z.array(blockIdSchema).max(CHAT_MAX_BLOCKS),
  text: z.string().max(CHAT_SELECTION_MAX_CHARS, "La selección es demasiado larga."),
});

// The article is the live editor state (no post id to load): title, top-level blocks and selection.
// The caps keep the worst case (3-byte characters) under MAX_AI_BODY_BYTES.
export const chatRequestSchema = z
  .object({
    title: z.string().max(POST_TITLE_MAX_LENGTH, "El título es demasiado largo."),
    blocks: z.array(chatBlockSchema).max(CHAT_MAX_BLOCKS, ARTICLE_TOO_LONG),
    // Blocks in the whole document; `blocks` may be a subset when the client had to cut it.
    totalBlocks: z.number().int().min(0).max(100_000),
    selection: chatSelectionSchema.nullish(),
    fingerprint: z.string().regex(/^[0-9a-f]{8}$/),
    messages: z.array(chatMessageSchema).min(1, "Escribí un mensaje.").max(CHAT_MAX_MESSAGES, "La conversación es demasiado larga."),
  })
  .refine(({ blocks, totalBlocks }) => totalBlocks >= blocks.length, "Datos inválidos.")
  .refine(
    ({ blocks }) => blocks.reduce((sum, block) => sum + block.markdown.length, 0) <= AI_MAX_INPUT_CHARS,
    ARTICLE_TOO_LONG,
  )
  .refine(({ messages }) => messages.at(-1)?.role === "user", "El último mensaje debe ser del usuario.")
  .refine(
    ({ messages }) => messages.reduce((sum, message) => sum + message.content.length, 0) <= CHAT_MAX_TOTAL_CHARS,
    "La conversación es demasiado larga.",
  );

// An empty label from the model is treated as no label.
const editLabel = z
  .string()
  .trim()
  .max(EDIT_LABEL_MAX_CHARS)
  .transform((label) => label || undefined)
  .optional();

const editMarkdown = z.string().trim().min(1).max(EDIT_MAX_MARKDOWN_CHARS);

// Structural validation only; whether the block ids exist is checked against the request's blocks.
export const editActionSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("insert_after_block"), blockId: blockIdSchema, markdown: editMarkdown, label: editLabel }),
  z.object({ op: z.literal("insert_at_selection"), markdown: editMarkdown, label: editLabel }),
  z.object({ op: z.literal("append"), markdown: editMarkdown, label: editLabel }),
  z.object({ op: z.literal("replace_block"), blockId: blockIdSchema, markdown: editMarkdown, label: editLabel }),
  z.object({ op: z.literal("replace_selection"), markdown: editMarkdown, label: editLabel }),
  z.object({
    op: z.literal("replace_range"),
    fromBlockId: blockIdSchema,
    toBlockId: blockIdSchema,
    markdown: editMarkdown,
    label: editLabel,
  }),
]);

const stepId = z.string().trim().min(1).max(40);
const stepLabel = z.string().trim().min(1).max(CHAT_STEP_LABEL_MAX_CHARS);

export const chatStepSchema = z.object({
  id: stepId,
  label: stepLabel,
  status: z.enum(["pending", "running", "done"]),
});

const planStepItem = z.union([
  z.object({ id: stepId.optional(), label: stepLabel }),
  stepLabel.transform((label) => ({ id: undefined, label })),
]);

// Arguments of the model's `update_plan` tool call.
export const chatPlanSchema = z.object({
  steps: z.array(planStepItem).min(1).max(CHAT_MAX_STEPS),
});

export type EditAction = z.infer<typeof editActionSchema>;
export type ChatStep = z.infer<typeof chatStepSchema>;
export type ChatPlan = z.infer<typeof chatPlanSchema>;
export type Outline = z.infer<typeof outlineSchema>;
export type ContentScore = z.infer<typeof contentScoreSchema>;
export type Moderation = z.infer<typeof moderationSchema>;
export type Tone = z.infer<typeof toneSchema>;

const TAG_PATTERN = /^[a-z0-9áéíóúñü][a-z0-9áéíóúñü -]*$/;

export function normalizeAiTags(tags: string[]): string[] {
  const seen = new Set<string>();

  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (tag.length < AI_TAG_MIN_LENGTH || tag.length > AI_TAG_MAX_LENGTH) continue;
    if (!TAG_PATTERN.test(tag)) continue;
    seen.add(tag);
  }

  return [...seen].slice(0, MAX_AI_TAGS);
}

export function truncateReason(reason: string) {
  return reason.trim().slice(0, REASON_MAX_LENGTH);
}

function stripUnsupportedKeywords(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripUnsupportedKeywords);
  }
  if (typeof node === "object" && node !== null) {
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => key !== "$schema" && key !== "additionalProperties")
        .map(([key, value]) => [key, stripUnsupportedKeywords(value)]),
    );
  }
  return node;
}

// Gemini's `responseJsonSchema` takes plain JSON Schema; `$schema` and
// `additionalProperties` are not needed (the response is re-validated with Zod).
export function toResponseJsonSchema(schema: z.ZodType): unknown {
  return stripUnsupportedKeywords(z.toJSONSchema(schema, { io: "input" }));
}
