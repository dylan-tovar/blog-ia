import { describe, expect, it } from "vitest";
import { z } from "zod";
import { POST_TITLE_MAX_LENGTH } from "@/features/posts/constants";
import {
  AI_MAX_INPUT_CHARS,
  CHAT_MAX_BLOCKS,
  CHAT_MAX_BLOCK_TYPE_CHARS,
  CHAT_MAX_MESSAGE_CHARS,
  CHAT_MAX_MESSAGES,
  CHAT_MAX_STEPS,
  CHAT_MAX_TOTAL_CHARS,
  CHAT_SELECTION_MAX_CHARS,
  CHAT_STEP_LABEL_MAX_CHARS,
  EDIT_LABEL_MAX_CHARS,
  EDIT_MAX_MARKDOWN_CHARS,
} from "./constants";
import { MAX_AI_BODY_BYTES } from "./route-helpers";
import {
  blockIdSchema,
  chatPlanSchema,
  chatRequestSchema,
  chatStepSchema,
  contentScoreSchema,
  editActionSchema,
  moderationSchema,
  normalizeAiTags,
  outlineRequestSchema,
  outlineSchema,
  postAiRequestSchema,
  titlesSchema,
  toneRequestSchema,
  toneSchema,
  toResponseJsonSchema,
  truncateReason,
} from "./schemas";

const POST_ID = "3f8a3b6e-8f1d-4c56-9d21-7b1f5d2a9c10";

describe("outlineSchema", () => {
  it("accepts sections with subsections", () => {
    const result = outlineSchema.safeParse({
      sections: [{ title: "Intro", subsections: ["Contexto", "Objetivo"] }],
    });

    expect(result.success).toBe(true);
  });

  it("defaults missing subsections to an empty list", () => {
    const result = outlineSchema.parse({ sections: [{ title: "Intro" }] });

    expect(result.sections[0].subsections).toEqual([]);
  });

  it.each([
    ["no sections", { sections: [] }],
    ["a blank title", { sections: [{ title: "  ", subsections: [] }] }],
    ["a non-array payload", { sections: "Intro" }],
    ["a missing key", {}],
  ])("rejects %s", (_label, value) => {
    expect(outlineSchema.safeParse(value).success).toBe(false);
  });
});

describe("titlesSchema", () => {
  it("accepts between 3 and 8 titles", () => {
    expect(titlesSchema.safeParse({ titles: ["a", "b", "c"] }).success).toBe(true);
    expect(titlesSchema.safeParse({ titles: Array(8).fill("titulo") }).success).toBe(true);
  });

  it.each([
    ["too few", { titles: ["a", "b"] }],
    ["too many", { titles: Array(9).fill("titulo") }],
    ["blank entries", { titles: ["a", "b", " "] }],
    ["wrong type", { titles: "a" }],
  ])("rejects %s", (_label, value) => {
    expect(titlesSchema.safeParse(value).success).toBe(false);
  });
});

