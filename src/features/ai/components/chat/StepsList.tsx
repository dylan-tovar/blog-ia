import { Sparkles } from "lucide-react";
import type { ChatStep } from "@/features/ai/schemas";

// Live indicator while the answer streams, displaying the current key action.
// When finished, the raw technical steps are omitted so the UI stays focused on the generated content.
export function StepsList({ steps, streaming }: { steps: ChatStep[]; streaming: boolean }) {
  if (!streaming) return null;

  const activeStep = [...steps].reverse().find((s) => s.status === "running") ?? steps.at(-1);
  if (!activeStep) return null;

  return (
    <div
      role="status"
      aria-label="Progreso del asistente"
      className="flex items-center gap-2 py-1 text-xs text-muted-foreground animate-in fade-in duration-200"
    >
      <Sparkles className="size-3.5 text-primary animate-pulse motion-reduce:animate-none shrink-0" aria-hidden="true" />
      <span className="shimmer font-medium">{activeStep.label}…</span>
    </div>
  );
}
