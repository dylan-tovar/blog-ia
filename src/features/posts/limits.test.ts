import { describe, expect, it } from "vitest";
import {
  POST_CONTENT_MAX_LENGTH,
  POST_TITLE_MAX_LENGTH,
} from "@/features/posts/constants";
import { contentCounter, findLimitIssue, fitsContentLimit } from "@/features/posts/limits";

describe("findLimitIssue", () => {
  it("returns null within limits, including the exact limits", () => {
    expect(findLimitIssue({ title: "Hola", content: "texto" })).toBeNull();
    expect(
      findLimitIssue({
        title: "a".repeat(POST_TITLE_MAX_LENGTH),
        content: "a".repeat(POST_CONTENT_MAX_LENGTH),
      }),
    ).toBeNull();
  });

  it("flags an overlong title", () => {
    expect(
      findLimitIssue({ title: "a".repeat(POST_TITLE_MAX_LENGTH + 1), content: "x" }),
    ).toBe("title");
  });

  it("flags overlong content", () => {
    expect(
      findLimitIssue({ title: "ok", content: "a".repeat(POST_CONTENT_MAX_LENGTH + 1) }),
    ).toBe("content");
  });

  it("reports the title first when both exceed the limits", () => {
    expect(
      findLimitIssue({
        title: "a".repeat(POST_TITLE_MAX_LENGTH + 1),
        content: "a".repeat(POST_CONTENT_MAX_LENGTH + 1),
      }),
    ).toBe("title");
  });

  it("measures the trimmed title, matching savePostSchema", () => {
    expect(
      findLimitIssue({ title: `  ${"a".repeat(POST_TITLE_MAX_LENGTH)}  `, content: "x" }),
    ).toBeNull();
  });
});

describe("contentCounter", () => {
  it("stays hidden below 90% of the limit", () => {
    expect(contentCounter(0).show).toBe(false);
    expect(contentCounter(POST_CONTENT_MAX_LENGTH * 0.9 - 1).show).toBe(false);
  });

  it("shows from 90% of the limit with the remaining characters", () => {
    expect(contentCounter(POST_CONTENT_MAX_LENGTH * 0.9)).toEqual({
      show: true,
      remaining: POST_CONTENT_MAX_LENGTH * 0.1,
    });
  });

  it("goes negative past the limit so the UI can flag it", () => {
    expect(contentCounter(POST_CONTENT_MAX_LENGTH + 5)).toEqual({ show: true, remaining: -5 });
  });
});

describe("fitsContentLimit", () => {
  it("accepts a result that lands exactly on the limit", () => {
    expect(fitsContentLimit(POST_CONTENT_MAX_LENGTH)).toBe(true);
  });

  it("rejects a result over the limit", () => {
    expect(fitsContentLimit(POST_CONTENT_MAX_LENGTH + 1)).toBe(false);
  });
});
