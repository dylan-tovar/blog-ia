"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { LoginDrawer } from "@/features/auth/components/LoginDrawer";
import { cn } from "@/lib/utils";
import { setLike } from "@/features/likes/actions";

interface LikeButtonProps {
  postId: string;
  initialLiked: boolean;
  initialCount: number;
  // Signed-in user id, or null/undefined for visitors (they get a login link).
  viewerId?: string | null;
}

const BASE_CLASS =
  "-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors";

export function LikeButton({ postId, initialLiked, initialCount, viewerId }: LikeButtonProps) {
  // Paginated lists keep server data in client state and never re-send props, so the
  // confirmed value lives here; it resyncs whenever the server sends new props.
  const [confirmed, setConfirmed] = useState({ liked: initialLiked, count: initialCount });
  const [seen, setSeen] = useState({ liked: initialLiked, count: initialCount });
  if (seen.liked !== initialLiked || seen.count !== initialCount) {
    setSeen({ liked: initialLiked, count: initialCount });
    setConfirmed({ liked: initialLiked, count: initialCount });
  }
  const [state, setOptimistic] = useOptimistic(confirmed);
  const [, startTransition] = useTransition();

  if (!viewerId) {
    return (
      <LoginDrawer
        trigger={
          <button
            type="button"
            aria-label="Iniciá sesión para dar me gusta"
            className={cn(BASE_CLASS, "hover:text-foreground cursor-pointer")}
          >
            <Heart className="size-[18px]" aria-hidden />
            <span className="tabular-nums">{confirmed.count}</span>
          </button>
        }
      />
    );
  }

  function handleClick() {
    const next = {
      liked: !state.liked,
      count: Math.max(0, state.count + (state.liked ? -1 : 1)),
    };

    startTransition(async () => {
      setOptimistic(next);
      const result = await setLike(postId, next.liked);
      if (result.ok) {
        setConfirmed(next);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={state.liked}
      aria-label={state.liked ? "Quitar me gusta" : "Me gusta"}
      className={cn(
        BASE_CLASS,
        "cursor-pointer",
        state.liked ? "text-rose-500" : "hover:text-foreground",
      )}
    >
      <Heart className={cn("size-[18px]", state.liked && "fill-current")} aria-hidden />
      <span className="tabular-nums">{state.count}</span>
    </button>
  );
}
