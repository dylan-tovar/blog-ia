import Link from "next/link";
import { ArticleCardView } from "@/features/posts/components/ArticleCardView";
import type { ArticleFeedPost } from "@/features/posts/queries";

export function ArticleCard({ post }: { post: ArticleFeedPost }) {
  return (
    <Link
      href={`/p/${post.id}`}
      className="group mt-2 block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <ArticleCardView cover={post.cover} title={post.title} excerpt={post.excerpt} />
    </Link>
  );
}
