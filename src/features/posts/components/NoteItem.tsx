import Link from "next/link";
import type { NoteFeedPost } from "@/features/posts/queries";
import { replyTarget } from "@/features/posts/utils";

interface NoteItemProps {
  post: NoteFeedPost;
  showReplyTo?: boolean;
}

export function NoteItem({ post, showReplyTo = true }: NoteItemProps) {
  const target = showReplyTo ? replyTarget(post.parent) : null;

  return (
    <div className="mt-1">
      {post.parent && target && (
        <Link
          href={`/post/${post.parent.id}`}
          className="mb-1 block truncate text-[13px] text-muted-foreground hover:underline"
        >
          En respuesta a <span className="font-medium">{target}</span>
        </Link>
      )}
      <Link href={`/post/${post.id}`} className="block">
        <p className="text-[15px] whitespace-pre-wrap text-foreground/90 [overflow-wrap:anywhere]">
          {post.content}
        </p>
      </Link>
    </div>
  );
}
