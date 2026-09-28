"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";
import { updateInterests } from "@/features/interests/actions";
import type { InterestOption } from "@/features/interests/queries";
import { cn } from "@/lib/utils";

interface InterestChipsSidebarProps {
  options: InterestOption[];
  initialSelectedIds: string[];
}

const MAX_DISPLAY_CHIPS = 12;
const MARK_DURATION_MS = 500;
const EXIT_DURATION_MS = 300;

export function InterestChipsSidebar({ options, initialSelectedIds }: InterestChipsSidebarProps) {
  // A ref, not state: nothing here re-renders on selection (statusById/dismissedIds
  // drive the UI), and handleSelect can fire again before a re-render would flush
  // anyway, so state would risk a stale read.
  const selectedIdsRef = useRef(initialSelectedIds);

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [statusById, setStatusById] = useState<Record<string, "marking" | "exiting">>({});
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const timeoutsRef = useRef<Set<NodeJS.Timeout>>(new Set());

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach((t) => clearTimeout(t));
      timeouts.clear();
    };
  }, []);

  const remainingOptions = options.filter((opt) => !dismissedIds.has(opt.id));

  if (remainingOptions.length === 0) {
    return null;
  }

  const visibleOptions = remainingOptions.slice(0, MAX_DISPLAY_CHIPS);

  function handleSelect(id: string) {
    if (statusById[id] || dismissedIds.has(id)) {
      return;
    }

    const previousSelected = selectedIdsRef.current;
    const nextSelected = previousSelected.includes(id)
      ? previousSelected
      : [...previousSelected, id];

    selectedIdsRef.current = nextSelected;
    setError(null);

    // 1. Mark as selected
    setStatusById((prev) => ({ ...prev, [id]: "marking" }));

    // 2. Start exit animation after mark duration
    const exitTimer = setTimeout(() => {
      setStatusById((prev) => ({ ...prev, [id]: "exiting" }));
      timeoutsRef.current.delete(exitTimer);

      // 3. Remove completely after exit animation finishes
      const removeTimer = setTimeout(() => {
        setDismissedIds((prev) => new Set(prev).add(id));
        setStatusById((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        timeoutsRef.current.delete(removeTimer);
      }, EXIT_DURATION_MS);

      timeoutsRef.current.add(removeTimer);
    }, MARK_DURATION_MS);

    timeoutsRef.current.add(exitTimer);

    // Persist to server
    startTransition(async () => {
      const result = await updateInterests(nextSelected);
      if (result?.error) {
        setError(result.error);
        selectedIdsRef.current = previousSelected;
        setDismissedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setStatusById((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    });
  }

  return (
    <section aria-labelledby="interest-chips-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 id="interest-chips-heading" className="text-sm font-semibold text-foreground">
          Tópicos recomendados
        </h2>
      </div>

      <div
        role="group"
        aria-label="Tópicos recomendados"
        className="flex max-h-[168px] flex-wrap gap-2.5 overflow-hidden"
      >
        {visibleOptions.map(({ id, name }) => {
          const status = statusById[id];
          const isMarked = status === "marking";
          const isExiting = status === "exiting";
          const isActive = isMarked || isExiting;

          return (
            <button
              key={id}
              type="button"
              aria-pressed={isActive}
              aria-label={`Agregar ${name} a tus tópicos de interés`}
              disabled={isActive}
              onClick={() => handleSelect(id)}
              className={cn(
                "group inline-flex items-center rounded-full border text-sm transition-all duration-300 select-none",
                isActive
                  ? "border-primary/60 bg-primary/15 font-medium text-primary shadow-xs"
                  : "border-border/80 bg-card/70 text-foreground/90 hover:border-border hover:bg-muted/60 cursor-pointer active:scale-95",
                isExiting && "opacity-0 scale-90 -translate-y-1 pointer-events-none",
              )}
            >
              <span className="py-1.5 pl-3.5 pr-2.5">{name}</span>
              <span
                className={cn(
                  "flex items-center justify-center border-l py-1.5 pl-2 pr-3 transition-colors",
                  isActive
                    ? "border-primary/30 text-primary"
                    : "border-border/70 text-muted-foreground group-hover:text-foreground",
                )}
              >
                {isActive ? (
                  <Check aria-hidden="true" className="size-4 stroke-[2.5] animate-in zoom-in-75 duration-200" />
                ) : (
                  <Plus aria-hidden="true" className="size-4 stroke-[2] transition-transform group-hover:rotate-90 duration-200" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
