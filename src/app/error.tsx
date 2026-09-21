"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-foreground">Algo salió mal</h1>
      <p className="text-sm text-muted-foreground">
        Ocurrió un error inesperado. Podés intentar de nuevo.
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  );
}
