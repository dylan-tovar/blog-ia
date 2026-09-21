import { POST_CONTENT_MAX_LENGTH } from "@/features/posts/constants";
import { markdownToPlainText } from "@/features/posts/utils";
import { AiError } from "./errors";

export const SUMMARY_MAX_LENGTH = 1_200;

// Matches one fence that wraps the entire answer (``` / ```markdown / ```md ... ```).
const WRAPPING_FENCE = /^```(?:markdown|md)?[ \t]*\n([\s\S]*?)\n```$/;

export function cleanToneOutput(text: string, maxLength = POST_CONTENT_MAX_LENGTH) {
  const trimmed = text.trim();
  const unwrapped = WRAPPING_FENCE.exec(trimmed)?.[1].trim() ?? trimmed;

  if (!unwrapped || unwrapped.length > maxLength) {
    throw new AiError("invalid_response");
  }

  return unwrapped;
}

// The summary is rendered as plain text, so any markdown the model adds is stripped.
export function cleanSummary(text: string, maxLength = SUMMARY_MAX_LENGTH) {
  const plain = markdownToPlainText(text).replace(/\s+/g, " ").trim();

  if (!plain) {
    throw new AiError("invalid_response");
  }

  return plain.slice(0, maxLength);
}
