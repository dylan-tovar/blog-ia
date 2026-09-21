"use client";

import { isValidElement, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Sparkles, StickyNote } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { cn } from "@/lib/utils";

interface LoginDrawerProps {
  trigger?: React.ReactNode;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function LoginDrawer({
  trigger,
  className,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: LoginDrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const pathname = usePathname();

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (nextOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
    controlledOnOpenChange?.(nextOpen);
  };

  return (
    <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
      {trigger === null ? null : trigger ? (
        isValidElement(trigger) ? (
          <DrawerTrigger render={trigger} className={className} />
        ) : (
          <DrawerTrigger
            type="button"
            className={cn("cursor-pointer", className)}
          >
            {trigger}
          </DrawerTrigger>
        )
      ) : (
        <DrawerTrigger
          type="button"
          className={cn(
            "inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground cursor-pointer focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none",
            className,
          )}
        >
          Iniciar sesión
        </DrawerTrigger>
      )}

      <DrawerContent className="mx-2 sm:mx-auto sm:max-w-lg mb-2 pb-6 pt-1 min-h-[75vh] max-h-[92dvh] overflow-y-auto flex flex-col [--drawer-inset:0.5rem] data-[swipe-direction=down]:rounded-2xl data-[swipe-direction=down]:border border-border/80 shadow-2xl after:hidden">
        <DrawerHeader className="text-left px-4 pt-3 pb-2">
          <DrawerTitle className="text-xl font-bold tracking-tight text-foreground">
            Iniciar sesión
          </DrawerTitle>
          <DrawerDescription className="text-sm text-muted-foreground">
            ¿Aún no tenés cuenta?{" "}
            <Link
              href="/register"
              onClick={() => setOpen(false)}
              className="font-medium text-primary hover:underline"
            >
              Registrate
            </Link>
          </DrawerDescription>
        </DrawerHeader>

        {/* Formulario de Login principal */}
        <div className="px-4 pt-1 pb-2">
          <LoginForm
            redirectTo={pathname}
            onRegisterClick={() => setOpen(false)}
            inDrawer={true}
          />
        </div>

        {/* Separador visual */}
        <div className="relative mx-4 my-5 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-border/60" />
          </div>
          <span className="relative bg-popover px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">
            ¿Por qué unirte a la plataforma?
          </span>
        </div>

        {/* Bloque de beneficios / Propuesta de valor */}
        <div className="mx-4 mb-2 flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-3.5">
          <div className="flex items-start gap-3">
            <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-semibold text-foreground">Editor inteligente con IA</h4>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Escribí con asistencia de Gemini, reescribí secciones y analizá la calidad de tus borradores.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-500">
              <StickyNote className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-semibold text-foreground">Notas breves y comunidad</h4>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Publicá pensamientos cortos de hasta 500 caracteres y respondé publicaciones al instante.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <BookOpen className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-semibold text-foreground">Lecturas y seguimiento</h4>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Guardá tus artículos favoritos para leer después y seguí a tus autores preferidos.
              </p>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
