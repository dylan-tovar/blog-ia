import { describe, expect, it } from "vitest";
import { COVER_TEXT_MAX_LENGTH, createCoverSchema } from "@/features/posts/cover/cover-schema";

const SUPABASE = "https://proj.supabase.co";
const USER = "8b0f8f0e-7a4e-4b8e-9c55-1f2d3c4b5a69";
const OTHER = "11111111-2222-4333-8444-555555555555";
const own = `${SUPABASE}/storage/v1/object/public/post-images/${USER}/abc-800x600.webp`;
const foreign = `${SUPABASE}/storage/v1/object/public/post-images/${OTHER}/abc-800x600.webp`;

const schema = createCoverSchema({ supabaseUrl: SUPABASE, userId: USER });

describe("createCoverSchema", () => {
  it("accepts an empty cover and normalizes it to nulls", () => {
    expect(schema.parse({})).toEqual({ imageUrl: null, text: null, color: null });
    expect(schema.parse({ imageUrl: null, text: "   ", color: null })).toEqual({
      imageUrl: null,
      text: null,
      color: null,
    });
  });

  it("accepts an image from the author's own folder", () => {
    expect(schema.parse({ imageUrl: own })).toEqual({ imageUrl: own, text: null, color: null });
  });

  it("rejects another user's image, a foreign host and non-urls", () => {
    expect(schema.safeParse({ imageUrl: foreign }).success).toBe(false);
    expect(schema.safeParse({ imageUrl: "https://evil.example/a.webp" }).success).toBe(false);
    expect(schema.safeParse({ imageUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(schema.safeParse({ imageUrl: "not a url" }).success).toBe(false);
  });

  it("trims the text and keeps the chosen color", () => {
    expect(schema.parse({ text: "  Una frase  ", color: "wine" })).toEqual({
      imageUrl: null,
      text: "Una frase",
      color: "wine",
    });
  });

  it("defaults the color when there is text but no color", () => {
    expect(schema.parse({ text: "Hola" }).color).toBe("slate");
  });

  it("drops the color when there is no text", () => {
    expect(schema.parse({ color: "wine" })).toEqual({ imageUrl: null, text: null, color: null });
  });

  it("keeps color and text alongside an image so the tile survives if the image is removed", () => {
    expect(schema.parse({ imageUrl: own, text: "Hola", color: "teal" })).toEqual({
      imageUrl: own,
      text: "Hola",
      color: "teal",
    });
  });

  it("rejects text over the limit and colors outside the palette", () => {
    expect(schema.safeParse({ text: "a".repeat(COVER_TEXT_MAX_LENGTH + 1), color: "wine" }).success).toBe(false);
    expect(schema.safeParse({ text: "Hola", color: "#ff0000" }).success).toBe(false);
  });

  it("allows text exactly at the limit", () => {
    expect(schema.safeParse({ text: "a".repeat(COVER_TEXT_MAX_LENGTH), color: "wine" }).success).toBe(true);
  });
});
