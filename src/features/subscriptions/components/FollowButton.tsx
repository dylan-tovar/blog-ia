"use client";

import { useOptimistic, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { followAuthor, unfollowAuthor } from "@/features/subscriptions/actions";

interface FollowButtonProps {
  authorId: string;
  initialFollowing: boolean;
  variant?: "button" | "text";
}

export function FollowButton({
  authorId,
  initialFollowing,
  variant = "button",
}: FollowButtonProps) {
  const [following, setFollowing] = useOptimistic(initialFollowing);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      setFollowing(!following);
      await (following ? unfollowAuthor(authorId) : followAuthor(authorId));
    });
  }

  if (variant === "text") {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        aria-label={following ? "Dejar de seguir" : "Seguir"}
        className={cn(
          "inline-flex h-auto min-h-0 items-center justify-center rounded-lg py-1 px-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
          following
            ? "text-muted-foreground hover:bg-muted/50"
            : "text-blue-500 hover:bg-blue-500/15 hover:text-blue-400",
        )}
      >
        {following ? "Siguiendo" : "Seguir"}
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
