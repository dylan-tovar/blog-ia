import { describe, expect, it } from "vitest";
import { trimChatHistory } from "./chat-history";
import {
  CHAT_HISTORY_MAX_CHARS,
  CHAT_HISTORY_MAX_TURNS,
  CHAT_MAX_MESSAGE_CHARS,
} from "./constants";
import type { ChatMessage } from "./types";

const user = (content: string): ChatMessage => ({ role: "user", content });
const assistant = (content: string): ChatMessage => ({ role: "assistant", content });

describe("trimChatHistory", () => {
  it("keeps a short conversation as is", () => {
    const history = [user("a"), assistant("b"), user("c")];

    expect(trimChatHistory(history)).toEqual(history);
  });

  it("keeps only the most recent turns", () => {
    const history = Array.from({ length: 40 }, (_, index) => (index % 2 === 0 ? user(`u${index}`) : assistant(`a${index}`)));
    history.push(user("last"));

    const trimmed = trimChatHistory(history);

    expect(trimmed.length).toBeLessThanOrEqual(CHAT_HISTORY_MAX_TURNS);
    expect(trimmed.at(-1)).toEqual(user("last"));
  });

  it("drops the oldest messages once the character budget is spent", () => {
    const big = "x".repeat(CHAT_MAX_MESSAGE_CHARS);
    const history = [user(big), assistant(big), user(big), assistant(big), user("pregunta")];

    const trimmed = trimChatHistory(history);
    const total = trimmed.reduce((sum, message) => sum + message.content.length, 0);

    expect(total).toBeLessThanOrEqual(CHAT_HISTORY_MAX_CHARS);
    expect(trimmed.at(-1)).toEqual(user("pregunta"));
  });

  it("cuts a message that is longer than the per-message cap", () => {
    const [only] = trimChatHistory([user("y".repeat(CHAT_MAX_MESSAGE_CHARS + 100))]);

    expect(only.content).toHaveLength(CHAT_MAX_MESSAGE_CHARS);
  });

  it("never starts with an assistant message", () => {
    const history = [assistant("respuesta huérfana"), user("hola")];

    expect(trimChatHistory(history)).toEqual([user("hola")]);
  });
});
