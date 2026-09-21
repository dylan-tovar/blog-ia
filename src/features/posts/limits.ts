import { POST_CONTENT_MAX_LENGTH, POST_TITLE_MAX_LENGTH } from "@/features/posts/constants";

export type LimitIssue = "title" | "content";

const COUNTER_THRESHOLD = 0.9;

export function findLimitIssue(draft: { title: string; content: string }): LimitIssue | null {
  if (draft.title.trim().length > POST_TITLE_MAX_LENGTH) {
    return "title";
  }
  if (draft.content.length > POST_CONTENT_MAX_LENGTH) {
    return "content";
  }
  return null;
}

export function contentCounter(length: number): { show: boolean; remaining: number } {
  return {
    show: length >= POST_CONTENT_MAX_LENGTH * COUNTER_THRESHOLD,
    remaining: POST_CONTENT_MAX_LENGTH - length,
  };
}

export function fitsContentLimit(resultingLength: number) {
  return resultingLength <= POST_CONTENT_MAX_LENGTH;
}
