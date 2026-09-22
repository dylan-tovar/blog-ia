import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

// Server-side Markdown -> HTML string for email bodies. `MarkdownContent.tsx`
// (react-markdown) is a React component and can't produce a plain HTML
// string, so this uses the underlying remark pipeline directly instead.
//
// `sanitize: true` is required here (unlike MarkdownContent.tsx, which
// relies on React's own escaping): this renderer emits a raw HTML string
// straight into an email, and post content is user-authored, so it's an
// XSS-relevant surface on its own.
export async function markdownToEmailHtml(markdown: string): Promise<string> {
  const file = await remark().use(remarkGfm).use(remarkHtml, { sanitize: true }).process(markdown);

  return String(file);
}
