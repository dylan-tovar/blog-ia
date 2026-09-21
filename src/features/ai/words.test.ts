import { describe, expect, it } from "vitest";
import { assertMinWords, countWords } from "./words";

describe("countWords", () => {
  it("returns 0 for empty or whitespace-only text", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\n  ")).toBe(0);
  });

  it("counts plain words", () => {
    expect(countWords("uno dos tres")).toBe(3);
  });

  it("ignores markdown syntax", () => {
    expect(countWords("# Titulo\n\nUn **texto** con [enlace](https://example.com)")).toBe(5);
  });

  it("collapses repeated whitespace and newlines", () => {
    expect(countWords("uno\n\n\ndos    tres")).toBe(3);
  });
});

describe("assertMinWords", () => {
  it("passes when the text reaches the minimum", () => {
    expect(() => assertMinWords("uno dos tres", 3)).not.toThrow();
  });

  it("throws input_too_short below the minimum", () => {
    expect(() => assertMinWords("uno dos", 3)).toThrowError(expect.objectContaining({ kind: "input_too_short" }));
  });

  it("counts words without markdown syntax", () => {
    expect(() => assertMinWords("# **uno** dos", 3)).toThrowError(
      expect.objectContaining({ kind: "input_too_short" }),
    );
  });
});
