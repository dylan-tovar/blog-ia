"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
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
    <section aria-labelledby="interest-chips-heading" className="flex flex-col gap-2">
      <h2 id="interest-chips-heading" className="text-sm font-semibold text-foreground">
        Tus temas
      </h2>
      <div role="group" aria-label="Temas de interés" className="flex flex-wrap gap-2">
        {options.map(({ id, name }) => {
          const selected = selectedIds.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              disabled={isPending}
              onClick={() => toggle(id)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                selected
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {selected && <Check aria-hidden="true" className="size-3" />}
              {name}
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
