"use client";

import {
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  Lightbulb,
  Palette,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Tone } from "@/features/ai/schemas";
import { cn } from "@/lib/utils";
import { TONE_LABELS } from "../ai-ui";

export interface QuickActionsProps {
  busy: boolean;
  disabled?: boolean;
  content?: string;
  scoreOpen?: boolean;
  onOutline: () => void;
  onTitles: () => void;
  onTone: (tone: Tone) => void;
  onScore: () => void;
}

/**
 * Compact horizontal toolbar intended to sit above the chat composer,
 * providing one-click access to editorial tools even mid-conversation.
 */
export function QuickActions({
  busy,
  disabled = false,
  scoreOpen,
  onOutline,
  onTitles,
  onTone,
  onScore,
}: QuickActionsProps) {
  const off = busy || disabled;

  return (
    <div
      role="toolbar"
      aria-label="Acciones rápidas del asistente"
      className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-border/60 bg-muted/20 px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <span className="mr-0.5 shrink-0 text-[11px] font-medium text-muted-foreground">Herramientas:</span>

      <Button
        type="button"
        variant="outline"
        size="xs"
        className="h-7 shrink-0 gap-1.5 rounded-full border-border/70 px-2.5 text-xs font-normal transition-colors hover:border-primary/40 hover:bg-accent/40"
        disabled={off}
        onClick={onOutline}
      >
        <Sparkles className="size-3 text-primary" />
        <span>Estructura</span>
      </Button>

      <Button
        type="button"
        variant="outline"
        size="xs"
        className="h-7 shrink-0 gap-1.5 rounded-full border-border/70 px-2.5 text-xs font-normal transition-colors hover:border-amber-500/40 hover:bg-accent/40"
        disabled={off}
        onClick={onTitles}
      >
        <Lightbulb className="size-3 text-amber-500 dark:text-amber-400" />
        <span>Títulos</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="h-7 shrink-0 gap-1.5 rounded-full border-border/70 px-2.5 text-xs font-normal transition-colors hover:border-purple-500/40 hover:bg-accent/40"
              disabled={off}
            />
          }
        >
          <Palette className="size-3 text-purple-500 dark:text-purple-400" />
          <span>Tono</span>
          <ChevronDown className="size-2.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          {(Object.keys(TONE_LABELS) as Tone[]).map((option) => (
            <DropdownMenuItem key={option} onClick={() => onTone(option)}>
              {TONE_LABELS[option]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        type="button"
        variant={scoreOpen ? "secondary" : "outline"}
        size="xs"
        className={cn(
          "h-7 shrink-0 gap-1.5 rounded-full border-border/70 px-2.5 text-xs font-normal transition-colors hover:border-emerald-500/40 hover:bg-accent/40",
          scoreOpen && "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15"
        )}
        disabled={off}
        onClick={onScore}
      >
        <BarChart3 className="size-3 text-emerald-500 dark:text-emerald-400" />
        <span>Analizar</span>
      </Button>
    </div>
  );
}

/**
 * Visual card grid intended for the empty state / initial welcome view of the AI drawer.
 */
export function QuickActionsGrid({
  busy,
  disabled = false,
  scoreOpen,
  onOutline,
  onTitles,
  onTone,
  onScore,
}: QuickActionsProps) {
  const off = busy || disabled;

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {/* 1. Estructura */}
      <button
        type="button"
        disabled={off}
        onClick={onOutline}
        className="group flex flex-col justify-between gap-3 rounded-xl border border-border/70 bg-card/60 p-3.5 text-left transition-all hover:border-primary/50 hover:bg-muted/40 hover:shadow-sm disabled:pointer-events-none disabled:opacity-50"
      >
        <div className="flex items-center justify-between">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-foreground">Generar estructura</span>
          <span className="text-[11px] leading-tight text-muted-foreground">Outline con títulos y subtítulos en el chat</span>
        </div>
      </button>

      {/* 2. Sugerir títulos */}
      <button
        type="button"
        disabled={off}
        onClick={onTitles}
        className="group flex flex-col justify-between gap-3 rounded-xl border border-border/70 bg-card/60 p-3.5 text-left transition-all hover:border-amber-500/50 hover:bg-muted/40 hover:shadow-sm disabled:pointer-events-none disabled:opacity-50"
      >
        <div className="flex items-center justify-between">
          <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 transition-colors group-hover:bg-amber-500 group-hover:text-white">
            <Lightbulb className="size-4" />
          </div>
          <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-foreground">Sugerir títulos</span>
          <span className="text-[11px] leading-tight text-muted-foreground">
            Variaciones atractivas y optimizadas para SEO
          </span>
        </div>
      </button>

      {/* 3. Cambiar tono */}
      <div className="flex flex-col justify-between gap-2.5 rounded-xl border border-border/70 bg-card/60 p-3.5 transition-all">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
            <Palette className="size-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-foreground">Cambiar tono</span>
            <span className="text-[11px] text-muted-foreground">Reescribir estilo en el chat</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          {(Object.keys(TONE_LABELS) as Tone[]).map((option) => (
            <Button
              key={option}
              type="button"
              size="xs"
              variant="secondary"
              className="h-6 rounded-md px-2 text-[11px] font-normal transition-colors hover:bg-purple-500/15 hover:text-purple-600 dark:hover:text-purple-400"
              disabled={off}
              onClick={() => onTone(option)}
            >
              {TONE_LABELS[option]}
            </Button>
          ))}
        </div>
      </div>

      {/* 4. Analizar contenido */}
      <button
        type="button"
        disabled={off}
        onClick={onScore}
        className={cn(
          "group flex flex-col justify-between gap-3 rounded-xl border border-border/70 bg-card/60 p-3.5 text-left transition-all hover:border-emerald-500/50 hover:bg-muted/40 hover:shadow-sm disabled:pointer-events-none disabled:opacity-50",
          scoreOpen && "border-emerald-500/60 bg-emerald-500/10"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 transition-colors group-hover:bg-emerald-500 group-hover:text-white">
            <BarChart3 className="size-4" />
          </div>
          <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-foreground">Analizar contenido</span>
          <span className="text-[11px] leading-tight text-muted-foreground">
            Revisión editorial, claridad y sugerencias
          </span>
        </div>
      </button>
    </div>
  );
}
