"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Check, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContentScore } from "@/features/ai/schemas";
import { addTag } from "@/features/posts/actions";
import { cn } from "@/lib/utils";
import { AiErrorMessage } from "./AiErrorMessage";
import { groupSuggestions, noPostIdError, scoreBand, type ClientAiError } from "./ai-ui";
import type { AiRunner } from "./use-ai-request";

interface ScorePanelProps {
  run: AiRunner;
  ensurePostId: () => Promise<string | null>;
  getContent: () => string;
  content: string;
  tagNames: string[];
  onTagAdded: (tag: { id: string; name: string }) => void;
  onClose: () => void;
}

type KeywordState = { status: "adding" | "added" | "failed"; message?: string };

const BAND_STYLES = {
  low: { bar: "bg-destructive", label: "Puede mejorar" },
  medium: { bar: "bg-amber-500", label: "Bien encaminado" },
  high: { bar: "bg-emerald-500", label: "Muy bien" },
} as const;

const NEEDS_TEXT: ClientAiError = {
  kind: "input_too_short",
  message: "Escribí un poco más antes de analizar el contenido.",
};

export function ScorePanel({ run, ensurePostId, getContent, content, tagNames, onTagAdded, onClose }: ScorePanelProps) {
  const [analysis, setAnalysis] = useState<ContentScore | null>(null);
  const [analyzedContent, setAnalyzedContent] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<ClientAiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [keywords, setKeywords] = useState<Record<string, KeywordState>>({});
  const controller = useRef<AbortController | null>(null);

  async function request(regenerate: boolean, signal: AbortSignal) {
    const postId = await ensurePostId();
    if (signal.aborted) {
      return;
    }
    if (!postId) {
      setLoading(false);
      setError(noPostIdError(getContent(), NEEDS_TEXT));
      return;
    }

    const snapshot = getContent();
    const result = await run("score", { postId, regenerate }, signal);
    if (signal.aborted) {
      return;
    }

    setLoading(false);
    if (result.ok) {
      setAnalysis(result.data.analysis);
      setCached(result.data.cached);
      setAnalyzedContent(snapshot);
    } else {
      setError(result.error);
    }
  }

  const start = useEffectEvent((signal: AbortSignal) => request(false, signal));

  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    // Deferred so a StrictMode remount (which aborts the first signal) never fires a request.
    queueMicrotask(() => {
      if (!current.signal.aborted) {
        void start(current.signal);
      }
    });
    return () => current.abort();
  }, []);

  function reload(regenerate: boolean) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;

    setLoading(true);
    setError(null);
    void request(regenerate, current.signal);
  }

  async function handleAddKeyword(keyword: string) {
    setKeywords((current) => ({ ...current, [keyword]: { status: "adding" } }));

    const postId = await ensurePostId();
    const result = postId ? await addTag(postId, keyword) : { ok: false as const, tag: undefined, error: undefined };

    if (result.ok && result.tag) {
      onTagAdded(result.tag);
      setKeywords((current) => ({ ...current, [keyword]: { status: "added" } }));
    } else {
      setKeywords((current) => ({
        ...current,
        [keyword]: { status: "failed", message: result.error ?? "No se pudo agregar" },
      }));
    }
  }

  const stale = analysis !== null && analyzedContent !== null && analyzedContent !== content;
  const band = analysis ? BAND_STYLES[scoreBand(analysis.score)] : null;

  return (
    <section aria-label="Análisis de contenido" className="flex flex-col gap-4 rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Análisis del contenido</h3>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Cerrar análisis" onClick={onClose}>
          <X />
        </Button>
      </div>

      <div aria-live="polite" className="flex flex-col gap-4">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Analizando el texto…
          </p>
        )}

        {error && <AiErrorMessage key={`${error.kind}-${error.retryAfter ?? 0}`} error={error} onRetry={() => reload(false)} disabled={loading} />}

        {analysis && band && (
          <>
            <div>
              <p className="text-3xl font-semibold tabular-nums text-foreground">
                {analysis.score}
                <span className="text-sm font-normal text-muted-foreground">/100</span>
              </p>
              <div
                role="meter"
                aria-label="Puntaje de calidad"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={analysis.score}
                aria-valuetext={`${analysis.score} de 100: ${band.label}`}
                className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
              >
                <div className={cn("h-full rounded-full", band.bar)} style={{ width: `${analysis.score}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{band.label}</p>
            </div>

            {stale && (
              <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                El texto cambió desde este análisis. Regeneralo para ver puntajes actualizados.
              </p>
            )}

            {groupSuggestions(analysis.suggestions).map((group) => (
              <section key={group.type} aria-label={group.label}>
                <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </h4>
                <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-sm text-foreground">
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}

            {analysis.keywords.length > 0 && (
              <section aria-label="Palabras clave sugeridas">
                <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Palabras clave
                </h4>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {analysis.keywords.map((keyword) => {
                    const local = keywords[keyword];
                    const state = tagNames.includes(keyword.toLowerCase()) ? { status: "added" as const } : local;
                    return (
                      <li key={keyword}>
                        <Button
                          type="button"
                          size="xs"
                          variant={state?.status === "added" ? "secondary" : "outline"}
                          disabled={state?.status === "adding" || state?.status === "added"}
                          onClick={() => void handleAddKeyword(keyword)}
                          aria-label={`Agregar ${keyword} como tag`}
                        >
                          {state?.status === "adding" ? (
                            <Loader2 className="animate-spin" aria-hidden />
                          ) : state?.status === "added" ? (
                            <Check aria-hidden />
                          ) : (
                            <Plus aria-hidden />
                          )}
                          {keyword}
                        </Button>
                        {state?.status === "failed" && (
                          <span className="ml-1 text-xs text-destructive">{state.message}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {cached && !stale && (
              <p className="text-xs text-muted-foreground">
                Resultado guardado: el texto no cambió desde la última vez.
              </p>
            )}

            <Button type="button" variant="secondary" size="sm" onClick={() => reload(true)} disabled={loading}>
              <RefreshCw aria-hidden />
              Regenerar
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
