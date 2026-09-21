import { remark } from "remark";
import remarkGfm from "remark-gfm";
import stripMarkdown from "strip-markdown";
import type { PostType } from "@/lib/supabase/database.types";

type TagRelation = { tag: { id: string; name: string } };

export function flattenTags<T extends object & { tags?: TagRelation[] | null }>(
  post: T,
) {
  const { tags, ...rest } = post;
  return { ...rest, tags: tags?.map(({ tag }) => tag) ?? [] };
}

const plainTextProcessor = remark().use(remarkGfm).use(stripMarkdown);
const EXCERPT_SOURCE_FACTOR = 10;

export function markdownToPlainText(markdown: string) {
  return String(plainTextProcessor.processSync(markdown)).replace(/\s+/g, " ").trim();
}

export function excerpt(content: string, max = 200) {
  const text = markdownToPlainText(content.slice(0, max * EXCERPT_SOURCE_FACTOR));
  if (text.length <= max) {
    return text;
  }

  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

export type ParentRef = {
  id: string;
  type: PostType;
  title: string | null;
  author: { display_name: string } | null;
};

export function replyTarget(parent: ParentRef | null): string | null {
  if (!parent) {
    return null;
  }

  const title = parent.type === "article" ? parent.title?.trim() : null;
  return title || parent.author?.display_name || null;
}
