"use client";

import { useEffect, useEffectEvent } from "react";
import { isAiDrawerShortcut } from "./ai-drawer";

// Capture phase + stopPropagation so ProseMirror (and the browser) never see Cmd/Ctrl+I.
export function useAiDrawerShortcut(onToggle: () => void) {
  const toggle = useEffectEvent(onToggle);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isAiDrawerShortcut(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      toggle();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);
}
