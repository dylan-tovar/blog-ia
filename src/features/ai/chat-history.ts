import { CHAT_HISTORY_MAX_CHARS, CHAT_HISTORY_MAX_TURNS, CHAT_MAX_MESSAGE_CHARS } from "./constants";
import type { ChatMessage } from "./types";

// Newest messages win. Runs on both sides: the client trims what it sends, the prompt builder
// trims again so the model context is bounded no matter who calls it.
export function trimChatHistory(messages: ChatMessage[]): ChatMessage[] {
  const kept: ChatMessage[] = [];
  let chars = 0;

  for (let index = messages.length - 1; index >= 0 && kept.length < CHAT_HISTORY_MAX_TURNS; index--) {
    const content = messages[index].content.slice(0, CHAT_MAX_MESSAGE_CHARS);
    if (kept.length > 0 && chars + content.length > CHAT_HISTORY_MAX_CHARS) break;

    kept.unshift({ role: messages[index].role, content });
    chars += content.length;
  }

  // The conversation must open with the user's turn.
  while (kept[0]?.role === "assistant") kept.shift();

  return kept;
}
