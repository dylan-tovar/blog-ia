import Link from "next/link";
import type { NoteFeedPost } from "@/features/posts/queries";
import { replyTarget } from "@/features/posts/utils";

interface NoteItemProps {
  post: NoteFeedPost;
  showReplyTo?: boolean;
}

export function NoteItem({ post, showReplyTo = true }: NoteItemProps) {
  // `replyTo` (reply to another note) is always worth showing — it's the
  // whole point of this feature. `parent` alone (reply to the root post) is
  // only shown when `showReplyTo` says it's not redundant with the context
  // (e.g. hidden inside that root post's own notes section).
  const replyReference = post.replyTo ?? (showReplyTo ? post.parent : null);
  const target = replyReference ? replyTarget(replyReference) : null;

  return (
    <div className="mt-1">
      {replyReference && target && (
        <Link
          href={`/post/${replyReference.id}`}
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
