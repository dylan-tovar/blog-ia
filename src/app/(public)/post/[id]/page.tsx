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
import { getNotesForPost, getPublishedPost } from "@/features/posts/queries";
import { isFollowing } from "@/features/subscriptions/queries";
import { replyTarget } from "@/features/posts/utils";

export const maxDuration = 30;

export default async function PublicPostPage(props: PageProps<"/post/[id]">) {
  const { id } = await props.params;
  const post = await getPublishedPost(id);
  const isNote = post.type === "note";
  const isReply = isNote && post.parent_post_id !== null;

  const viewer = await getViewer();
  const [notes, following] = await Promise.all([
    isReply ? Promise.resolve([]) : getNotesForPost(post.id),
    viewer && post.author && viewer.id !== post.author.id
      ? isFollowing(viewer.id, post.author.id)
      : Promise.resolve(false),
  ]);

  const authorName = post.author?.display_name ?? "Autor desconocido";
  const replyReference = post.replyTo ?? post.parent;
  const target = replyTarget(replyReference);
  const isOwn = !!viewer && viewer.id === post.author?.id;
  const canDelete = isOwn && post.type === "note";
  const canEdit = isOwn;

  return (
    <>
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
            {post.author ? (
              <Link
                href={`/author/${post.author.id}`}
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

        {replyReference && target && (
          <Link
            href={`/post/${replyReference.id}`}
            className="mt-4 block truncate text-sm text-muted-foreground hover:underline"
          >
            En respuesta a <span className="font-medium">{target}</span>
          </Link>
        )}

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
          {!isReply && (
            <a
              href="#notes"
              aria-label={notes.length === 1 ? "1 nota" : `${notes.length} notas`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <MessageSquare className="size-[18px]" aria-hidden />
              <span className="tabular-nums">{notes.length}</span>
            </a>
          )}
        </div>
      </article>

      {isReply ? (
        // A reply's own page never lists its own sub-notes: under the flat
        // thread model, every reply already lives in the root's notes list.
        // This is just a shortcut to keep replying without navigating back.
        <section aria-labelledby="reply-heading" className="border-t">
          <h2 id="reply-heading" className="px-4 pt-4 text-base font-semibold text-foreground">
            Responder
          </h2>
          <div className="px-4 py-3">
            {viewer ? (
              <NoteComposer
                parentPostId={post.parent_post_id ?? undefined}
                replyToPostId={post.id}
                placeholder={`Responder a ${authorName}…`}
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
                para responder.
              </p>
            )}
          </div>
        </section>
      ) : (
        <section id="notes" aria-labelledby="notes-heading" className="border-t">
          <h2 id="notes-heading" className="px-4 pt-4 text-base font-semibold text-foreground">
            Notas ({notes.length})
          </h2>

          <div className="px-4 py-3">
            {viewer ? (
              <NoteComposer parentPostId={post.id} placeholder="Dejá una nota sobre este post…" />
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
                para dejar una nota.
              </p>
            )}
          </div>

          {notes.length === 0 ? (
            <p className="px-4 pb-6 text-sm text-muted-foreground">
              Todavía no hay notas sobre este post.
            </p>
          ) : (
            <div className="flex flex-col border-t">
              {notes.map((note) => (
                <PostCard
                  key={note.id}
                  post={note}
                  viewerId={viewer?.id ?? null}
                  showReplyTo={false}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
