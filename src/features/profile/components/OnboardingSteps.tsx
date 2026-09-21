import { cn } from "@/lib/utils";

const STEPS = ["Tu perfil", "Tus intereses"] as const;

interface OnboardingStepsProps {
  current: 1 | 2;
}

export function OnboardingSteps({ current }: OnboardingStepsProps) {
  return (
    <div className="flex flex-col gap-2">
      <ol aria-label="Pasos del registro" className="flex gap-1.5">
        {STEPS.map((label, index) => {
          const step = index + 1;
          return (
            <li
              key={label}
              aria-current={step === current ? "step" : undefined}
              className="flex-1"
            >
              <span className="sr-only">
                Paso {step} de {STEPS.length}: {label}
                {step < current ? " (completado)" : ""}
              </span>
              <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
                {/* `scale-*` uses the `scale` property, so that is what transitions.
                    `starting:` animates the fill on a fresh mount. */}
                <div
                  className={cn(
                    "h-full origin-left rounded-full bg-primary transition-[scale] duration-300 ease-out motion-reduce:transition-none starting:scale-x-0",
                    step <= current ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <p aria-hidden="true" className="text-xs font-medium text-muted-foreground">
        Paso {current} de {STEPS.length}
      </p>
    </div>
  );
}
