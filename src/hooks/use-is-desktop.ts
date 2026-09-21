import { useSyncExternalStore } from "react";

const DESKTOP_QUERY = "(min-width: 768px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const getSnapshot = (): boolean | null => window.matchMedia(DESKTOP_QUERY).matches;
const getServerSnapshot = (): boolean | null => null;

// null on the server and during hydration; only call it from client components.
export function useIsDesktop() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
