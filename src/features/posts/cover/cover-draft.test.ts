import { describe, expect, it } from "vitest";
import {
  coverValuesEqual,
  draftToCoverValue,
  toCoverDraft,
  type CoverDraft,
} from "@/features/posts/cover/cover-draft";

const image = "https://proj.supabase.co/storage/v1/object/public/post-images/u/a-10x10.webp";

describe("toCoverDraft", () => {
  it("starts in none mode without a cover", () => {
    expect(toCoverDraft({ imageUrl: null, text: null, color: null })).toEqual({
      mode: "none",
      imageUrl: null,
      text: "",
      color: "slate",
    });
  });

  it("starts in image mode when there is an image, even with text", () => {
    expect(toCoverDraft({ imageUrl: image, text: "Hola", color: "wine" }).mode).toBe("image");
  });

  it("starts in text mode when there is only text and keeps its color", () => {
    expect(toCoverDraft({ imageUrl: null, text: "Hola", color: "wine" })).toEqual({
      mode: "text",
      imageUrl: null,
      text: "Hola",
      color: "wine",
    });
  });
});

describe("draftToCoverValue", () => {
  const base: CoverDraft = { mode: "none", imageUrl: image, text: "Hola", color: "navy" };

  it("clears everything in none mode, even if drafts are kept for switching back", () => {
    expect(draftToCoverValue(base)).toEqual({ imageUrl: null, text: null, color: null });
  });

  it("keeps only the image in image mode", () => {
    expect(draftToCoverValue({ ...base, mode: "image" })).toEqual({
      imageUrl: image,
      text: null,
      color: null,
    });
  });

  it("keeps only trimmed text and color in text mode", () => {
    expect(draftToCoverValue({ ...base, mode: "text", text: "  Hola  " })).toEqual({
      imageUrl: null,
      text: "Hola",
      color: "navy",
    });
  });

  it("treats an image mode without an image, or a blank text, as no cover", () => {
    expect(draftToCoverValue({ ...base, mode: "image", imageUrl: null })).toEqual({
      imageUrl: null,
      text: null,
      color: null,
    });
    expect(draftToCoverValue({ ...base, mode: "text", text: "   " })).toEqual({
      imageUrl: null,
      text: null,
      color: null,
    });
  });
});

describe("coverValuesEqual", () => {
  it("compares every field", () => {
    const a = { imageUrl: null, text: "Hola", color: "wine" as const };
    expect(coverValuesEqual(a, { ...a })).toBe(true);
    expect(coverValuesEqual(a, { ...a, color: "navy" })).toBe(false);
    expect(coverValuesEqual(a, { ...a, text: "Chau" })).toBe(false);
    expect(coverValuesEqual(a, { ...a, imageUrl: image })).toBe(false);
  });
});
