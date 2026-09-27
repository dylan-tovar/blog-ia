"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { FollowButton } from "@/features/subscriptions/components/FollowButton";
import type { SuggestedPerson } from "@/features/discovery/queries";
import { cn } from "@/lib/utils";

interface SuggestedPeopleCardProps {
  initialPeople: SuggestedPerson[];
  className?: string;
  variant?: "card" | "feed" | "carousel";
}

export function SuggestedPeopleCard({
  initialPeople,
  className,
  variant = "card",
}: SuggestedPeopleCardProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());

  const people = initialPeople.filter((p) => !dismissedIds.has(p.id));

  if (people.length === 0) {
    return null;
  }

  function handleDismiss(authorId: string) {
    setDismissedIds((prev) => new Set(prev).add(authorId));
  }

  if (variant === "carousel") {
    return (
      <section
        aria-labelledby="suggested-people-heading"
        className={cn("flex flex-col gap-3 border-b py-4", className)}
      >
        <div className="flex items-center justify-between px-4 md:px-0">
          <h2 id="suggested-people-heading" className="text-[15px] font-bold tracking-tight text-foreground">
            Gente para seguir
          </h2>
          <Link
            href="/explore"
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline"
          >
            Ver todos
          </Link>
        </div>

        <ul className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {people.map((person) => (
            <li
              key={person.id}
              className="relative flex w-[140px] shrink-0 snap-start flex-col items-center justify-between rounded-xl border border-border/70 bg-card p-3 text-center shadow-xs"
            >
              <button
                type="button"
                onClick={() => handleDismiss(person.id)}
                aria-label={`Descartar a ${person.displayName || "usuario"}`}
                className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer z-10"
              >
                <X className="size-3.5" aria-hidden />
              </button>

              <Link
                href={person.username ? `/${person.username}` : "#"}
                className="flex w-full flex-col items-center pt-1 transition-opacity hover:opacity-85"
              >
                <UserAvatar
                  name={person.displayName}
                  avatarUrl={person.avatarUrl}
                  className="size-14 text-base"
                />
                <span className="mt-2.5 block w-full truncate text-[13px] font-semibold text-foreground leading-tight hover:underline">
                  {person.displayName || "Usuario"}
                </span>
                {person.username ? (
                  <span className="mt-0.5 block w-full truncate text-[11px] text-muted-foreground">
                    @{person.username}
                  </span>
                ) : (
                  <span className="mt-0.5 block text-[11px] text-transparent select-none">&nbsp;</span>
                )}
              </Link>

              <div className="mt-3 w-full">
                <FollowButton
                  authorId={person.id}
                  initialFollowing={false}
                  variant="compact"
                  className="w-full h-7 text-xs rounded-lg"
                />
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const isFeed = variant === "feed";

  return (
    <section
      aria-labelledby="suggested-people-heading"
      className={cn(
        isFeed
          ? "flex flex-col gap-3 border-b py-4"
          : "flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-4 shadow-xs",
        className,
      )}
    >
      <div className={cn("flex items-center justify-between", isFeed && "px-4 md:px-0")}>
        <h2 id="suggested-people-heading" className="text-[15px] font-bold tracking-tight text-foreground">
          Gente para seguir
        </h2>
        {!isFeed && (
          <Link
            href="/explore"
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline"
          >
            Ver todos
          </Link>
        )}
      </div>

      <ul className={cn("flex flex-col gap-3", isFeed && "px-4 md:px-0")}>
        {people.map((person) => (
          <li key={person.id} className="flex items-center justify-between gap-2.5">
            <Link
              href={person.username ? `/${person.username}` : "#"}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-md transition-opacity hover:opacity-85"
            >
              <UserAvatar
                name={person.displayName}
                avatarUrl={person.avatarUrl}
                className="size-10 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground leading-tight hover:underline">
                  {person.displayName || "Usuario"}
                </span>
                {person.username && (
                  <span className="block truncate text-xs text-muted-foreground mt-0.5">
                    @{person.username}
                  </span>
                )}
              </div>
            </Link>

            <div className="flex items-center gap-1 shrink-0">
              <FollowButton authorId={person.id} initialFollowing={false} variant="text" className="bg-blue-500/15 text-blue-600 hover:bg-blue-500/20" />
              <button
                type="button"
                onClick={() => handleDismiss(person.id)}
                aria-label={`Descartar a ${person.displayName || "usuario"}`}
                className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
