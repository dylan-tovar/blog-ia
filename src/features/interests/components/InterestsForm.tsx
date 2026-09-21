"use client";

import { useActionState, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveInterests } from "@/features/interests/actions";
import { INTERESTS_MAX, requiredInterestCount } from "@/features/interests/constants";
import type { InterestOption } from "@/features/interests/queries";
import { interestCounterLabel } from "@/features/interests/selection";
import { cn } from "@/lib/utils";

interface InterestsFormProps {
  options: InterestOption[];
  initialSelectedIds: string[];
}

export function InterestsForm({ options, initialSelectedIds }: InterestsFormProps) {
  const [state, action, pending] = useActionState(saveInterests, undefined);
  const [selectedIds, setSelectedIds] = useState(initialSelectedIds);

  const required = requiredInterestCount(options.length);
  const atMax = selectedIds.length >= INTERESTS_MAX;
  const canSubmit = selectedIds.length >= required;

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay temas para elegir. Podés seguir sin elegir ninguno.
        </p>
      ) : (
        <>
          {/* Only the chips scroll: the counter and the button below stay in view. */}
          <div
            role="group"
            aria-label="Temas de interés"
            className="flex max-h-[50svh] flex-wrap gap-2 overflow-y-auto p-1 short:max-h-[40svh]"
          >
            {options.map(({ id, name }) => {
              const selected = selectedIds.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  disabled={!selected && atMax}
                  onClick={() => toggle(id)}
                  className={cn(
                    "inline-flex min-h-11 max-w-full min-w-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-muted text-foreground hover:bg-muted/70",
                  )}
                >
                  {selected && (
                    <Check
                      aria-hidden="true"
                      className="size-4 shrink-0 animate-in duration-150 zoom-in-50 motion-reduce:animate-none"
                    />
                  )}
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
          </div>
          {selectedIds.map((id) => (
            <input key={id} type="hidden" name="tagIds" value={id} />
          ))}
          <p
            id="interests-status"
            role="status"
            aria-live="polite"
            className="text-sm text-muted-foreground"
          >
            {interestCounterLabel(selectedIds.length, required, INTERESTS_MAX)}
          </p>
        </>
      )}
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button
        type="submit"
        disabled={pending || !canSubmit}
        aria-describedby={options.length > 0 ? "interests-status" : undefined}
        className="w-full"
      >
        {pending && <Loader2 className="animate-spin motion-reduce:animate-none" />}
        Continuar
      </Button>
    </form>
  );
}
