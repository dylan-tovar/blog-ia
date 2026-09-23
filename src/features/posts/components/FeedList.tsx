"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PostCard } from "@/features/posts/components/PostCard";
import { loadMoreFeed } from "@/features/posts/actions";
import { interleaveRecommended } from "@/features/posts/interleave";
import type { FeedPost, FeedScope } from "@/features/posts/queries";

interface FeedListProps {
  tag?: string;
  scope?: FeedScope;
  viewerId: string | null;
  initialPosts: FeedPost[];
  initialHasMore: boolean;
  // Finite pool interleaved into the feed (following scope only). It never counts toward
  // the pagination offset.
  recommendedPosts?: FeedPost[];
}

export function FeedList({
  tag,
  scope = "global",
  viewerId,
  initialPosts,
  initialHasMore,
  recommendedPosts = [],
}: FeedListProps) {
  // The first page always comes from props so a new note shows up right after
  // revalidation; only the "Cargar más" pages live in client state.
  const [more, setMore] = useState<{ posts: FeedPost[]; hasMore: boolean } | null>(null);
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const firstPageIds = new Set(initialPosts.map((post) => post.id));
  const posts = [
    ...initialPosts,
    ...(more?.posts ?? []).filter((post) => !firstPageIds.has(post.id)),
  ].filter((post) => !deletedIds.has(post.id));
  const items = interleaveRecommended(
    posts,
    recommendedPosts.filter((post) => !deletedIds.has(post.id)),
  );
  const hasMore = more ? more.hasMore : initialHasMore;

  function handleLoadMore() {
    startTransition(async () => {
      const offset = initialPosts.length + (more?.posts.length ?? 0);
      const page = await loadMoreFeed({ tag, offset, scope });
      setMore((current) => ({
        posts: [...(current?.posts ?? []), ...page.posts],
        hasMore: page.hasMore,
      }));
    });
  }

  function handleDeleted(postId: string) {
    setDeletedIds((current) => new Set(current).add(postId));
  }

  return (
    <div className="flex flex-col">
      {items.map(({ post, recommended }) => (
        <PostCard
          key={recommended ? `rec-${post.id}` : post.id}
          post={post}
          viewerId={viewerId}
          recommended={recommended}
          onDeleted={handleDeleted}
        />
      ))}
      {hasMore && (
        <div className="p-4 md:px-0">
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={handleLoadMore}
            className="min-h-11 w-full"
          >
            {isPending && <Loader2 className="animate-spin" />}
            Cargar más
          </Button>
        </div>
      )}
    </div>
  );
}
