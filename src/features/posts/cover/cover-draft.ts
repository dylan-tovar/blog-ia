import { DEFAULT_COVER_COLOR, isCoverColor, type CoverColor } from "@/features/posts/cover/cover-palette";
import type { CoverValue } from "@/features/posts/cover/cover-schema";

export type CoverMode = "none" | "image" | "text";

// What the author is editing. The unused mode's fields are kept so switching tabs back and
// forth does not lose what was typed or picked; only the active mode reaches the database.
export interface CoverDraft {
  mode: CoverMode;
  imageUrl: string | null;
  text: string;
  color: CoverColor;
}

export function toCoverDraft(value: CoverValue): CoverDraft {
  const mode: CoverMode = value.imageUrl ? "image" : value.text ? "text" : "none";
  return {
    mode,
    imageUrl: value.imageUrl,
    text: value.text ?? "",
    color: isCoverColor(value.color) ? value.color : DEFAULT_COVER_COLOR,
  };
}

const EMPTY_COVER: CoverValue = { imageUrl: null, text: null, color: null };

export function draftToCoverValue(draft: CoverDraft): CoverValue {
  if (draft.mode === "image" && draft.imageUrl) {
    return { imageUrl: draft.imageUrl, text: null, color: null };
  }
  const text = draft.text.trim();
  if (draft.mode === "text" && text) {
    return { imageUrl: null, text, color: draft.color };
  }
  return EMPTY_COVER;
}

export function coverValuesEqual(a: CoverValue, b: CoverValue): boolean {
  return a.imageUrl === b.imageUrl && a.text === b.text && a.color === b.color;
}
