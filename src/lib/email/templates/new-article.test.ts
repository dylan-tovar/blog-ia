import { describe, expect, it } from "vitest";
import { newArticleEmail } from "./new-article";

describe("newArticleEmail", () => {
  const props = {
    authorName: "Ana",
    title: "Mi artículo",
    bodyHtml: "<p>contenido</p>",
    postUrl: "https://example.com/post/1",
    unsubscribeUrl: "https://example.com/unsubscribe/token-123",
  };

  it("includes the author, title and rendered body", () => {
    const { subject, html } = newArticleEmail(props);
    expect(subject).toContain("Ana");
    expect(subject).toContain("Mi artículo");
    expect(html).toContain("<p>contenido</p>");
    expect(html).toContain(props.postUrl);
  });

  it("always includes the unsubscribe link", () => {
    const { html } = newArticleEmail(props);
    expect(html).toContain(props.unsubscribeUrl);
  });
});
