import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { formatRelativeDate } from "@/lib/format";
import { getViewer } from "@/lib/viewer";
import { MIN_WORDS_SUMMARY } from "@/features/ai/constants";
import { SummaryButton } from "@/features/ai/components/SummaryButton";
import { LikeButton } from "@/features/likes/components/LikeButton";
import { MarkdownContent } from "@/features/posts/components/MarkdownContent";
import { NoteComposer } from "@/features/posts/components/NoteComposer";
import { PostCard } from "@/features/posts/components/PostCard";
import { PostOptionsDrawer } from "@/features/posts/components/PostOptionsDrawer";
import { ReadTracker } from "@/features/posts/components/ReadTracker";
import { LoginDrawer } from "@/features/auth/components/LoginDrawer";
import { getFeedPostsByIds, getNotesForPost, getPublishedPost } from "@/features/posts/queries";
import { isFollowing } from "@/features/subscriptions/queries";

export const maxDuration = 30;

export default async function PublicPostPage(props: PageProps<"/p/[id]">) {
  const { id } = await props.params;
  const post = await getPublishedPost(id);
  const isNote = post.type === "note";
  const isReply = isNote && post.parent_post_id !== null;

  const viewer = await getViewer();
  // Under the flat-thread model every note in a thread — no matter how deep —
  // shares the same root `parent_post_id`, so fetching that root's notes once
  // already brings back the whole thread. From there the reply chain (who
  // replies to whom) is reconstructed in memory via `replyTo`.
  const [notes, following, rootPosts] = await Promise.all([
    isReply ? getNotesForPost(post.parent_post_id!) : getNotesForPost(post.id),
    viewer && post.author && viewer.id !== post.author.id
      ? isFollowing(viewer.id, post.author.id)
      : Promise.resolve(false),
    // The root itself (article or original note) so it can be shown as a
    // full card at the top of the thread — not just a text link.
    isReply ? getFeedPostsByIds([post.parent_post_id!]) : Promise.resolve([]),
  ]);
  const rootPost = rootPosts[0] ?? null;

  const notesById = new Map(notes.map((note) => [note.id, note]));

  function buildAncestorChain(startId: string | null | undefined) {
    const chain: typeof notes = [];
    const seen = new Set<string>();
    let currentId = startId ?? null;
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const note = notesById.get(currentId);
      if (!note) break; // Deleted or not (yet) loaded: the chain just stops there.
      chain.push(note);
      currentId = note.replyTo?.id ?? null;
    }
    return chain.reverse(); // Root-most ancestor first, like X's thread view.
  }

  const ancestors = isReply ? buildAncestorChain(post.replyTo?.id) : [];
  // On a reply's own page, "Respuestas" means direct replies to THIS note —
  // not the whole thread (that's `notes`, used only to resolve `ancestors`).
  const children = isReply ? notes.filter((note) => note.replyTo?.id === post.id) : notes;

  const authorName = post.author?.display_name ?? "Autor desconocido";
  const isOwn = !!viewer && viewer.id === post.author?.id;
  const canDelete = isOwn && post.type === "note";
  const canEdit = isOwn;

  return (
    <>
      {isReply && (rootPost || ancestors.length > 0) && (
        <div className="flex flex-col border-b">
          {rootPost && <PostCard post={rootPost} viewerId={viewer?.id ?? null} />}
          {ancestors.map((note) => (
            <PostCard key={note.id} post={note} viewerId={viewer?.id ?? null} showReplyTo={false} />
          ))}
        </div>
      )}
      <article className="px-4 py-6">
        {viewer && !isNote && <ReadTracker postId={post.id} />}

        {isNote ? (
          <h1 className="sr-only">Nota de {authorName}</h1>
        ) : (
          <h1 className="text-2xl leading-tight font-semibold text-foreground">
            {post.title || "Sin título"}
          </h1>
        )}

        <div className="mt-4 flex items-center gap-3">
          <UserAvatar name={authorName} size="lg" />
          <p className="min-w-0 text-sm text-muted-foreground">
            {post.author?.username ? (
              <Link
                href={`/${post.author.username}`}
                className="font-semibold text-foreground hover:underline"
              >
                {authorName}
              </Link>
            ) : (
              authorName
            )}
            <br />
            <time
              dateTime={post.published_at ?? post.created_at}
              suppressHydrationWarning
            >
              {formatRelativeDate(post.published_at ?? post.created_at)}
            </time>
          </p>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <PostOptionsDrawer
              post={{
                id: post.id,
                type: post.type,
                title: post.title,
                content: post.content,
                author: post.author,
              }}
              isOwn={isOwn}
              canDelete={canDelete}
              canEdit={canEdit}
              redirectOnDelete="/"
              viewerId={viewer?.id ?? null}
              initialFollowing={following}
            />
          </div>
        </div>

        {!isNote && post.wordCount >= MIN_WORDS_SUMMARY && (
          <SummaryButton
            postId={post.id}
            initialSummary={post.ai_generated_summary}
            viewerId={viewer?.id ?? null}
          />
        )}

        {isNote ? (
          <div className="mt-6 text-base leading-relaxed whitespace-pre-wrap text-foreground/90 [overflow-wrap:anywhere]">
            {post.content}
          </div>
        ) : (
          <MarkdownContent className="mt-6">{post.content}</MarkdownContent>
        )}

        <div className="mt-4 flex items-center gap-2">
          <LikeButton
            postId={post.id}
            initialLiked={post.viewerLiked}
            initialCount={post.likeCount}
            viewerId={viewer?.id ?? null}
          />
          <a
            href="#notes"
            aria-label={children.length === 1 ? "1 nota" : `${children.length} notas`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <MessageSquare className="size-[18px]" aria-hidden />
            <span className="tabular-nums">{children.length}</span>
          </a>
        </div>
      </article>

      <section id="notes" aria-labelledby="notes-heading" className="border-t">
        <h2 id="notes-heading" className="px-4 pt-4 text-base font-semibold text-foreground">
          {isReply ? `Respuestas (${children.length})` : `Notas (${children.length})`}
        </h2>

        <div className="px-4 py-3">
          {viewer ? (
            <NoteComposer
              parentPostId={isReply ? (post.parent_post_id ?? undefined) : post.id}
              replyToPostId={isReply ? post.id : undefined}
              placeholder={isReply ? `Responder a ${authorName}…` : "Dejá una nota sobre este post…"}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              <LoginDrawer
                trigger={
                  <button
                    type="button"
                    className="font-medium text-blue-400 hover:underline cursor-pointer"
                  >
                    Iniciá sesión
                  </button>
                }
              />{" "}
              para {isReply ? "responder" : "dejar una nota"}.
            </p>
          )}
        </div>

        {children.length === 0 ? (
          <p className="px-4 pb-6 text-sm text-muted-foreground">
            {isReply ? "Todavía no hay respuestas." : "Todavía no hay notas sobre este post."}
          </p>
        ) : (
          <div className="flex flex-col border-t">
            {children.map((note) => (
              <PostCard key={note.id} post={note} viewerId={viewer?.id ?? null} showReplyTo={false} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
