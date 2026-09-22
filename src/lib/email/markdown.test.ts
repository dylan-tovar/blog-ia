import { describe, expect, it } from "vitest";
import { markdownToEmailHtml } from "./markdown";

describe("markdownToEmailHtml", () => {
  it("renders basic Markdown", async () => {
    const html = await markdownToEmailHtml("# Título\n\nUn **párrafo** con texto.");
    expect(html).toContain("<h1>Título</h1>");
    expect(html).toContain("<strong>párrafo</strong>");
  });

  it("renders GFM features (tables, strikethrough, task lists)", async () => {
    const html = await markdownToEmailHtml("~~tachado~~\n\n| a | b |\n| - | - |\n| 1 | 2 |");
    expect(html).toContain("<del>tachado</del>");
    expect(html).toContain("<table>");
  });

  it("renders code blocks", async () => {
    const html = await markdownToEmailHtml("```js\nconst x = 1;\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("const x = 1;");
  });

  it("strips a script tag embedded as raw HTML", async () => {
    const html = await markdownToEmailHtml("texto\n\n<script>alert(1)</script>\n\nmás texto");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("alert(1)");
  });

  it("strips an inline event handler smuggled via raw HTML", async () => {
    const html = await markdownToEmailHtml('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
  });

  it("does not preserve a javascript: link as a clickable href", async () => {
    const html = await markdownToEmailHtml("[click](javascript:alert(1))");
    expect(html).not.toContain('href="javascript:alert(1)"');
  });
});
