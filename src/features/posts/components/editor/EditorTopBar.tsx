import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AI_DRAWER_ID } from "@/features/ai/components/chat/ai-drawer";
import { PostStatusBadge } from "@/features/posts/components/PostStatusBadge";
import type { SaveState } from "@/features/posts/components/editor/use-autosave";
import { contentCounter } from "@/features/posts/limits";
import { cn } from "@/lib/utils";

const SAVE_LABELS: Record<SaveState, string> = {
  idle: "",
  saving: "Guardando…",
  saved: "Guardado",
  error: "No se pudo guardar",
  "title-too-long": "El título es demasiado largo",
  "content-too-long": "El artículo es demasiado largo",
};

const ERROR_STATES: SaveState[] = ["error", "title-too-long", "content-too-long"];

interface EditorTopBarProps {
  status: string;
  saveState: SaveState;
  previewing: boolean;
  canPublish: boolean;
  contentLength: number;
  onTogglePreview: () => void;
  onContinue: () => void;
  aiOpen: boolean;
  aiShortcut: string;
  onToggleAi: () => void;
}

export function EditorTopBar({
  status,
  saveState,
  previewing,
  canPublish,
  contentLength,
  onTogglePreview,
  onContinue,
  aiOpen,
  aiShortcut,
  onToggleAi,
}: EditorTopBarProps) {
  const counter = contentCounter(contentLength);

  return (
    <header className="sticky top-0 z-30 h-(--editor-header-h) border-b border-border/60 bg-background/95 backdrop-blur">
      <div className="flex h-full items-center gap-3 px-3 md:px-4">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Volver a mis posts"
          nativeButton={false}
          render={<Link href="/posts" />}
        >
          <ArrowLeft />
        </Button>

        <PostStatusBadge status={status} />
        <span
          role="status"
          aria-live="polite"
          className={
            ERROR_STATES.includes(saveState)
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {SAVE_LABELS[saveState]}
        </span>
        {counter.show && (
          <span
            className={cn(
              "text-xs tabular-nums text-muted-foreground",
              counter.remaining < 0 && "text-destructive",
            )}
          >
            {counter.remaining >= 0
              ? `${counter.remaining.toLocaleString("es")} caracteres restantes`
              : `${Math.abs(counter.remaining).toLocaleString("es")} caracteres de más`}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant={aiOpen ? "default" : "secondary"}
            className="gap-1.5"
            aria-label="Asistente de IA"
            aria-pressed={aiOpen}
            aria-controls={AI_DRAWER_ID}
            title={`Asistente de IA (${aiShortcut})`}
            onClick={onToggleAi}
          >
            <Sparkles aria-hidden />
            IA
          </Button>
          <Button type="button" variant="secondary" aria-pressed={previewing} onClick={onTogglePreview}>
            {previewing ? "Editar" : "Vista previa"}
          </Button>
          <Button type="button" onClick={onContinue}>
            {canPublish ? "Continuar" : "Tags"}
          </Button>
        </div>
      </div>
    </header>
  );
}
