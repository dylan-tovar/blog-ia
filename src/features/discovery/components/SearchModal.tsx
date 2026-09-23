"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { SearchResults as SearchResultsData } from "@/features/discovery/queries";
import { SearchResults } from "./SearchResults";
import { useVisualViewportStyle } from "@/hooks/use-visual-viewport-style";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 250;
const EMPTY_RESULTS: SearchResultsData = { people: [], posts: [], tags: [] };

interface SearchModalProps {
  variant?: "icon" | "bar" | "nav";
  className?: string;
}

export function SearchModal({ variant = "icon", className }: SearchModalProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultsData | null>(null);
  const [isPending, setIsPending] = useState(false);
  const requestIdRef = useRef(0);
  const viewportStyle = useVisualViewportStyle(open);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!trimmedQuery) {
      // Invalidates any in-flight fetch; nothing to show while the box is empty
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

    // Cancels both the pending debounce and the in-flight request itself
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
          "flex min-h-11 w-full items-center gap-2 rounded-xl border border-input bg-card px-3.5 text-sm text-muted-foreground transition-colors hover:bg-muted",
          className,
        )}
      >
        <Search className="size-4 shrink-0" aria-hidden />
        Buscar
      </span>
    ) : variant === "nav" ? (
      // Matches DesktopSidebar's other nav rows (icon + label, no active state)
      <span
        className={cn(
          "group flex min-h-12 w-full cursor-pointer items-center justify-center gap-4 rounded-lg px-3 py-2.5 text-base font-medium text-muted-foreground transition-all hover:bg-accent/60 hover:text-foreground lg:justify-start lg:px-4",
          className,
        )}
      >
        <div className="relative grid size-7 place-items-center">
          <Search className="size-5 transition-transform group-hover:scale-110" aria-hidden />
        </div>
        <span className="hidden leading-none lg:inline">Buscar</span>
      </span>
    ) : (
      <span
        className={cn(
          "grid size-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          className,
        )}
      >
        <Search className="size-5" aria-hidden />
      </span>
    );

  const searchBar = (
    <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3 md:py-3.5">
      <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <input
        autoFocus
        type="text"
        placeholder="Buscar personas, publicaciones o temas..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground border-none outline-none focus:outline-none focus:ring-0"
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setResults(null);
          }}
          className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          aria-label="Limpiar búsqueda"
        >
          <X className="size-4" />
        </button>
      )}
      <button
        type="button"
        onClick={close}
        className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0 md:hidden"
      >
        Cancelar
      </button>
    </div>
  );

  const resultsContent = (
    <div className="flex-1 overflow-y-auto px-4 py-2 md:max-h-[60svh]">
      {!trimmedQuery && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Escribí para buscar personas, publicaciones o temas...
        </div>
      )}
      <SearchResults
        query={trimmedQuery}
        results={displayedResults}
        isPending={displayedPending}
        onNavigate={close}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label="Buscar"
        className={cn("cursor-pointer", variant === "bar" && "w-full block text-left")}
      >
        {trigger}
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        style={viewportStyle}
        className={cn(
          "flex flex-col gap-0 p-0 overflow-hidden bg-background md:bg-popover shadow-2xl",
          // Mobile: Full screen edge-to-edge identical to NoteDialog
          "max-md:inset-x-0 max-md:top-[var(--vvt,0px)] max-md:h-[var(--vvh,100dvh)] max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-none max-md:ring-0",
          "max-md:pt-[max(0.5rem,env(safe-area-inset-top))] max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))]",
          // Desktop: Centered floating card
          "md:top-[18%] md:translate-y-0 md:max-w-xl md:rounded-2xl md:border md:border-border/80",
        )}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Buscar</DialogTitle>
          <DialogDescription>
            Buscar personas, publicaciones o temas
          </DialogDescription>
        </DialogHeader>
        {searchBar}
        {resultsContent}
      </DialogContent>
    </Dialog>
  );
}
