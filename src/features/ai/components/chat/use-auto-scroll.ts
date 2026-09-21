"use client";

import { useLayoutEffect, useRef } from "react";
import { isNearBottom, type ChatEntry } from "./chat-state";

// Follows the newest text unless the author scrolled up to read; sending a message resumes following.
export function useAutoScroll(entries: ChatEntry[]) {
  const ref = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const count = useRef(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || entries.length === 0) return;

    if (entries.length > count.current) following.current = true;
    count.current = entries.length;

    if (following.current) element.scrollTop = element.scrollHeight;
  }, [entries]);

  return {
    ref,
    onScroll: () => {
      if (ref.current) following.current = isNearBottom(ref.current);
    },
  };
}
