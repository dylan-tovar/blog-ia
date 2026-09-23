"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import type { SearchResults as SearchResultsData } from "@/features/discovery/queries";
import { SearchResults } from "./SearchResults";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { cn } from "@/lib/utils";

// The right rail only exists from `xl:` (1280px) up (see AppShell), so the modal
// switches to a Dialog at the same breakpoint instead of the app's usual `md`.
const SEARCH_MODAL_QUERY = "(min-width: 1280px)";
const DEBOUNCE_MS = 250;
const EMPTY_RESULTS: SearchResultsData = { people: [], posts: [], tags: [] };

interface SearchModalProps {
  variant?: "icon" | "bar" | "nav";
  className?: string;
}

export function SearchModal({ variant = "icon", className }: SearchModalProps) {
  const isDesktop = useIsDesktop(SEARCH_MODAL_QUERY);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultsData | null>(null);
  const [isPending, setIsPending] = useState(false);
  const requestIdRef = useRef(0);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!trimmedQuery) {
      // Invalidates any in-flight fetch; nothing to show while the box is empty
      // (see `displayedResults` below), so no state to reset here.
      requestIdRef.current += 1;
      return;
    }

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      setIsPending(true);
      fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : EMPTY_RESULTS))
        .catch(() => EMPTY_RESULTS)
        .then((data: SearchResultsData) => {
          if (requestIdRef.current === requestId) {
            setResults(data);
            setIsPending(false);
          }
        });
    }, DEBOUNCE_MS);

    // Cancels both the pending debounce and, once it fired, the in-flight request
    // itself — otherwise every keystroke lets its superseded fetch (and the 3 ILIKE
    // queries behind it) run to completion server-side for nothing.
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [trimmedQuery]);

  const displayedResults = trimmedQuery ? results : null;
  const displayedPending = trimmedQuery ? isPending : false;

  function close() {
    setOpen(false);
    setQuery("");
    setResults(null);
  }

  const trigger =
    variant === "bar" ? (
      <span
        className={cn(
          "flex min-h-11 w-full items-center gap-2 rounded-full border border-input bg-muted px-3.5 text-sm text-muted-foreground transition-colors hover:bg-muted/70",
          className,
        )}
      >
        <Search className="size-4 shrink-0" aria-hidden />
        Buscar
      </span>
    ) : variant === "nav" ? (
      // Matches DesktopSidebar's other nav rows (icon + label, no active state — a
      // modal trigger is never "the current page").
      <span
        className={cn(
          "group flex min-h-12 w-full cursor-pointer items-center justify-center gap-4 rounded-lg px-3 py-2.5 text-base font-medium text-muted-foreground transition-all hover:bg-accent/60 hover:text-foreground lg:justify-start lg:px-4",
          className,
        )}
      >
        <div className="relative grid size-7 place-items-center">
          <Search className="size-6 transition-transform group-hover:scale-110" aria-hidden />
        </div>
        <span className="hidden lg:inline">Buscar</span>
      </span>
    ) : (
      <span
        className={cn(
          "grid min-h-11 min-w-11 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground",
          className,
        )}
      >
        <Search className="size-5" aria-hidden />
      </span>
    );

  const body = (
    <>
      <Input
        autoFocus
        type="search"
        placeholder="Buscar personas, publicaciones o temas..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <SearchResults
        query={trimmedQuery}
        results={displayedResults}
        isPending={displayedPending}
        onNavigate={close}
      />
    </>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger aria-label="Buscar" className="cursor-pointer">
          {trigger}
        </DialogTrigger>
        <DialogContent className="top-[20%] translate-y-0 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Buscar</DialogTitle>
            <DialogDescription className="sr-only">
              Buscar personas, publicaciones o temas
            </DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
      <DrawerTrigger aria-label="Buscar" className="cursor-pointer">
        {trigger}
      </DrawerTrigger>
      <DrawerContent className="mx-2 mb-2 gap-3 p-4 pt-1 sm:mx-auto sm:max-w-md [--drawer-inset:0.5rem]">
        <DrawerHeader className="sr-only">
          <DrawerTitle>Buscar</DrawerTitle>
          <DrawerDescription>Buscar personas, publicaciones o temas</DrawerDescription>
        </DrawerHeader>
        {body}
      </DrawerContent>
    </Drawer>
  );
}
