import Link from "@tiptap/extension-link";
import { isSafeLinkHref } from "@/features/posts/link-safety";

// The stock Link mark does not run isAllowedUri when it parses markdown, so an
// unsafe [text](javascript:…) would be stored as-is; here it degrades to plain text.
export const SafeLink = Link.extend({
  parseMarkdown: (token, helpers) => {
    const children = helpers.parseInline(token.tokens || []);
    if (!isSafeLinkHref(token.href)) {
      return children;
    }
    return helpers.applyMark("link", children, {
      href: token.href,
      title: token.title || null,
    });
  },
}).configure({
  openOnClick: false,
  autolink: true,
  isAllowedUri: (url) => isSafeLinkHref(url),
  HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
});
