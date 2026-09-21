export const AI_DRAWER_ID = "ai-chat-drawer";
export const AI_DRAWER_STORAGE_KEY = "editor:ai-drawer-open";

type KeyEventLike = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "isComposing" | "repeat"
>;

export function isAiDrawerShortcut(event: KeyEventLike) {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    !event.altKey &&
    !event.isComposing &&
    !event.repeat &&
    event.key.toLowerCase() === "i"
  );
}

export function shortcutLabel(platform: string) {
  return /mac|iphone|ipad/i.test(platform) ? "⌘I" : "Ctrl+I";
}

export function parseDrawerOpen(raw: string | null) {
  return raw === "1";
}
