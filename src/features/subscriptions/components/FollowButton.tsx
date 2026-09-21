"use client";

import { useOptimistic, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { followAuthor, unfollowAuthor } from "@/features/subscriptions/actions";

interface FollowButtonProps {
  authorId: string;
  initialFollowing: boolean;
  variant?: "button" | "text";
  onFollowChange?: (following: boolean) => void;
}

export function FollowButton({
  authorId,
  initialFollowing,
  variant = "button",
  onFollowChange,
}: FollowButtonProps) {
  const [following, setFollowing] = useOptimistic(initialFollowing);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const nextFollowing = !following;
      setFollowing(nextFollowing);
      onFollowChange?.(nextFollowing);
      await (following ? unfollowAuthor(authorId) : followAuthor(authorId));
    });
  }

  if (variant === "text") {
    if (following) {
      return null;
    }

    return (
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        aria-label="Seguir"
        className={cn(
          "inline-flex h-auto min-h-0 items-center justify-center rounded-lg py-1 px-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
          "text-blue-500 hover:bg-blue-500/15 hover:text-blue-400 cursor-pointer",
        )}
      >
        Seguir
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={following ? "secondary" : "default"}
      disabled={isPending}
      onClick={handleClick}
      className="min-h-11"
    >
      {following ? "Dejar de seguir" : "Seguir"}
    </Button>
  );
}
