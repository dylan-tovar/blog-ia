import Link from "next/link";
import { UserAvatar } from "@/components/shared/UserAvatar";
import type { RecommendedPost } from "@/features/recommendations/queries";

export function RecommendedCard({ post }: { post: RecommendedPost }) {
  return (
    <Link
      href={`/p/${post.id}`}
      className="flex h-full flex-col rounded-xl border border-border/80 bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {post.author && (
        <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <UserAvatar
            name={post.author.display_name}
            avatarUrl={post.author.avatar_url}
            size="sm"
            className="size-4 shrink-0"
          />
          {post.author.display_name}
        </span>
      )}
      <h3 className="mt-1 line-clamp-2 text-base leading-snug font-semibold text-foreground">
        {post.title || "Sin título"}
      </h3>
      {post.excerpt && (
        <p className="mt-1.5 line-clamp-2 text-sm text-foreground/80">{post.excerpt}</p>
      )}
    </Link>
  );
}
