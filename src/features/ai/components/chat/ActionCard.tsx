import { Check, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { actionPreview, defaultActionLabel, describeLocation } from "@/features/posts/components/editor/apply-action";
import { MarkdownContent } from "@/features/posts/components/MarkdownContent";
import { cn } from "@/lib/utils";
import { OVERLAP_NOTICE, type ActionState, type ActionStatus } from "./chat-state";

interface ActionCardProps {
  state: ActionState;
  // The answer is still being written: proposals cannot be applied yet.
  streaming: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onUndo: () => void;
}

const STATUS_BADGE: Record<ActionStatus, { label: string; variant: "secondary" | "default" | "outline" | "destructive" }> = {
  pending: { label: "Propuesta", variant: "secondary" },
  applied: { label: "Aplicado", variant: "default" },
  discarded: { label: "Descartada", variant: "outline" },
  stale: { label: "Desactualizada", variant: "destructive" },
  error: { label: "No se pudo aplicar", variant: "destructive" },
};

const PREVIEW_CLASS = "max-h-36 overflow-y-auto rounded-md border border-border/60 bg-background/60 px-2 py-1.5 text-xs prose-sm";

export function ActionCard({ state, streaming, onApply, onDiscard, onUndo }: ActionCardProps) {
  const { action, snapshot, status, notice } = state;
  const label = action.label ?? defaultActionLabel(action.op);
  const overlapping = status === "pending" && Boolean(state.overlapsWith);
  const badge = overlapping ? { label: "Se superpone", variant: "outline" as const } : STATUS_BADGE[status];
  const { before, after } = actionPreview(action, snapshot);
  const canApply = status === "pending" || status === "error";

  return (
    <section
      aria-label={`Propuesta: ${label}`}
      data-status={status}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg border border-border/70 bg-card/60 p-3",
        status === "discarded" && "opacity-60",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm leading-snug font-medium text-foreground [overflow-wrap:anywhere]">{label}</h3>
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{describeLocation(action, snapshot)}</p>
        </div>
        <Badge variant={badge.variant} className="shrink-0">
          {badge.label}
        </Badge>
      </div>

      {status !== "discarded" && (
        <div className="flex min-w-0 flex-col gap-1.5">
          {before !== null && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Antes</span>
              <MarkdownContent className={cn(PREVIEW_CLASS, "opacity-70")}>{before}</MarkdownContent>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {before !== null ? "Después" : "Contenido nuevo"}
            </span>
            <MarkdownContent className={PREVIEW_CLASS}>{after}</MarkdownContent>
          </div>
        </div>
      )}

      {notice && (
        <p role="alert" className="text-xs text-destructive [overflow-wrap:anywhere]">
          {notice}
        </p>
      )}

      {overlapping && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{OVERLAP_NOTICE}</p>}

      {status === "pending" && streaming && (
        <p className="text-xs text-muted-foreground">Podés aplicarla cuando termine la respuesta.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {canApply && (
          <Button type="button" size="sm" disabled={streaming} aria-label={`Aplicar propuesta: ${label}`} onClick={onApply}>
            <Check aria-hidden="true" />
            <span>Aplicar</span>
          </Button>
        )}
        {status === "applied" && (
          <Button type="button" size="sm" variant="outline" aria-label={`Deshacer propuesta: ${label}`} onClick={onUndo}>
            <Undo2 aria-hidden="true" />
            <span>Deshacer</span>
          </Button>
        )}
        {(canApply || status === "stale") && (
          <Button type="button" size="sm" variant="ghost" aria-label={`Descartar propuesta: ${label}`} onClick={onDiscard}>
            <X aria-hidden="true" />
            <span>Descartar</span>
          </Button>
        )}
      </div>
    </section>
  );
}
