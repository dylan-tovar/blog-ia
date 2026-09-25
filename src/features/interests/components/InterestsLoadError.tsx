"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { skipInterests } from "@/features/interests/actions";

// Allows retrying or skipping when topics fail to load.
export function InterestsLoadError() {
  const router = useRouter();
  const [pending, startRefreshTransition] = useTransition();
  const [skipState, skipAction, skipPending] = useActionState(skipInterests, undefined);

  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="text-sm text-destructive">
        No pudimos cargar los temas. Revisá tu conexión e intentá de nuevo.
      </p>
      {skipState?.error && (
        <p role="alert" className="text-sm text-destructive">
          {skipState.error}
        </p>
      )}
      <div className="flex flex-col items-center gap-3">
        <Button
          type="button"
          disabled={pending || skipPending}
          onClick={() => startRefreshTransition(() => router.refresh())}
          className="w-full cursor-pointer"
        >
          {pending && <Loader2 className="animate-spin motion-reduce:animate-none" />}
          Reintentar
        </Button>
        <Button
          type="button"
          variant="link"
          size="sm"
          disabled={pending || skipPending}
          onClick={() => {
            startTransition(() => {
              skipAction();
            });
          }}
          className="cursor-pointer text-muted-foreground hover:text-foreground"
        >
          {skipPending && (
            <Loader2 className="mr-1.5 inline size-3.5 animate-spin motion-reduce:animate-none" />
          )}
          Saltar
        </Button>
      </div>
    </div>
  );
}
