"use client";

import { useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";
import { updateInterests } from "@/features/interests/actions";
import type { InterestOption } from "@/features/interests/queries";
import { cn } from "@/lib/utils";

interface InterestChipsSidebarProps {
  options: InterestOption[];
  initialSelectedIds: string[];
}

// Plain local state, not `useOptimistic`: `updateInterests` never revalidates the page
// (interests aren't rendered anywhere that needs an immediate refresh), so without a
// server-driven re-render to converge on, `useOptimistic`'s value would snap back to
// `initialSelectedIds` as soon as each transition settles. Local state plus a manual
// rollback on error avoids depending on a revalidation that doesn't happen.
export function InterestChipsSidebar({ options, initialSelectedIds }: InterestChipsSidebarProps) {
  const [selectedIds, setSelectedIds] = useState(initialSelectedIds);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (options.length === 0) {
    return null;
  }

  function toggle(id: string) {
    const previous = selectedIds;
    const next = previous.includes(id)
      ? previous.filter((value) => value !== id)
      : [...previous, id];

    setError(null);
    setSelectedIds(next);

    startTransition(async () => {
      const result = await updateInterests(next);
      if (result?.error) {
        setSelectedIds(previous);
        setError(result.error);
      }
    });
  }

  return (
    <section aria-labelledby="interest-chips-heading" className="flex flex-col gap-3">
      <h2 id="interest-chips-heading" className="text-sm font-semibold text-foreground">
        Tópicos recomendados
      </h2>
      <div role="group" aria-label="Tópicos recomendados" className="flex flex-wrap gap-2.5">
        {options.map(({ id, name }) => {
          const selected = selectedIds.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              aria-label={
                selected
                  ? `Quitar ${name} de tus tópicos de interés`
                  : `Agregar ${name} a tus tópicos de interés`
              }
              disabled={isPending}
              onClick={() => toggle(id)}
              className={cn(
                "group inline-flex items-center rounded-full border text-sm transition-all disabled:pointer-events-none disabled:opacity-50",
                selected
                  ? "border-primary/50 bg-primary/10 font-medium text-primary hover:bg-primary/15"
                  : "border-border/80 bg-card/70 text-foreground/90 hover:border-border hover:bg-muted/60",
              )}
            >
              <span className="py-1.5 pl-3.5 pr-2.5">{name}</span>
              <span
                className={cn(
                  "flex items-center justify-center border-l py-1.5 pl-2 pr-3 transition-colors",
                  selected
                    ? "border-primary/30 text-primary"
                    : "border-border/70 text-muted-foreground group-hover:text-foreground",
                )}
              >
                {selected ? (
                  <Check aria-hidden="true" className="size-4 stroke-[2.5]" />
                ) : (
                  <Plus aria-hidden="true" className="size-4 stroke-[2]" />
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
