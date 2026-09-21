"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { cn } from "@/lib/utils";

// Children are not mounted below md, so the editor never runs (or autosaves) on mobile.
export function DesktopOnly({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop();

  if (isDesktop === null) {
    return null;
  }

  if (!isDesktop) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-foreground">
          Editá artículos desde una computadora
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          La edición de artículos está disponible solo desde computadora. Desde el celular podés
          escribir notas.
        </p>
        <Link href="/" className={cn(buttonVariants({ variant: "secondary" }), "min-h-11")}>
          Volver al inicio
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
