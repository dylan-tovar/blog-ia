"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Repeat } from "lucide-react";
import { LoginDrawer } from "@/features/auth/components/LoginDrawer";
import { cn } from "@/lib/utils";
import { setRepost } from "@/features/reposts/actions";

interface RepostButtonProps {
  postId: string;
  initialReposted: boolean;
  initialCount: number;
  viewerId?: string | null;
}

const BASE_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors";

export function RepostButton({
  postId,
  initialReposted,
  initialCount,
  viewerId,
}: RepostButtonProps) {
  const [confirmed, setConfirmed] = useState({
    reposted: initialReposted,
    count: initialCount,
  });
  const [seen, setSeen] = useState({
    reposted: initialReposted,
    count: initialCount,
  });

  if (seen.reposted !== initialReposted || seen.count !== initialCount) {
    setSeen({ reposted: initialReposted, count: initialCount });
    setConfirmed({ reposted: initialReposted, count: initialCount });
  }

  const [state, setOptimistic] = useOptimistic(confirmed);
  const [, startTransition] = useTransition();

  if (!viewerId) {
    return (
      <LoginDrawer
        trigger={
          <button
            type="button"
            aria-label="Iniciá sesión para republicar"
            className={cn(BASE_CLASS, "hover:text-foreground cursor-pointer")}
          >
            <Repeat className="size-[18px]" aria-hidden />
            <span className="tabular-nums">{confirmed.count}</span>
          </button>
        }
      />
    );
  }

  function handleClick() {
    const next = {
      reposted: !state.reposted,
      count: Math.max(0, state.count + (state.reposted ? -1 : 1)),
    };

    startTransition(async () => {
      setOptimistic(next);
      const result = await setRepost(postId, next.reposted);
      if (result.ok) {
        setConfirmed(next);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={state.reposted}
      aria-label={state.reposted ? "Deshacer republicación" : "Republicar"}
      className={cn(
        BASE_CLASS,
        "cursor-pointer",
        state.reposted ? "text-emerald-500" : "hover:text-foreground",
      )}
    >
      <Repeat className="size-[18px]" aria-hidden />
      <span className="tabular-nums">{state.count}</span>
    </button>
  );
}
