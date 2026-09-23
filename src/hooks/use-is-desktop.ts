import { useSyncExternalStore } from "react";

const DESKTOP_QUERY = "(min-width: 768px)";

function subscribe(query: string) {
  return (onChange: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  };
}

const getSnapshot = (query: string) => () => window.matchMedia(query).matches;
const getServerSnapshot = (): boolean | null => null;

// null on the server and during hydration; only call it from client components.
// `query` defaults to the app's usual desktop breakpoint (`md`, 768px); pass a
// different media query (e.g. `lg`, 1024px) for a component with its own breakpoint.
export function useIsDesktop(query: string = DESKTOP_QUERY) {
  return useSyncExternalStore(subscribe(query), getSnapshot(query), getServerSnapshot);
}
