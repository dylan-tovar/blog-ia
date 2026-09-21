"use client";

import { useEffect, useState } from "react";

// Counts down whole seconds from `initial`. Mount with a `key` per request so it restarts.
export function useCountdown(initial: number) {
  const [secondsLeft, setSecondsLeft] = useState(Math.max(0, initial));
  const counting = secondsLeft > 0;

  useEffect(() => {
    if (!counting) {
      return;
    }
    const timer = setInterval(() => setSecondsLeft((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, [counting]);

  return { secondsLeft, counting };
}
