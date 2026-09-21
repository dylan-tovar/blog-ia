import { describe, expect, it } from "vitest";
import { cleanSummary, cleanToneOutput } from "./output";

describe("cleanToneOutput", () => {
  it("returns the rewritten markdown trimmed", () => {
    expect(cleanToneOutput("  ## Título\n\nTexto.  \n")).toBe("## Título\n\nTexto.");
  });

  it.each(["markdown", "md", ""])("unwraps a single ```%s fence around the whole answer", (lang) => {
    expect(cleanToneOutput(`\`\`\`${lang}\n## Título\n\nTexto.\n\`\`\``)).toBe("## Título\n\nTexto.");
  });

  it("keeps fenced code blocks that are part of the article", () => {
    const article = "Antes\n\n```ts\nconst a = 1;\n```\n\nDespués";

    expect(cleanToneOutput(article)).toBe(article);
  });

  it("rejects an empty answer as invalid_response", () => {
    expect(() => cleanToneOutput("   \n")).toThrowError(expect.objectContaining({ kind: "invalid_response" }));
  });

  it("rejects an answer longer than the limit instead of truncating a rewritten article", () => {
    expect(() => cleanToneOutput("a".repeat(11), 10)).toThrowError(
      expect.objectContaining({ kind: "invalid_response" }),
    );
  });
});

describe("cleanSummary", () => {
  it("returns plain text trimmed with collapsed whitespace", () => {
    expect(cleanSummary("  Primera oración.\n\nSegunda   oración.  ")).toBe("Primera oración. Segunda oración.");
  });

  it("strips markdown syntax the model may add anyway", () => {
    expect(cleanSummary("**Resumen:** el autor explica `RLS` en [Supabase](https://x.dev).")).toBe(
      "Resumen: el autor explica RLS en Supabase.",
    );
  });

  it("rejects an empty answer as invalid_response", () => {
    expect(() => cleanSummary("  ")).toThrowError(expect.objectContaining({ kind: "invalid_response" }));
  });

  it("caps the length", () => {
    expect(cleanSummary("a".repeat(50), 20).length).toBeLessThanOrEqual(20);
  });
});
