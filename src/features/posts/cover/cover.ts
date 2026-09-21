import {
  DEFAULT_COVER_COLOR,
  isCoverColor,
  type CoverColor,
} from "@/features/posts/cover/cover-palette";
import { POST_IMAGES_BUCKET } from "@/features/posts/images/image-limits";
import { isAllowedImageUrl, parseImageSize } from "@/features/posts/images/image-utils";

export interface CoverFields {
  imageUrl: string | null;
  text: string | null;
  color: string | null;
}

export type ResolvedCover =
  | { kind: "image"; url: string; width: number | null; height: number | null }
  | { kind: "text"; text: string; color: CoverColor }
  | { kind: "none" };

// Image wins over the text tile; no usable cover keeps the plain card.
export function resolveCover(cover: CoverFields, supabaseUrl: string): ResolvedCover {
  if (cover.imageUrl && isAllowedImageUrl(cover.imageUrl, supabaseUrl)) {
    const size = parseImageSize(cover.imageUrl);
    return {
      kind: "image",
      url: cover.imageUrl,
      width: size?.width ?? null,
      height: size?.height ?? null,
    };
  }

  const text = cover.text?.trim();
  if (text) {
    return {
      kind: "text",
      text,
      color: isCoverColor(cover.color) ? cover.color : DEFAULT_COVER_COLOR,
    };
  }

  return { kind: "none" };
}

// A public bucket URL bypasses RLS, so ownership is checked on the path: the first folder
// is the uploader's user id.
export function isOwnCoverImage(url: string, supabaseUrl: string, userId: string): boolean {
  if (!isAllowedImageUrl(url, supabaseUrl)) {
    return false;
  }
  return new URL(url).pathname.startsWith(
    `/storage/v1/object/public/${POST_IMAGES_BUCKET}/${userId}/`,
  );
}

const CODE_SPANS = /(```|~~~)[\s\S]*?(?:\1|$)|`[^`\n]*`/g;
const MARKDOWN_IMAGE =
  /!\[[^\]]*\]\(\s*(?:<([^>\n]+)>|([^)\s]+))(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;

export function extractImageUrls(markdown: string, supabaseUrl: string): string[] {
  const urls = new Set<string>();
  for (const match of markdown.replace(CODE_SPANS, "").matchAll(MARKDOWN_IMAGE)) {
    const url = match[1] ?? match[2];
    if (url && isAllowedImageUrl(url, supabaseUrl)) {
      urls.add(url);
    }
  }
  return [...urls];
}
