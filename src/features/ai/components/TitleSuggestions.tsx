"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AiErrorMessage } from "./AiErrorMessage";
import { cleanTitles, noPostIdError, type ClientAiError } from "./ai-ui";
import type { AiRunner } from "./use-ai-request";

interface TitleSuggestionsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  run: AiRunner;
  ensurePostId: () => Promise<string | null>;
  getContent: () => string;
  onUse: (title: string) => void;
}

const NEEDS_TEXT: ClientAiError = {
  kind: "input_too_short",
  message: "Escribí un poco más antes de pedir títulos.",
};

function TitlesContent({ run, ensurePostId, getContent, onUse, onClose }: Omit<TitleSuggestionsProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const [titles, setTitles] = useState<string[] | null>(null);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<ClientAiError | null>(null);
  const [loading, setLoading] = useState(true);
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

    const result = await run("titles", { postId, regenerate }, signal);
    if (signal.aborted) {
      return;
    }

    setLoading(false);
    if (result.ok) {
      setTitles(cleanTitles(result.data.titles));
      setCached(result.data.cached);
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

  function retry(regenerate: boolean) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;

    setLoading(true);
    setError(null);
    void request(regenerate, current.signal);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Títulos sugeridos</DialogTitle>
        <DialogDescription>Elegí uno para usarlo como título del artículo o descartalos.</DialogDescription>
      </DialogHeader>

      <div aria-live="polite" className="flex flex-col gap-3">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Buscando títulos…
          </p>
        )}

        {error && <AiErrorMessage key={`${error.kind}-${error.retryAfter ?? 0}`} error={error} onRetry={() => retry(false)} disabled={loading} />}

        {titles && titles.length > 0 && (
          <ul className="flex flex-col gap-2">
            {titles.map((title) => (
              <li
                key={title}
                className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3"
              >
                <span className="text-sm text-foreground [overflow-wrap:anywhere]">{title}</span>
                <Button type="button" size="sm" variant="secondary" onClick={() => onUse(title)}>
                  Usar
                </Button>
              </li>
            ))}
          </ul>
        )}

        {titles && cached && (
          <p className="text-xs text-muted-foreground">
            Resultado guardado: el texto no cambió desde la última vez.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Descartar
        </Button>
        {titles && (
          <Button type="button" variant="secondary" onClick={() => retry(true)} disabled={loading}>
            <RefreshCw aria-hidden />
            Regenerar
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

export function TitleSuggestions({ open, onOpenChange, run, ensurePostId, getContent, onUse }: TitleSuggestionsProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <TitlesContent
          run={run}
          ensurePostId={ensurePostId}
          getContent={getContent}
          onUse={onUse}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
