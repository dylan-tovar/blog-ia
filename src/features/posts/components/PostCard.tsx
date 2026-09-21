"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { FollowButton } from "@/features/subscriptions/components/FollowButton";
import { LikeButton } from "@/features/likes/components/LikeButton";
import { ArticleCard } from "@/features/posts/components/ArticleCard";
import { NoteItem } from "@/features/posts/components/NoteItem";
import { PostOptionsDrawer } from "@/features/posts/components/PostOptionsDrawer";
import { LoginDrawer } from "@/features/auth/components/LoginDrawer";
import type { FeedPost } from "@/features/posts/queries";
import { formatRelativeDate } from "@/lib/format";

interface PostCardProps {
  post: FeedPost;
  // Signed-in user id, or null for visitors. Undefined hides the follow control.
  viewerId?: string | null;
  showReplyTo?: boolean;
  onDeleted?: (postId: string) => void;
}

function FollowControl({
  authorId,
  viewerId,
  following,
  onFollowChange,
}: {
  authorId?: string;
  viewerId?: string | null;
  following: boolean;
  onFollowChange: (following: boolean) => void;
}) {
  if (!authorId || viewerId === undefined || viewerId === authorId || following) {
    return null;
  }

  if (viewerId === null) {
    return (
      <LoginDrawer
        trigger={
          <button
            type="button"
            className="inline-flex h-auto min-h-0 items-center rounded-lg py-1 px-2 text-sm font-semibold text-blue-400 transition-colors hover:bg-blue-400/10 hover:text-blue-300 cursor-pointer"
          >
            Seguir
          </button>
        }
      />
    );
  }

  return (
    <FollowButton
      authorId={authorId}
      initialFollowing={following}
      onFollowChange={onFollowChange}
      variant="text"
    />
  );
}

export function PostCard({ post, viewerId, showReplyTo = true, onDeleted }: PostCardProps) {
  const [following, setFollowing] = useState(post.viewerFollows);

  useEffect(() => {
    setFollowing(post.viewerFollows);
  }, [post.viewerFollows]);

  const authorName = post.author?.display_name ?? "Autor desconocido";
  const isOwn = !!viewerId && viewerId === post.author?.id;
  const canDelete = post.type === "note" && isOwn;
  const canEdit = isOwn;
  const isReply = post.type === "note" && post.parent !== null;

  return (
    <article className="grid grid-cols-[auto_1fr] gap-3 border-b px-4 py-4">
      {post.author ? (
        <Link href={`/author/${post.author.id}`} aria-label={authorName} className="h-fit">
          <UserAvatar name={authorName} size="default" />
        </Link>
      ) : (
        <UserAvatar name={authorName} size="default" />
      )}

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {post.author ? (
            <Link
              href={`/author/${post.author.id}`}
              className="min-w-0 truncate text-[15px] font-medium text-foreground hover:underline"
            >
              {authorName}
            </Link>
          ) : (
            <span className="min-w-0 truncate text-[15px] font-medium text-foreground">{authorName}</span>
          )}
          {post.publishedAt && (
            <time
              dateTime={post.publishedAt}
              suppressHydrationWarning
              className="shrink-0 text-[13px] font-light text-muted-foreground"
            >
              {formatRelativeDate(post.publishedAt)}
            </time>
          )}
          <div className="-my-2 ml-auto flex shrink-0 items-center gap-1">
            <FollowControl
              authorId={post.author?.id}
              viewerId={viewerId}
              following={following}
              onFollowChange={setFollowing}
            />
            <PostOptionsDrawer
              post={post}
              isOwn={isOwn}
              canDelete={canDelete}
              canEdit={canEdit}
              onDeleted={onDeleted}
              viewerId={viewerId}
              initialFollowing={following}
              onFollowChange={setFollowing}
            />
          </div>
        </div>

        {post.type === "article" ? (
          <ArticleCard post={post} />
        ) : (
          <NoteItem post={post} showReplyTo={showReplyTo} />
        )}

        <div className="mt-1 flex items-center gap-2">
          <LikeButton
            postId={post.id}
            initialLiked={post.viewerLiked}
            initialCount={post.likeCount}
            viewerId={viewerId}
          />
          {!isReply && (
            <Link
              href={`/post/${post.id}#notes`}
              aria-label={post.notesCount === 1 ? "1 nota" : `${post.notesCount} notas`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <MessageSquare className="size-[18px]" aria-hidden />
              <span className="tabular-nums">{post.notesCount}</span>
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
