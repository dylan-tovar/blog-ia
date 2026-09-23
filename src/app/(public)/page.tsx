import { Suspense } from "react";
import { getViewer } from "@/lib/viewer";
import { getRecommendedPostIds, getRecommendedPosts } from "@/features/recommendations/queries";
import { RecommendedSection } from "@/features/recommendations/components/RecommendedSection";
import { RecommendedSkeleton } from "@/features/recommendations/components/RecommendedSkeleton";
import { FeedList } from "@/features/posts/components/FeedList";
import { NoteTriggerBar } from "@/features/posts/components/NoteTriggerBar";
import { getFeedPage, getFeedPostsByIds } from "@/features/posts/queries";
import { tagNameSchema } from "@/features/posts/schemas";
import { getAllFollowedAuthorIds } from "@/features/subscriptions/queries";

export default async function HomePage(props: PageProps<"/">) {
  // Tags are not shown anywhere in the UI, but `/?tag=x` still filters the feed.
  const { tag: rawTag } = await props.searchParams;
  const parsedTag = tagNameSchema.safeParse(rawTag);
  const tag = parsedTag.success ? parsedTag.data : undefined;

  const viewer = await getViewer();
  // Following mode: a signed-in viewer who follows someone, with no tag filter. The feed
  // query resolves the ids again on the server; this lookup only picks the mode and the
  // authors to leave out of the recommendations.
  // A failed read degrades to the global feed instead of breaking the home.
  const followedIds =
    viewer && !tag
      ? await getAllFollowedAuthorIds(viewer.id).catch((error) => {
          console.error("Followed authors lookup failed", error);
          return [];
        })
      : [];
  const scope = viewer && followedIds.length > 0 ? "following" : "global";

  const feedPromise = getFeedPage({ tag, scope });
  // Marks the rejection as handled while the other queries start; the later `await` still throws.
  feedPromise.catch(() => {});

  // Following mode interleaves recommendations into the feed. They are best effort: a
  // failure just means no recommended posts.
  const recommendedPostsPromise =
    viewer && scope === "following"
      ? getRecommendedPostIds(viewer.id, { excludeAuthorIds: followedIds })
          .then(getFeedPostsByIds)
          .catch((error) => {
            console.error("Recommendations failed", error);
            return [];
          })
      : Promise.resolve([]);
  // Global mode keeps the carousel. Started before the feed resolves so both queries
  // overlap; Suspense keeps it non-blocking.
  const carouselPromise = viewer && !tag && scope === "global" ? getRecommendedPosts(viewer.id) : null;
  const [{ posts, hasMore }, recommendedPosts] = await Promise.all([
    feedPromise,
    recommendedPostsPromise,
  ]);

  return (
    <>
      <h1 className="sr-only">Inicio</h1>

      {viewer && (
        <section aria-label="Crear nota" className="hidden px-4 md:px-0 pt-4 pb-2 md:block">
          <NoteTriggerBar viewerName={viewer.displayName} />
        </section>
      )}

      {carouselPromise && (
        <Suspense fallback={<RecommendedSkeleton />}>
          <RecommendedSection postsPromise={carouselPromise} />
        </Suspense>
      )}

      {posts.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {tag
            ? "No hay publicaciones con ese tag."
            : scope === "following"
              ? "Las personas que seguís todavía no publicaron nada."
              : "Todavía no hay publicaciones."}
        </p>
      ) : (
        <FeedList
          // The follow count is part of the key: following or unfollowing changes the feed,
          // so the "Cargar más" pages from the old set must be discarded.
          key={`${scope}:${tag ?? "all"}:${followedIds.length}`}
          tag={tag}
          scope={scope}
          viewerId={viewer?.id ?? null}
          initialPosts={posts}
          initialHasMore={hasMore}
          recommendedPosts={recommendedPosts}
        />
      )}
    </>
  );
}
