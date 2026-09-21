import { describe, expect, it } from "vitest";
import { isAiDrawerShortcut, parseDrawerOpen, shortcutLabel } from "./ai-drawer";

const base = { key: "i", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, isComposing: false, repeat: false };

describe("isAiDrawerShortcut", () => {
  it("matches Cmd+I and Ctrl+I", () => {
    expect(isAiDrawerShortcut({ ...base, metaKey: true })).toBe(true);
    expect(isAiDrawerShortcut({ ...base, ctrlKey: true })).toBe(true);
  });

  it("is case-insensitive on the key (caps lock)", () => {
    expect(isAiDrawerShortcut({ ...base, ctrlKey: true, key: "I" })).toBe(true);
  });

  it("rejects the bare key and other keys", () => {
    expect(isAiDrawerShortcut(base)).toBe(false);
    expect(isAiDrawerShortcut({ ...base, metaKey: true, key: "b" })).toBe(false);
  });

  it("rejects Shift and Alt variants (Mod-Shift-i stays italic)", () => {
    expect(isAiDrawerShortcut({ ...base, metaKey: true, shiftKey: true })).toBe(false);
    expect(isAiDrawerShortcut({ ...base, ctrlKey: true, altKey: true })).toBe(false);
  });

  it("rejects IME composition and key repeat", () => {
    expect(isAiDrawerShortcut({ ...base, metaKey: true, isComposing: true })).toBe(false);
    expect(isAiDrawerShortcut({ ...base, metaKey: true, repeat: true })).toBe(false);
  });
});

describe("shortcutLabel", () => {
  it("uses the command symbol on Apple platforms", () => {
    expect(shortcutLabel("MacIntel")).toBe("⌘I");
    expect(shortcutLabel("iPad")).toBe("⌘I");
  });

  it("uses Ctrl+I elsewhere", () => {
    expect(shortcutLabel("Win32")).toBe("Ctrl+I");
    expect(shortcutLabel("Linux x86_64")).toBe("Ctrl+I");
  });
});

describe("parseDrawerOpen", () => {
  it("is open only for the stored value '1'", () => {
    expect(parseDrawerOpen("1")).toBe(true);
    expect(parseDrawerOpen("0")).toBe(false);
    expect(parseDrawerOpen(null)).toBe(false);
    expect(parseDrawerOpen("garbage")).toBe(false);
  });
});
