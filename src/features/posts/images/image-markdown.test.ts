// @vitest-environment jsdom
import { Editor } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

const IMAGE_URL = "https://abcd.supabase.co/storage/v1/object/public/post-images/u1/x-1600x900.webp";

function createEditor(content: string) {
  return new Editor({
    extensions: [StarterKit, Markdown, Image.configure({ allowBase64: false })],
    content,
    contentType: "markdown",
  });
}

describe("image markdown round-trip", () => {
  it("keeps ![alt](url) through parse and serialize", () => {
    const editor = createEditor(`Intro\n\n![atardecer](${IMAGE_URL})\n\nOutro`);
    expect(editor.getMarkdown()).toContain(`![atardecer](${IMAGE_URL})`);
    editor.destroy();
  });

  it("serializes an image inserted with insertContentAt as markdown", () => {
    const editor = createEditor("Hola");
    editor
      .chain()
      .insertContentAt(editor.state.doc.content.size, {
        type: "image",
        attrs: { src: IMAGE_URL, alt: "" },
      })
      .run();
    expect(editor.getMarkdown()).toContain(`![](${IMAGE_URL})`);
    editor.destroy();
  });
});
