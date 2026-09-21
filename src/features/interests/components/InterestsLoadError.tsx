"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// The step is mandatory, so a failed lookup offers a retry and nothing else.
export function InterestsLoadError() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="text-sm text-destructive">
        No pudimos cargar los temas. Revisá tu conexión e intentá de nuevo.
      </p>
      <Button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
        className="w-full"
      >
        {pending && <Loader2 className="animate-spin motion-reduce:animate-none" />}
        Reintentar
      </Button>
    </div>
  );
}
