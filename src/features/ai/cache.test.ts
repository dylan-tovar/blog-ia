import { describe, expect, it } from "vitest";
import { isCacheUsable, parseCachedScore, parseCachedTitles } from "./cache";

describe("parseCachedTitles", () => {
  it("returns the titles of a valid cache", () => {
    expect(parseCachedTitles(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it.each([
    ["null", null],
    ["a string", "titulo"],
    ["an object", { titles: [] }],
    ["an empty list", []],
    ["non-string items", [1, 2, 3]],
  ])("returns null for %s", (_label, value) => {
    expect(parseCachedTitles(value)).toBeNull();
  });
});

describe("parseCachedScore", () => {
  const valid = {
    score: 64,
    suggestions: [{ type: "seo", text: "Agregá una descripción." }],
    keywords: ["ia"],
  };

  it("returns a valid cached score", () => {
    expect(parseCachedScore(valid)).toEqual(valid);
  });

  it.each([
    ["null", null],
    ["a number", 64],
    ["a score out of range", { ...valid, score: 400 }],
    ["missing suggestions", { score: 10, keywords: [] }],
  ])("returns null for %s", (_label, value) => {
    expect(parseCachedScore(value)).toBeNull();
  });
});

describe("isCacheUsable", () => {
  it("uses a present value", () => {
    expect(isCacheUsable(["a"], false)).toBe(true);
  });

  it("ignores a missing value", () => {
    expect(isCacheUsable(null, false)).toBe(false);
  });

  it("ignores the cache when regenerating", () => {
    expect(isCacheUsable(["a"], true)).toBe(false);
  });
});
