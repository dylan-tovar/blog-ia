"use client";

import { AlertCircle, CheckCircle2, Gauge, Sparkles } from "lucide-react";
import type { ArticleAnalysis } from "@/features/ai/schemas";
import { cn } from "@/lib/utils";

interface AnalysisCardProps {
  analysis: ArticleAnalysis;
}

function getScoreTheme(score: number) {
  if (score >= 80) {
    return {
      label: "Excelente",
      stroke: "stroke-emerald-500",
      text: "text-emerald-500",
      bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      progressBg: "bg-emerald-500",
    };
  }
  if (score >= 50) {
    return {
      label: "Bien encaminado",
      stroke: "stroke-amber-500",
      text: "text-amber-500",
      bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      progressBg: "bg-amber-500",
    };
  }
  return {
    label: "Requiere revisión",
    stroke: "stroke-rose-500",
    text: "text-rose-500",
    bg: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    progressBg: "bg-rose-500",
  };
}

const METRIC_LABELS: Record<keyof ArticleAnalysis["metrics"], string> = {
  clarity: "Claridad",
  structure: "Estructura",
  tone: "Tono y voz",
  engagement: "Engagement",
  grammar: "Ortografía",
};

export function AnalysisCard({ analysis }: AnalysisCardProps) {
  const { score, metrics, verdict, strengths, weaknesses, improvements } = analysis;
  const theme = getScoreTheme(score);

  // SVG Radial Gauge geometry
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, score)) / 100) * circumference;

  return (
    <div
      role="region"
      aria-label="Auditoría y puntaje del artículo"
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-border/80 bg-card p-4 shadow-xs"
    >
      {/* Header: Radial Chart + Verdict */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Radial Chart */}
        <div className="flex shrink-0 items-center gap-3">
          <div className="relative flex size-24 items-center justify-center">
            <svg className="size-full -rotate-90" viewBox="0 0 96 96" aria-hidden="true">
              {/* Background circle track */}
              <circle
                cx="48"
                cy="48"
                r={radius}
                className="stroke-muted"
                strokeWidth="7"
                fill="none"
              />
              {/* Animated Progress circle */}
              <circle
                cx="48"
                cy="48"
                r={radius}
                className={cn("transition-all duration-700 ease-out", theme.stroke)}
                strokeWidth="7"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
                {score}
              </span>
              <span className="text-[10px] font-medium text-muted-foreground">/100</span>
            </div>
          </div>

          <div className="flex flex-col gap-1 sm:hidden">
            <span className={cn("inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-semibold", theme.bg)}>
              {theme.label}
            </span>
            <span className="text-xs font-medium text-muted-foreground">Puntaje Editorial</span>
          </div>
        </div>

        {/* Verdict & General Score Label */}
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="hidden items-center gap-2 sm:flex">
            <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", theme.bg)}>
              {theme.label}
            </span>
            <span className="text-xs font-medium text-muted-foreground">Auditoría Editorial Integral</span>
          </div>
          <p className="text-xs leading-relaxed text-foreground/90 font-normal">
            {verdict}
          </p>
        </div>
      </div>

      {/* Metrics Breakdown Grid */}
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
        <h4 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          <Gauge className="size-3.5 text-primary" />
          Dimensiones evaluadas
        </h4>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(Object.entries(metrics) as [keyof ArticleAnalysis["metrics"], number][]).map(([key, val]) => (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{METRIC_LABELS[key]}</span>
                <span className="font-semibold tabular-nums text-foreground">{val}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", getScoreTheme(val).progressBg)}
                  style={{ width: `${Math.min(100, Math.max(0, val))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed Analysis Lists */}
      <div className="flex flex-col gap-3 text-xs">
        {/* Qué está bien (Fortalezas) */}
        {strengths && strengths.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <h4 className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              Qué está bien
            </h4>
            <ul className="flex flex-col gap-1 pl-5 list-disc text-foreground/90 marker:text-emerald-500">
              {strengths.map((item, idx) => (
                <li key={idx} className="leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Qué no está bien o falta (Puntos ciegos) */}
        {weaknesses && weaknesses.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <h4 className="flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400">
              <AlertCircle className="size-4 shrink-0 text-amber-500" />
              Qué falta o debe ajustarse
            </h4>
            <ul className="flex flex-col gap-1 pl-5 list-disc text-foreground/90 marker:text-amber-500">
              {weaknesses.map((item, idx) => (
                <li key={idx} className="leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Áreas de mejora accionables */}
        {improvements && improvements.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <h4 className="flex items-center gap-1.5 font-semibold text-primary">
              <Sparkles className="size-4 shrink-0 text-primary" />
              Recomendaciones accionables
            </h4>
            <ul className="flex flex-col gap-1 pl-5 list-disc text-foreground/90 marker:text-primary">
              {improvements.map((item, idx) => (
                <li key={idx} className="leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
