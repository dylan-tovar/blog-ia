import { describe, expect, it } from "vitest";
import {
  NOTE_MAX_LENGTH,
  POST_CONTENT_MAX_LENGTH,
  POST_TITLE_MAX_LENGTH,
} from "@/features/posts/constants";
import {
  createNoteSchema,
  feedQuerySchema,
  idSchema,
  postTypeSchema,
  savePostSchema,
  tagNameSchema,
} from "@/features/posts/schemas";

describe("feedQuerySchema", () => {
  it("defaults offset to 0 and leaves the tag undefined", () => {
    expect(feedQuerySchema.parse({})).toEqual({ offset: 0 });
  });

  it("normalizes the tag", () => {
    expect(feedQuerySchema.parse({ tag: "  Next.JS " }).tag).toBe("next.js");
  });

  it("rejects an empty or overlong tag", () => {
    expect(feedQuerySchema.safeParse({ tag: "  " }).success).toBe(false);
    expect(feedQuerySchema.safeParse({ tag: "a".repeat(51) }).success).toBe(false);
  });

  it.each([-1, 1.5, 10_001, Number.NaN])("rejects offset %s", (offset) => {
    expect(feedQuerySchema.safeParse({ offset }).success).toBe(false);
  });

  it("rejects a non-numeric offset", () => {
    expect(feedQuerySchema.safeParse({ offset: "20" }).success).toBe(false);
  });

  it("drops unknown fields", () => {
    const result = feedQuerySchema.parse({ offset: 0, status: "draft" });
    expect(result).not.toHaveProperty("status");
  });
});

describe("idSchema", () => {
  it("accepts a UUID", () => {
    expect(idSchema.safeParse("3f2b8c1e-6a4d-4f1b-9c7e-2d5a8b0e1f34").success).toBe(
      true,
    );
  });

  it.each(["", "abc", "1", "../../etc/passwd", "' or 1=1 --"])(
    "rejects %j",
    (value) => {
      expect(idSchema.safeParse(value).success).toBe(false);
    },
  );

  it("rejects non-strings", () => {
    expect(idSchema.safeParse(undefined).success).toBe(false);
    expect(idSchema.safeParse(42).success).toBe(false);
  });
});

describe("tagNameSchema", () => {
  it("trims and lowercases", () => {
    expect(tagNameSchema.parse("  TypeScript ")).toBe("typescript");
  });

  it("rejects an empty tag", () => {
    const result = tagNameSchema.safeParse("   ");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("El tag no puede estar vacío.");
  });

  it("rejects tags longer than 50 characters", () => {
    expect(tagNameSchema.safeParse("a".repeat(51)).success).toBe(false);
    expect(tagNameSchema.safeParse("a".repeat(50)).success).toBe(true);
  });
});

describe("savePostSchema", () => {
  it("accepts title and content", () => {
    expect(savePostSchema.safeParse({ title: "Hola", content: "Mundo" }).success).toBe(
      true,
    );
  });

  it("accepts an empty content string (drafts start empty)", () => {
    expect(savePostSchema.safeParse({ content: "" }).success).toBe(true);
  });

  it("rejects titles over 200 characters", () => {
    expect(
      savePostSchema.safeParse({ title: "a".repeat(201), content: "" }).success,
    ).toBe(false);
  });

  it("rejects non-string content", () => {
    expect(savePostSchema.safeParse({ content: 123 }).success).toBe(false);
  });

  it("exposes the title and content limits", () => {
    expect(POST_TITLE_MAX_LENGTH).toBe(200);
    expect(POST_CONTENT_MAX_LENGTH).toBe(100_000);
  });

  it("accepts a title and content exactly at the limits", () => {
    expect(
      savePostSchema.safeParse({
        title: "a".repeat(POST_TITLE_MAX_LENGTH),
        content: "b".repeat(POST_CONTENT_MAX_LENGTH),
      }).success,
    ).toBe(true);
  });

  it("rejects content over the limit", () => {
    expect(
      savePostSchema.safeParse({ content: "b".repeat(POST_CONTENT_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
  });

  it("drops fields that must not be client-controlled", () => {
    const result = savePostSchema.parse({
      content: "x",
      status: "published",
      author_id: "someone-else",
    });
    expect(Object.keys(result)).toEqual(["content"]);
  });
});

describe("postTypeSchema", () => {
  it.each(["note", "article"])("accepts %s", (value) => {
    expect(postTypeSchema.safeParse(value).success).toBe(true);
  });

  it.each(["", "post", "NOTE", null, 1])("rejects %j", (value) => {
    expect(postTypeSchema.safeParse(value).success).toBe(false);
  });
});

describe("createNoteSchema", () => {
  const parentId = "3f2b8c1e-6a4d-4f1b-9c7e-2d5a8b0e1f34";

  it("exposes the 500 character limit", () => {
    expect(NOTE_MAX_LENGTH).toBe(500);
  });

  it("accepts a standalone note and trims it", () => {
    expect(createNoteSchema.parse({ content: "  Hola  " })).toEqual({
      content: "Hola",
    });
  });

  it("accepts a note attached to a post", () => {
    const result = createNoteSchema.parse({ content: "Hola", parentPostId: parentId });
    expect(result.parentPostId).toBe(parentId);
  });

  it.each(["", "   ", "\n\t "])("rejects blank content %j", (content) => {
    const result = createNoteSchema.safeParse({ content });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("La nota no puede estar vacía.");
  });

  it("rejects missing or non-string content with the same message", () => {
    for (const input of [{}, { content: null }, { content: 42 }]) {
      const result = createNoteSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe("La nota no puede estar vacía.");
    }
  });

  it("accepts exactly 500 characters and rejects 501", () => {
    expect(createNoteSchema.safeParse({ content: "a".repeat(500) }).success).toBe(true);
    const result = createNoteSchema.safeParse({ content: "a".repeat(501) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "La nota no puede superar los 500 caracteres.",
    );
  });

  it("counts the trimmed length, not the raw one", () => {
    expect(
      createNoteSchema.safeParse({ content: `  ${"a".repeat(500)}  ` }).success,
    ).toBe(true);
  });

  it("rejects an invalid parent id", () => {
    expect(
      createNoteSchema.safeParse({ content: "Hola", parentPostId: "nope" }).success,
    ).toBe(false);
  });

  it("drops fields that must not be client-controlled", () => {
    const result = createNoteSchema.parse({
      content: "Hola",
      status: "draft",
      title: "Injected",
      type: "article",
      author_id: "someone-else",
    });
    expect(Object.keys(result)).toEqual(["content"]);
  });
});
