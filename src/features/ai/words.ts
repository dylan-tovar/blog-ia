import { markdownToPlainText } from "@/features/posts/utils";
import { AiError } from "./errors";

export function countWords(markdown: string) {
  return markdownToPlainText(markdown).split(/\s+/).filter(Boolean).length;
}

export function assertMinWords(markdown: string, min: number) {
  if (countWords(markdown) < min) {
    throw new AiError("input_too_short");
  }
}
