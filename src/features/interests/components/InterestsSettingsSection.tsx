"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { Check, Plus, Search, Tag, X } from "lucide-react";
import { updateInterests } from "@/features/interests/actions";
import type { InterestOption } from "@/features/interests/queries";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface InterestsSettingsSectionProps {
  initialInterests: InterestOption[];
  availableOptions: InterestOption[];
}

export function InterestsSettingsSection({
  initialInterests,
  availableOptions,
}: InterestsSettingsSectionProps) {
  const isDesktop = useIsDesktop();
  const [selectedInterests, setSelectedInterests] = useState<InterestOption[]>(initialInterests);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const searchInputId = useId();

  const selectedIds = useMemo(
    () => new Set(selectedInterests.map((t) => t.id)),
    [selectedInterests],
  );

  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return availableOptions;
    return availableOptions.filter((opt) => opt.name.toLowerCase().includes(term));
  }, [availableOptions, search]);

  function handleRemove(tagId: string) {
    const previous = selectedInterests;
    const next = previous.filter((t) => t.id !== tagId);

    setSelectedInterests(next);
    setError(null);

    startTransition(async () => {
      const res = await updateInterests(next.map((t) => t.id));
      if (res?.error) {
        setSelectedInterests(previous);
        setError(res.error);
      }
    });
  }

  function handleToggle(option: InterestOption) {
    const previous = selectedInterests;
    const exists = previous.some((t) => t.id === option.id);
    const next = exists
      ? previous.filter((t) => t.id !== option.id)
      : [...previous, option];

    setSelectedInterests(next);
    setError(null);

    startTransition(async () => {
      const res = await updateInterests(next.map((t) => t.id));
      if (res?.error) {
        setSelectedInterests(previous);
        setError(res.error);
      }
    });
  }

  const dialogBody = (
    <div className="flex flex-col gap-4">
      {/* Search filter */}
      <div className="relative">
        <label htmlFor={searchInputId} className="sr-only">
          Buscar temas
        </label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={searchInputId}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar temas..."
          className="w-full rounded-xl border border-neutral-800 bg-[#161618] py-2 pl-9.5 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
        />
      </div>

      {/* Options pills */}
      <div className="max-h-72 overflow-y-auto pr-1">
        <div role="group" aria-label="Temas disponibles" className="flex flex-wrap gap-2">
          {filteredOptions.map((option) => {
            const selected = selectedIds.has(option.id);
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                disabled={isPending}
                onClick={() => handleToggle(option)}
                className={cn(
                  "group inline-flex items-center rounded-full border text-xs font-medium transition-all disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
                  selected
                    ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                    : "border-border/80 bg-neutral-850 text-foreground/90 hover:border-border hover:bg-neutral-800",
                )}
              >
                <span className="py-1.5 pl-3 pr-2">{option.name}</span>
                <span
                  className={cn(
                    "flex items-center justify-center border-l py-1.5 pl-1.5 pr-2.5 transition-colors",
                    selected
                      ? "border-primary/30 text-primary"
                      : "border-border/70 text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  {selected ? (
                    <Check aria-hidden="true" className="size-3.5 stroke-[2.5]" />
                  ) : (
                    <Plus aria-hidden="true" className="size-3.5 stroke-[2]" />
                  )}
                </span>
              </button>
            );
          })}
          {filteredOptions.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No se encontraron temas con &ldquo;{search}&rdquo;.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-neutral-800 pt-3">
        <span className="text-xs text-muted-foreground">
          {selectedInterests.length}{" "}
          {selectedInterests.length === 1 ? "tema seleccionado" : "temas seleccionados"}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg bg-neutral-800 px-4 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-neutral-700 cursor-pointer"
        >
          Listo
        </button>
      </div>
    </div>
  );

  return (
    <section className="mt-8">
      <h2 className="mb-2 px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Intereses
      </h2>

      <div className="flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-[#161618] p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-neutral-800 text-primary">
              <Tag className="size-5" />
            </div>
            <div>
              <p className="text-[15px] font-medium text-foreground">Temas de interés</p>
              <p className="text-xs text-muted-foreground">
                Personalizan los artículos y tópicos sugeridos en tu feed.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-lg bg-neutral-800 px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-neutral-700 cursor-pointer"
          >
            Gestionar
          </button>
        </div>

        {/* Selected tags chip cloud */}
        <div className="pt-1">
          {selectedInterests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no agregaste temas de interés. Hacé clic en{" "}
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="font-medium text-primary hover:underline cursor-pointer"
              >
                Gestionar
              </button>{" "}
              para comenzar.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedInterests.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700/80 bg-neutral-800/80 py-1.5 pl-3.5 pr-2 text-xs font-medium text-foreground transition-colors hover:border-neutral-600"
                >
                  <span>{t.name}</span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleRemove(t.id)}
                    aria-label={`Eliminar ${t.name} de tus intereses`}
                    className="flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-neutral-700 hover:text-foreground cursor-pointer disabled:pointer-events-none disabled:opacity-50"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      {/* Responsive Dialog (Desktop) / Drawer (Mobile) */}
      {isDesktop ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-lg bg-[#161618] border-neutral-800 text-foreground p-5">
            <DialogHeader>
              <DialogTitle>Temas de interés</DialogTitle>
              <DialogDescription>
                Elegí los temas que te interesan para personalizar tus recomendaciones.
              </DialogDescription>
            </DialogHeader>
            <div className="pt-1">{dialogBody}</div>
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
          <DrawerContent className="mx-2 mb-2 max-w-lg pb-6 pt-1 sm:mx-auto [--drawer-inset:0.5rem] data-[swipe-direction=down]:rounded-2xl data-[swipe-direction=down]:border border-border/80 shadow-2xl after:hidden">
            <DrawerHeader className="px-5 pt-3">
              <DrawerTitle>Temas de interés</DrawerTitle>
              <DrawerDescription>
                Elegí los temas que te interesan para personalizar tus recomendaciones.
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-5 py-2">{dialogBody}</div>
          </DrawerContent>
        </Drawer>
      )}
    </section>
  );
}
