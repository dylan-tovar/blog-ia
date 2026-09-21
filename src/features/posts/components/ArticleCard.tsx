import Link from "next/link";
import { PostCover } from "@/features/posts/components/PostCover";
import type { ArticleFeedPost } from "@/features/posts/queries";

export function ArticleCard({ post }: { post: ArticleFeedPost }) {
  const hasCover = post.cover.kind !== "none";

  return (
    <Link
      href={`/post/${post.id}`}
      className="mt-2 block overflow-hidden rounded-xl border border-border/80 bg-card transition-colors hover:bg-muted/40"
    >
      <PostCover cover={post.cover} />
      <div className="p-4">
        <h2 className="text-base leading-snug font-semibold text-foreground">
          {post.title || "Sin título"}
        </h2>
        {post.excerpt && (
          <p
            className={`mt-1.5 text-[15px] text-foreground/80 ${hasCover ? "line-clamp-2" : "line-clamp-3"}`}
          >
            {post.excerpt}
          </p>
        )}
      </div>
    </Link>
  );
}
