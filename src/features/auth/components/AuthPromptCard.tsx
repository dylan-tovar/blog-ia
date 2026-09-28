"use client";

import Link from "next/link";
import { Newspaper } from "lucide-react";
import { LoginDrawer } from "@/features/auth/components/LoginDrawer";
import { cn } from "@/lib/utils";

interface AuthPromptCardProps {
  className?: string;
}

export function AuthPromptCard({ className }: AuthPromptCardProps) {
  return (
    <section
      aria-label="Invitación a unirse"
      className={cn(
        "flex flex-col items-center rounded-2xl border border-border/80 bg-card p-6 text-center shadow-xs",
        className,
      )}
    >
      {/* Brand logo icon */}
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Newspaper className="size-6" aria-hidden="true" />
      </div>

      {/* Heading */}
      <h2 className="text-lg font-bold tracking-tight text-foreground">
        Inicia sesión o regístrate
      </h2>

      {/* Subtitle / Description */}
      <p className="mt-1.5 mb-5 text-sm leading-relaxed text-muted-foreground">
        Únete a la comunidad para leer, escribir y compartir sobre tus temas favoritos.
      </p>

      {/* Action buttons */}
      <div className="flex w-full flex-col gap-2.5">
        <Link
          href="/register"
          className="flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
        >
          Crear una cuenta
        </Link>

        <LoginDrawer
          trigger={
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-center rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground transition-all hover:bg-secondary/80 active:scale-[0.98] cursor-pointer"
            >
              Iniciar sesión
            </button>
          }
        />
      </div>
    </section>
  );
}
