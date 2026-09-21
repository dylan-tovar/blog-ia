import { useSyncExternalStore, type CSSProperties } from "react";

const noopSubscribe = () => () => {};
const emptySnapshot = () => "";

function subscribe(onChange: () => void) {
  const viewport = window.visualViewport;
  if (!viewport) {
    return () => {};
  }
  viewport.addEventListener("resize", onChange);
  viewport.addEventListener("scroll", onChange);
  return () => {
    viewport.removeEventListener("resize", onChange);
    viewport.removeEventListener("scroll", onChange);
  };
}

function getSnapshot() {
  const viewport = window.visualViewport;
  return viewport ? `${Math.round(viewport.height)}:${Math.round(viewport.offsetTop)}` : "";
}

// Exposes the visual viewport (which shrinks when the on-screen keyboard opens) as
// --vvh / --vvt so fixed full-screen surfaces can fall back to 100dvh when unset.
export function useVisualViewportStyle(active: boolean): CSSProperties | undefined {
  const snapshot = useSyncExternalStore(
    active ? subscribe : noopSubscribe,
    active ? getSnapshot : emptySnapshot,
    emptySnapshot,
  );

  if (!snapshot) {
    return undefined;
  }

  const [height, offsetTop] = snapshot.split(":");
  return { "--vvh": `${height}px`, "--vvt": `${offsetTop}px` } as CSSProperties;
}
