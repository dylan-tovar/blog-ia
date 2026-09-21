"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AiErrorMessage } from "./AiErrorMessage";
import { outlineToMarkdown, type ClientAiError, type OutlineSection } from "./ai-ui";
import type { AiRunner } from "./use-ai-request";

interface OutlineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  run: AiRunner;
  // Returns an error message when the outline cannot be inserted, or null on success.
  onInsert: (markdown: string) => string | null;
}

function OutlineForm({ run, onInsert, onClose }: Omit<OutlineDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const [topic, setTopic] = useState("");
  const [sections, setSections] = useState<OutlineSection[] | null>(null);
  const [error, setError] = useState<ClientAiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [insertError, setInsertError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  const trimmed = topic.trim();
  const validTopic = trimmed.length >= 3 && trimmed.length <= 200;

  async function generate() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;

    setLoading(true);
    setError(null);
    setInsertError(null);
    const result = await run("outline", { topic: trimmed }, current.signal);
    if (current.signal.aborted) {
      return;
    }

    setLoading(false);
    if (result.ok) {
      setSections(result.data.sections);
    } else {
      setError(result.error);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (validTopic && !loading) {
      void generate();
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Generar estructura</DialogTitle>
        <DialogDescription>
          Contanos de qué trata el artículo y armamos un esqueleto de títulos y subtítulos para que
          lo completes.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Label htmlFor="outline-topic">Tema</Label>
        <div className="flex gap-2">
          <Input
            id="outline-topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            maxLength={200}
            placeholder="Ej.: cómo empezar con arquitectura hexagonal"
            disabled={loading}
            autoFocus
          />
          <Button type="submit" disabled={!validTopic || loading}>
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            {loading ? "Generando…" : sections ? "Regenerar" : "Generar"}
          </Button>
        </div>
      </form>

      <div aria-live="polite" className="flex flex-col gap-2">
        {loading && <p className="text-sm text-muted-foreground">Generando la estructura…</p>}
        {error && (
          <AiErrorMessage
            key={`${error.kind}-${error.retryAfter ?? 0}`}
            error={error}
            onRetry={() => void generate()}
            disabled={loading}
          />
        )}
        {insertError && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{insertError}</p>}
      </div>

      {sections && (
        <ol
          aria-label="Estructura sugerida"
          className="flex max-h-[45svh] flex-col gap-3 overflow-y-auto rounded-md border border-border/60 p-3 text-sm"
        >
          {sections.map((section, index) => (
            <li key={`${section.title}-${index}`}>
              <p className="font-semibold text-foreground">{section.title}</p>
              {section.subsections.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {section.subsections.map((subsection) => (
                    <li key={subsection}>{subsection}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
        {sections && (
          <Button
            type="button"
            onClick={() => {
              const failure = onInsert(outlineToMarkdown(sections));
              if (failure) {
                setInsertError(failure);
                return;
              }
              onClose();
            }}
            disabled={loading}
          >
            Insertar en el artículo
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

export function OutlineDialog({ open, onOpenChange, run, onInsert }: OutlineDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <OutlineForm run={run} onInsert={onInsert} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
