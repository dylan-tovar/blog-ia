"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownContent } from "@/features/posts/components/MarkdownContent";
import type { Tone } from "@/features/ai/schemas";
import { AiErrorMessage } from "./AiErrorMessage";
import { TONE_LABELS, noPostIdError, type ClientAiError } from "./ai-ui";
import type { AiRunner } from "./use-ai-request";

interface ToneCompareDialogProps {
  tone: Tone | null;
  onClose: () => void;
  run: AiRunner;
  ensurePostId: () => Promise<string | null>;
  getContent: () => string;
  // Returns an error message when the rewrite cannot replace the content, or null on success.
  onReplace: (markdown: string) => string | null;
}

const NEEDS_TEXT: ClientAiError = {
  kind: "input_too_short",
  message: "Escribí un poco más antes de cambiar el tono.",
};

function ToneContent({ tone, onClose, run, ensurePostId, getContent, onReplace }: Omit<ToneCompareDialogProps, "tone"> & { tone: Tone }) {
  const [before, setBefore] = useState<string | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [error, setError] = useState<ClientAiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  async function request(signal: AbortSignal) {
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
    const result = await run("tone", { postId, tone }, signal);
    if (signal.aborted) {
      return;
    }

    setLoading(false);
    if (result.ok) {
      setBefore(snapshot);
      setAfter(result.data.markdown);
    } else {
      setError(result.error);
    }
  }

  const start = useEffectEvent((signal: AbortSignal) => request(signal));

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

  function retry() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;

    setLoading(true);
    setError(null);
    setReplaceError(null);
    void request(current.signal);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Cambiar tono: {TONE_LABELS[tone]}</DialogTitle>
        <DialogDescription>
          Compará el texto actual con la versión reescrita. Si la reemplazás, podés deshacerlo con
          Ctrl+Z.
        </DialogDescription>
      </DialogHeader>

      <div aria-live="polite" className="flex flex-col gap-3">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Reescribiendo el artículo… puede tardar unos segundos.
          </p>
        )}

        {error && <AiErrorMessage key={`${error.kind}-${error.retryAfter ?? 0}`} error={error} onRetry={retry} disabled={loading} />}
        {replaceError && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{replaceError}</p>}

        {before !== null && after !== null && (
          <div className="grid gap-4 md:grid-cols-2">
            <section aria-label="Antes" className="min-w-0">
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Antes</h3>
              <div className="max-h-[50svh] overflow-y-auto rounded-md border border-border/60 p-3">
                <MarkdownContent>{before}</MarkdownContent>
              </div>
            </section>
            <section aria-label="Después" className="min-w-0">
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Después</h3>
              <div className="max-h-[50svh] overflow-y-auto rounded-md border border-border/60 p-3">
                <MarkdownContent>{after}</MarkdownContent>
              </div>
            </section>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Descartar
        </Button>
        {after !== null && (
          <Button
            type="button"
            onClick={() => {
              const failure = onReplace(after);
              if (failure) {
                setReplaceError(failure);
                return;
              }
              onClose();
            }}
          >
            Reemplazar contenido
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

export function ToneCompareDialog({ tone, onClose, ...rest }: ToneCompareDialogProps) {
  return (
    <Dialog open={tone !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-4xl">
        {tone && <ToneContent key={tone} tone={tone} onClose={onClose} {...rest} />}
      </DialogContent>
    </Dialog>
  );
}