describe("contentScoreSchema", () => {
  const valid = {
    score: 78,
    suggestions: [{ type: "claridad", text: "Acortá las oraciones." }],
    keywords: ["nextjs", "supabase"],
  };

  it("accepts a well-formed score", () => {
    expect(contentScoreSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["a score above 100", { ...valid, score: 101 }],
    ["a negative score", { ...valid, score: -1 }],
    ["a fractional score", { ...valid, score: 50.5 }],
    ["an unknown suggestion type", { ...valid, suggestions: [{ type: "otro", text: "x" }] }],
    ["an empty suggestion text", { ...valid, suggestions: [{ type: "seo", text: "" }] }],
  ])("rejects %s", (_label, value) => {
    expect(contentScoreSchema.safeParse(value).success).toBe(false);
  });
});

describe("moderationSchema", () => {
  it("accepts an appropriate verdict", () => {
    const result = moderationSchema.safeParse({
      is_appropriate: true,
      reason: "",
      suggested_tags: ["ia", "escritura"],
    });

    expect(result.success).toBe(true);
  });

  it("accepts a long reason (it is truncated later, not rejected)", () => {
    const result = moderationSchema.safeParse({
      is_appropriate: false,
      reason: "x".repeat(900),
      suggested_tags: [],
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["a non-boolean verdict", { is_appropriate: "yes", reason: "", suggested_tags: [] }],
    ["missing tags", { is_appropriate: true, reason: "" }],
    ["tags that are not strings", { is_appropriate: true, reason: "", suggested_tags: [1] }],
  ])("rejects %s", (_label, value) => {
    expect(moderationSchema.safeParse(value).success).toBe(false);
  });
});

describe("truncateReason", () => {
  it("keeps short reasons and trims whitespace", () => {
    expect(truncateReason("  Contenido ofensivo  ")).toBe("Contenido ofensivo");
  });

  it("caps long reasons at 300 characters", () => {
    expect(truncateReason("x".repeat(900))).toHaveLength(300);
  });
});

describe("normalizeAiTags", () => {
  it("lowercases, trims and dedupes", () => {
    expect(normalizeAiTags([" IA ", "ia", "Next JS", "next js"])).toEqual(["ia", "next js"]);
  });

  it("drops tags that are too short, too long or use invalid characters", () => {
    expect(normalizeAiTags(["a", "x".repeat(31), "hola!", "ok-tag", "año"])).toEqual(["ok-tag", "año"]);
  });

  it("caps the list at 5 tags", () => {
    expect(normalizeAiTags(["uno", "dos", "tres", "cuatro", "cinco", "seis", "siete"])).toEqual([
      "uno",
      "dos",
      "tres",
      "cuatro",
      "cinco",
    ]);
  });

  it("returns an empty list for empty input", () => {
    expect(normalizeAiTags([])).toEqual([]);
  });
});

describe("request schemas", () => {
  it("validates an outline topic between 3 and 200 characters", () => {
    expect(outlineRequestSchema.safeParse({ topic: "  Arquitectura hexagonal  " }).success).toBe(true);
    expect(outlineRequestSchema.safeParse({ topic: "ab" }).success).toBe(false);
    expect(outlineRequestSchema.safeParse({ topic: "x".repeat(201) }).success).toBe(false);
  });

  it("trims the topic", () => {
    expect(outlineRequestSchema.parse({ topic: "  tema  " }).topic).toBe("tema");
  });

  it("validates post requests and defaults regenerate to false", () => {
    expect(postAiRequestSchema.parse({ postId: POST_ID }).regenerate).toBe(false);
    expect(postAiRequestSchema.parse({ postId: POST_ID, regenerate: true }).regenerate).toBe(true);
    expect(postAiRequestSchema.safeParse({ postId: "nope" }).success).toBe(false);
  });

  it("validates the tone request", () => {
    expect(toneRequestSchema.safeParse({ postId: POST_ID, tone: "formal" }).success).toBe(true);
    expect(toneRequestSchema.safeParse({ postId: POST_ID, tone: "sarcastico" }).success).toBe(false);
  });

  it("only allows the three tones", () => {
    expect(toneSchema.options).toEqual(["informal", "formal", "investigacion"]);
  });
});

describe("toResponseJsonSchema", () => {
  it("returns a JSON Schema without $schema or additionalProperties", () => {
    const schema = z.object({ a: z.string(), nested: z.object({ b: z.number() }) });

    const json = JSON.stringify(toResponseJsonSchema(schema));

    expect(json).not.toContain("$schema");
    expect(json).not.toContain("additionalProperties");
    expect(json).toContain('"properties"');
  });

  it("keeps required fields and enums", () => {
    const json = toResponseJsonSchema(z.object({ type: z.enum(["seo", "claridad"]) })) as {
      required?: string[];
      properties: { type: { enum: string[] } };
    };

    expect(json.required).toEqual(["type"]);
    expect(json.properties.type.enum).toEqual(["seo", "claridad"]);
  });

  it("produces a usable schema for every response schema", () => {
    for (const schema of [outlineSchema, titlesSchema, contentScoreSchema, moderationSchema]) {
      expect(() => toResponseJsonSchema(schema)).not.toThrow();
    }
  });
});

const block = (index: number, markdown = "texto") => ({ id: `b${index}`, type: "paragraph", markdown });

describe("chatRequestSchema", () => {
  const valid = {
    title: "Mi artículo",
    blocks: [block(0), { id: "b1", type: "heading", level: 2, markdown: "## Intro" }],
    totalBlocks: 2,
    selection: null,
    fingerprint: "0badc0de",
    messages: [{ role: "user", content: "¿Cómo lo mejoro?" }],
  };

  it("accepts an article with a conversation that ends on a user message", () => {
    const result = chatRequestSchema.safeParse({
      ...valid,
      messages: [
        { role: "user", content: "hola" },
        { role: "assistant", content: "¿En qué te ayudo?" },
        { role: "user", content: "mejorá la intro" },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("accepts an empty article and a missing selection", () => {
    expect(chatRequestSchema.safeParse({ ...valid, blocks: [], totalBlocks: 0 }).success).toBe(true);
    expect(chatRequestSchema.safeParse({ ...valid, selection: undefined }).success).toBe(true);
  });

  it("accepts a selection that points at blocks", () => {
    const result = chatRequestSchema.safeParse({ ...valid, selection: { blockIds: ["b1"], text: "Intro" } });

    expect(result.success).toBe(true);
  });

  it("accepts a document larger than what was sent when totalBlocks says so", () => {
    expect(chatRequestSchema.safeParse({ ...valid, totalBlocks: 40 }).success).toBe(true);
  });

  it("rejects totalBlocks smaller than the blocks sent", () => {
    expect(chatRequestSchema.safeParse({ ...valid, totalBlocks: 1 }).success).toBe(false);
  });

  it.each([
    ["a missing title", { title: undefined }],
    ["a title over the limit", { title: "x".repeat(201) }],
    ["a missing fingerprint", { fingerprint: undefined }],
    ["a malformed fingerprint", { fingerprint: "NOT-HEX" }],
    ["a malformed block id", { blocks: [{ id: "block-1", type: "paragraph", markdown: "x" }], totalBlocks: 1 }],
    ["a selection with a malformed block id", { selection: { blockIds: ["1"], text: "x" } }],
    ["a selection text over the cap", { selection: { blockIds: ["b0"], text: "x".repeat(CHAT_SELECTION_MAX_CHARS + 1) } }],
    ["the legacy plain-text content only", { blocks: undefined, totalBlocks: undefined, content: "texto" }],
  ])("rejects %s", (_label, patch) => {
    expect(chatRequestSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("rejects more blocks than the block cap", () => {
    const blocks = Array.from({ length: CHAT_MAX_BLOCKS + 1 }, (_, index) => block(index, "a"));

    expect(chatRequestSchema.safeParse({ ...valid, blocks, totalBlocks: blocks.length }).success).toBe(false);
  });

  it("rejects blocks whose text is over the AI input limit, with a readable message", () => {
    const result = chatRequestSchema.safeParse({
      ...valid,
      blocks: [block(0, "x".repeat(AI_MAX_INPUT_CHARS)), block(1, "y")],
      totalBlocks: 2,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("El artículo es demasiado largo para consultarlo con IA.");
  });

  it("rejects an empty conversation", () => {
    expect(chatRequestSchema.safeParse({ ...valid, messages: [] }).success).toBe(false);
  });

  it("rejects a conversation whose last message is not from the user", () => {
    const result = chatRequestSchema.safeParse({
      ...valid,
      messages: [
        { role: "user", content: "hola" },
        { role: "assistant", content: "hola" },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown roles and blank messages", () => {
    expect(chatRequestSchema.safeParse({ ...valid, messages: [{ role: "system", content: "x" }] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ ...valid, messages: [{ role: "user", content: "   " }] }).success).toBe(false);
  });

  it("rejects too many messages", () => {
    const messages = Array.from({ length: CHAT_MAX_MESSAGES + 1 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: "a",
    }));

    expect(chatRequestSchema.safeParse({ ...valid, messages }).success).toBe(false);
  });

  it("rejects a single message over the per-message cap", () => {
    const messages = [{ role: "user", content: "x".repeat(CHAT_MAX_MESSAGE_CHARS + 1) }];

    expect(chatRequestSchema.safeParse({ ...valid, messages }).success).toBe(false);
  });

  it("rejects a conversation over the total character cap", () => {
    const messages = Array.from({ length: 5 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: "x".repeat(CHAT_MAX_TOTAL_CHARS / 4),
    }));

    expect(chatRequestSchema.safeParse({ ...valid, messages }).success).toBe(false);
  });

  it("keeps the largest valid payload under the body size cap, even with 3-byte characters", () => {
    const perMessage = CHAT_MAX_TOTAL_CHARS / CHAT_MAX_MESSAGES;
    const messages = Array.from({ length: CHAT_MAX_MESSAGES }, (_, index) => ({
      role: index % 2 === 0 ? "assistant" : "user",
      content: "あ".repeat(perMessage),
    }));
    const perBlock = AI_MAX_INPUT_CHARS / CHAT_MAX_BLOCKS;
    const blocks = Array.from({ length: CHAT_MAX_BLOCKS }, (_, index) => ({
      id: `b${99_000 + index}`,
      type: "x".repeat(CHAT_MAX_BLOCK_TYPE_CHARS),
      level: 3,
      markdown: "あ".repeat(perBlock),
    }));
    const payload = {
      title: "あ".repeat(POST_TITLE_MAX_LENGTH),
      blocks,
      totalBlocks: 99_999,
      selection: { blockIds: blocks.map(({ id }) => id), text: "あ".repeat(CHAT_SELECTION_MAX_CHARS) },
      fingerprint: "ffffffff",
      messages,
    };

    expect(chatRequestSchema.safeParse(payload).success).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBeLessThan(MAX_AI_BODY_BYTES);
  });
});

describe("blockIdSchema", () => {
  it.each(["b0", "b12", "b99999"])("accepts %s", (id) => {
    expect(blockIdSchema.safeParse(id).success).toBe(true);
  });

  it.each(["", "b", "B1", "b-1", "b1 ", "1", "b1.5", "b123456", "block1"])("rejects %j", (id) => {
    expect(blockIdSchema.safeParse(id).success).toBe(false);
  });
});

describe("editActionSchema", () => {
  it.each([
    ["insert_after_block", { blockId: "b3" }],
    ["insert_at_selection", {}],
    ["append", {}],
    ["replace_block", { blockId: "b0" }],
    ["replace_selection", {}],
    ["replace_range", { fromBlockId: "b1", toBlockId: "b4" }],
  ])("accepts %s", (op, fields) => {
    const result = editActionSchema.safeParse({ op, markdown: "## Nuevo", label: "Agregar sección", ...fields });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ op, markdown: "## Nuevo", ...fields });
  });

  it("does not require a label and turns a blank one into undefined", () => {
    expect(editActionSchema.parse({ op: "append", markdown: "x" }).label).toBeUndefined();
    expect(editActionSchema.parse({ op: "append", markdown: "x", label: "   " }).label).toBeUndefined();
  });

  it("trims the markdown", () => {
    expect(editActionSchema.parse({ op: "append", markdown: "\n hola \n" }).markdown).toBe("hola");
  });

  it.each([
    ["an unknown op", { op: "delete_everything", markdown: "x" }],
    ["a missing op", { markdown: "x" }],
    ["empty markdown", { op: "append", markdown: "  " }],
    ["markdown over the cap", { op: "append", markdown: "x".repeat(EDIT_MAX_MARKDOWN_CHARS + 1) }],
    ["a label over the cap", { op: "append", markdown: "x", label: "x".repeat(EDIT_LABEL_MAX_CHARS + 1) }],
    ["insert_after_block without blockId", { op: "insert_after_block", markdown: "x" }],
    ["replace_block with a malformed blockId", { op: "replace_block", blockId: "3", markdown: "x" }],
    ["replace_range without toBlockId", { op: "replace_range", fromBlockId: "b1", markdown: "x" }],
    ["a non-string markdown", { op: "append", markdown: 42 }],
  ])("rejects %s", (_label, value) => {
    expect(editActionSchema.safeParse(value).success).toBe(false);
  });
});

describe("chatStepSchema", () => {
  it("accepts a step with a known status", () => {
    expect(chatStepSchema.safeParse({ id: "read", label: "Leyendo el artículo", status: "done" }).success).toBe(true);
  });

  it.each([
    ["an unknown status", { id: "a", label: "x", status: "failed" }],
    ["a blank label", { id: "a", label: " ", status: "done" }],
    ["a missing id", { label: "x", status: "done" }],
    ["a label over the cap", { id: "a", label: "x".repeat(CHAT_STEP_LABEL_MAX_CHARS + 1), status: "done" }],
  ])("rejects %s", (_label, value) => {
    expect(chatStepSchema.safeParse(value).success).toBe(false);
  });
});

describe("chatPlanSchema", () => {
  it("accepts steps with and without ids", () => {
    const result = chatPlanSchema.safeParse({ steps: [{ id: "a", label: "Leer" }, { label: "Escribir" }] });

    expect(result.success).toBe(true);
  });

  it.each([
    ["no steps", { steps: [] }],
    ["too many steps", { steps: Array.from({ length: CHAT_MAX_STEPS + 1 }, (_, index) => ({ label: `paso ${index}` })) }],
    ["a blank label", { steps: [{ label: "" }] }],
    ["a non-array payload", { steps: "Leer" }],
  ])("rejects %s", (_label, value) => {
    expect(chatPlanSchema.safeParse(value).success).toBe(false);
  });
});
