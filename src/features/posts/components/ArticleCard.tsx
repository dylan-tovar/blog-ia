import Link from "next/link";
import type { ArticleFeedPost } from "@/features/posts/queries";

export function ArticleCard({ post }: { post: ArticleFeedPost }) {
  return (
    <Link
      href={`/post/${post.id}`}
      className="mt-2 block rounded-xl border border-border/80 bg-card p-4 transition-colors hover:bg-muted/40"
    >
      <h2 className="text-base leading-snug font-semibold text-foreground">
        {post.title || "Sin título"}
      </h2>
      {post.excerpt && (
        <p className="mt-1.5 line-clamp-3 text-[15px] text-foreground/80">{post.excerpt}</p>
      )}
    </Link>
  );
}
