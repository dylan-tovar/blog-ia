"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoginDrawer } from "@/features/auth/components/LoginDrawer";
import { getPostSummary } from "@/features/ai/summary-actions";
import { AiErrorMessage } from "./AiErrorMessage";
import type { ClientAiError } from "./ai-ui";

interface SummaryButtonProps {
  postId: string;
  initialSummary: string | null;
  viewerId: string | null;
}

// Reading is never blocked: the article renders on the server and this only adds an
// optional card. A cached summary opens instantly without any AI call.
export function SummaryButton({ postId, initialSummary, viewerId }: SummaryButtonProps) {
  const [summary, setSummary] = useState(initialSummary?.trim() || null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<ClientAiError | null>(null);
  const [isPending, startTransition] = useTransition();

  function load() {
    setError(null);
    startTransition(async () => {
      const result = await getPostSummary(postId);
      if (result.ok) {
        setSummary(result.summary);
      } else {
        setError(result.error);
      }
    });
  }

  function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }

    setOpen(true);
    if (!summary && viewerId && !isPending) {
      load();
    }
  }

  const needsLogin = open && !summary && !viewerId;

  return (
    <section aria-label="Resumen del artículo" className="mt-4">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-expanded={open}
        aria-controls="post-summary"
        onClick={handleToggle}
      >
        {isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
        {open ? "Ocultar resumen" : "Ver resumen"}
      </Button>

      <div id="post-summary" aria-live="polite" hidden={!open} className="mt-3">
        {isPending && (
          <p className="text-sm text-muted-foreground">Generando resumen…</p>
        )}

        {summary && (
          <div className="rounded-xl border border-border/80 bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Resumen</h2>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-foreground/90 [overflow-wrap:anywhere]">
              {summary}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Generado con IA (Google Gemini); puede contener errores.
            </p>
          </div>
        )}

        {needsLogin && (
          <p className="text-sm text-muted-foreground">
            <LoginDrawer
              trigger={
                <button
                  type="button"
                  className="font-medium text-blue-400 hover:underline cursor-pointer"
                >
                  Iniciá sesión
                </button>
              }
            />{" "}
            para generar el resumen.
          </p>
        )}

        {error?.kind === "unauthenticated" ? (
          <p className="text-sm text-muted-foreground">
            <LoginDrawer
              trigger={
                <button
                  type="button"
                  className="font-medium text-blue-400 hover:underline cursor-pointer"
                >
                  Iniciá sesión
                </button>
              }
            />{" "}
            para generar el resumen.
          </p>
        ) : (
          error && (
            <AiErrorMessage
              key={`${error.kind}-${error.retryAfter ?? 0}`}
              error={error}
              onRetry={load}
              disabled={isPending}
            />
          )
        )}

        {open && !summary && viewerId && (
          <p className="mt-2 text-xs text-muted-foreground">
            Al generar el resumen, el texto se envía a Google Gemini. En la capa gratuita, Google
            puede usarlo para mejorar sus productos.
          </p>
        )}
      </div>
    </section>
  );
}
