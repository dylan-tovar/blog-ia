import { describe, expect, it } from "vitest";
import { thinkingConfigFor } from "./thinking";

describe("thinkingConfigFor", () => {
  it.each(["gemini-2.5-flash", "gemini-2.5-flash-lite"])("disables the thinking budget for %s", (model) => {
    expect(thinkingConfigFor(model)).toEqual({ thinkingBudget: 0 });
  });

  it.each(["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3-pro-preview"])(
    "uses the minimal thinking level for %s",
    (model) => {
      expect(thinkingConfigFor(model)).toEqual({ thinkingLevel: "MINIMAL" });
    },
  );

  it.each(["gemini-2.5-pro", "gemini-2.0-flash", "gemini-flash-latest", "unknown"])(
    "sends no thinking config for %s",
    (model) => {
      expect(thinkingConfigFor(model)).toBeUndefined();
    },
  );
});
