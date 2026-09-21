import { describe, expect, it } from "vitest";
import {
  excerpt,
  flattenTags,
  markdownToPlainText,
  replyTarget,
} from "@/features/posts/utils";

describe("excerpt", () => {
  it("returns short text untouched", () => {
    expect(excerpt("Hola mundo")).toBe("Hola mundo");
  });

  it("collapses whitespace and trims", () => {
    expect(excerpt("  Hola \n\n  mundo\t ")).toBe("Hola mundo");
  });

  it("returns an empty string for blank content", () => {
    expect(excerpt("   \n ")).toBe("");
  });

  it("cuts long text on a word boundary and adds an ellipsis", () => {
    const result = excerpt("uno dos tres cuatro cinco", 12);
    expect(result).toBe("uno dos…");
    expect(result.length).toBeLessThanOrEqual(13);
  });

  it("hard-cuts a single long word", () => {
    expect(excerpt("a".repeat(30), 10)).toBe(`${"a".repeat(10)}…`);
  });

  it("does not add an ellipsis when the text fits exactly", () => {
    expect(excerpt("12345", 5)).toBe("12345");
  });
});

describe("markdownToPlainText", () => {
  it("returns plain text untouched", () => {
    expect(markdownToPlainText("Hola mundo")).toBe("Hola mundo");
  });

  it("strips headings, emphasis and inline code markers", () => {
    expect(markdownToPlainText("## Título\n\nUn **negrita**, *cursiva*, ~~tachado~~ y `código`.")).toBe(
      "Título Un negrita, cursiva, tachado y código.",
    );
  });

  it("keeps the link text and drops the url", () => {
    expect(markdownToPlainText("Mirá [la doc](https://example.com/x) ahora")).toBe(
      "Mirá la doc ahora",
    );
  });

  it("strips list, quote and rule markers", () => {
    const md = "- uno\n- dos\n\n1. tres\n\n> cita\n\n---\n\nfin";
    expect(markdownToPlainText(md)).toBe("uno dos tres cita fin");
  });

  it("omits fenced code blocks so excerpts read as prose", () => {
    expect(markdownToPlainText("Antes\n\n```ts\nconst a = 1;\n```\n\nDespués")).toBe(
      "Antes Después",
    );
  });

  it("keeps image alt text and drops raw html tags", () => {
    expect(markdownToPlainText("Hola ![alt](https://x.dev/i.png) <b>mundo</b>")).toBe(
      "Hola alt mundo",
    );
  });

  it("returns an empty string for blank content", () => {
    expect(markdownToPlainText("  \n\n ")).toBe("");
  });
});

describe("excerpt with markdown", () => {
  it("never leaks markdown syntax into the excerpt", () => {
    expect(excerpt("# Título\n\nTexto con **negrita** y [link](https://a.b).")).toBe(
      "Título Texto con negrita y link.",
    );
  });

  it("still truncates on a word boundary after stripping", () => {
    expect(excerpt("**uno** dos tres cuatro cinco", 12)).toBe("uno dos…");
  });
});

describe("flattenTags", () => {
  it("unwraps the post_tags join into a flat tag list", () => {
    const result = flattenTags({
      id: "p1",
      tags: [{ tag: { id: "t1", name: "ts" } }, { tag: { id: "t2", name: "next" } }],
    });
    expect(result.tags).toEqual([
      { id: "t1", name: "ts" },
      { id: "t2", name: "next" },
    ]);
    expect(result.id).toBe("p1");
  });

  it("returns an empty list when tags are missing or null", () => {
    const withoutTags = { id: "p1" };
    const withNullTags = { id: "p1", tags: null };
    expect(flattenTags(withoutTags).tags).toEqual([]);
    expect(flattenTags(withNullTags).tags).toEqual([]);
  });
});

describe("replyTarget", () => {
  const author = { display_name: "Lucía" };

  it("returns null when there is no parent (none set, deleted or hidden)", () => {
    expect(replyTarget(null)).toBeNull();
  });

  it("uses the article title when there is one", () => {
    expect(
      replyTarget({ id: "p", type: "article", title: "  RLS en la práctica ", author }),
    ).toBe("RLS en la práctica");
  });

  it("falls back to the author for an untitled article", () => {
    expect(replyTarget({ id: "p", type: "article", title: "  ", author })).toBe("Lucía");
    expect(replyTarget({ id: "p", type: "article", title: null, author })).toBe("Lucía");
  });

  it("uses the author for a note parent even if a legacy title exists", () => {
    expect(replyTarget({ id: "p", type: "note", title: "legacy", author })).toBe("Lucía");
  });

  it("returns null when neither title nor author is available", () => {
    expect(replyTarget({ id: "p", type: "note", title: null, author: null })).toBeNull();
  });
});
