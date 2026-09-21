import { describe, expect, it } from "vitest";
import {
  COVER_COLORS,
  DEFAULT_COVER_COLOR,
  isCoverColor,
} from "@/features/posts/cover/cover-palette";
import {
  extractImageUrls,
  filterOwnCoverImages,
  isOwnCoverImage,
  resolveCover,
} from "@/features/posts/cover/cover";

const SUPABASE = "https://proj.supabase.co";
const USER = "8b0f8f0e-7a4e-4b8e-9c55-1f2d3c4b5a69";
const OTHER = "11111111-2222-4333-8444-555555555555";
const publicUrl = (folder: string, file = "abc-800x600.webp") =>
  `${SUPABASE}/storage/v1/object/public/post-images/${folder}/${file}`;

describe("cover palette", () => {
  it("exposes the fixed palette used by the database check", () => {
    expect([...COVER_COLORS]).toEqual([
      "slate",
      "olive",
      "wine",
      "forest",
      "navy",
      "plum",
      "rust",
      "teal",
    ]);
  });

  it("recognizes palette keys only", () => {
    expect(isCoverColor("wine")).toBe(true);
    expect(isCoverColor("#ff0000")).toBe(false);
    expect(isCoverColor("")).toBe(false);
    expect(isCoverColor(null)).toBe(false);
    expect(isCoverColor(undefined)).toBe(false);
  });

  it("has a default that belongs to the palette", () => {
    expect(isCoverColor(DEFAULT_COVER_COLOR)).toBe(true);
  });
});

describe("resolveCover", () => {
  it("prefers the image over the text tile", () => {
    const image = publicUrl(USER);
    expect(
      resolveCover({ imageUrl: image, text: "Hola", color: "wine" }, SUPABASE),
    ).toEqual({ kind: "image", url: image, width: 800, height: 600 });
  });

  it("keeps the image without dimensions when the name has none", () => {
    const image = publicUrl(USER, "plain.webp");
    expect(resolveCover({ imageUrl: image, text: null, color: null }, SUPABASE)).toEqual({
      kind: "image",
      url: image,
      width: null,
      height: null,
    });
  });

  it("ignores an image from a foreign host and falls back to the text", () => {
    expect(
      resolveCover(
        { imageUrl: "https://evil.example/a-10x10.webp", text: "Hola", color: "navy" },
        SUPABASE,
      ),
    ).toEqual({ kind: "text", text: "Hola", color: "navy" });
  });

  it("builds a text tile with the chosen color", () => {
    expect(resolveCover({ imageUrl: null, text: "  Una frase  ", color: "plum" }, SUPABASE)).toEqual(
      { kind: "text", text: "Una frase", color: "plum" },
    );
  });

  it("uses the default color when the color is missing or unknown", () => {
    expect(resolveCover({ imageUrl: null, text: "Hola", color: null }, SUPABASE)).toEqual({
      kind: "text",
      text: "Hola",
      color: DEFAULT_COVER_COLOR,
    });
    expect(resolveCover({ imageUrl: null, text: "Hola", color: "pink" }, SUPABASE)).toEqual({
      kind: "text",
      text: "Hola",
      color: DEFAULT_COVER_COLOR,
    });
  });

  it("returns none when there is nothing usable", () => {
    expect(resolveCover({ imageUrl: null, text: null, color: "wine" }, SUPABASE)).toEqual({
      kind: "none",
    });
    expect(resolveCover({ imageUrl: null, text: "   ", color: "wine" }, SUPABASE)).toEqual({
      kind: "none",
    });
  });
});

describe("extractImageUrls", () => {
  const a = publicUrl(USER, "a-100x100.webp");
  const b = publicUrl(USER, "b-200x100.webp");

  it("returns allowed image urls in document order without duplicates", () => {
    const markdown = `Intro\n\n![one](${a})\n\ntext ![two](${b}) and again ![one](${a})`;
    expect(extractImageUrls(markdown, SUPABASE)).toEqual([a, b]);
  });

  it("ignores images from other hosts", () => {
    const markdown = `![x](https://evil.example/pixel.png)\n![ok](${a})`;
    expect(extractImageUrls(markdown, SUPABASE)).toEqual([a]);
  });

  it("supports an optional title and angle brackets", () => {
    const markdown = `![one](${a} "Title")\n![two](<${b}>)`;
    expect(extractImageUrls(markdown, SUPABASE)).toEqual([a, b]);
  });

  it("ignores images inside fenced and inline code", () => {
    const markdown = ["```md", `![in fence](${a})`, "```", "", `inline \`![in code](${b})\``].join(
      "\n",
    );
    expect(extractImageUrls(markdown, SUPABASE)).toEqual([]);
  });

  it("ignores plain links and empty input", () => {
    expect(extractImageUrls(`[link](${a})`, SUPABASE)).toEqual([]);
    expect(extractImageUrls("", SUPABASE)).toEqual([]);
  });
});

describe("isOwnCoverImage", () => {
  it("accepts an image in the author's own folder", () => {
    expect(isOwnCoverImage(publicUrl(USER), SUPABASE, USER)).toBe(true);
  });

  it("rejects another user's folder", () => {
    expect(isOwnCoverImage(publicUrl(OTHER), SUPABASE, USER)).toBe(false);
  });

  it("rejects foreign hosts and traversal out of the folder", () => {
    expect(isOwnCoverImage(`https://evil.example/storage/v1/object/public/post-images/${USER}/a.webp`, SUPABASE, USER)).toBe(false);
    expect(isOwnCoverImage(publicUrl(`${USER}/../${OTHER}`), SUPABASE, USER)).toBe(false);
  });

  it("rejects a folder that only shares the user id as a prefix", () => {
    expect(isOwnCoverImage(publicUrl(`${USER}evil`), SUPABASE, USER)).toBe(false);
  });
});

describe("filterOwnCoverImages", () => {
  const mine = publicUrl(USER, "a-10x10.webp");
  const mine2 = publicUrl(USER, "b-10x10.webp");
  const theirs = publicUrl(OTHER, "c-10x10.webp");

  it("keeps only images from the author's own folder, in order", () => {
    expect(filterOwnCoverImages([mine, theirs, mine2], SUPABASE, USER)).toEqual([mine, mine2]);
  });

  it("returns an empty list when nothing is the author's", () => {
    expect(filterOwnCoverImages([theirs], SUPABASE, USER)).toEqual([]);
    expect(filterOwnCoverImages([], SUPABASE, USER)).toEqual([]);
  });
});
