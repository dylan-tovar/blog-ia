import { findAndReplace } from "mdast-util-find-and-replace";
import type { PhrasingContent, Root } from "mdast";
import type { Plugin } from "unified";

// Mirrors the regex @tiptap/extension-highlight uses to serialize its mark to markdown
// (see markdownTokenizer in its source), so the public view renders the same `==text==`
// syntax the editor writes. `mark` isn't a real mdast node type, but `data.hName` tells
// mdast-util-to-hast to emit it as a literal <mark> element anyway.
const HIGHLIGHT_PATTERN = /==([^=]+)==/g;

export const remarkHighlight: Plugin<[], Root> = () => (tree) => {
  findAndReplace(tree, [
    [
      HIGHLIGHT_PATTERN,
      (_match: string, value: string): PhrasingContent =>
        ({
          type: "mark",
          data: { hName: "mark" },
          children: [{ type: "text", value }],
        }) as unknown as PhrasingContent,
    ],
  ]);
};
