import { Suspense } from "react";
import { SquarePen } from "lucide-react";
import { getViewer } from "@/lib/viewer";
import { getRecommendedPosts } from "@/features/recommendations/queries";
import { RecommendedSection } from "@/features/recommendations/components/RecommendedSection";
import { RecommendedSkeleton } from "@/features/recommendations/components/RecommendedSkeleton";
import { FeedList } from "@/features/posts/components/FeedList";
import { CreatePostMenu } from "@/features/posts/components/CreatePostMenu";
import { NoteTriggerBar } from "@/features/posts/components/NoteTriggerBar";
import { getFeedPage } from "@/features/posts/queries";
import { tagNameSchema } from "@/features/posts/schemas";

export default async function HomePage(props: PageProps<"/">) {
  // Tags are not shown anywhere in the UI, but `/?tag=x` still filters the feed.
  const { tag: rawTag } = await props.searchParams;
  const parsedTag = tagNameSchema.safeParse(rawTag);
  const tag = parsedTag.success ? parsedTag.data : undefined;

  const feedPromise = getFeedPage({ tag });
  // Marks the rejection as handled while we await the viewer; the later `await` still throws.
  feedPromise.catch(() => {});
  const viewer = await getViewer();
  // Started before the feed resolves so both queries overlap; Suspense keeps it non-blocking.
  const recommendedPromise = viewer && !tag ? getRecommendedPosts(viewer.id) : null;
  const { posts, hasMore } = await feedPromise;

  return (
    <>
      <h1 className="sr-only">Inicio</h1>

      {viewer && (
        <section aria-label="Crear" className="flex items-center gap-3 border-b px-4 py-2">
          <NoteTriggerBar viewerName={viewer.displayName} className="flex-1" />
          <CreatePostMenu
            viewerName={viewer.displayName}
            align="end"
            className="hidden min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md bg-secondary px-3 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80 md:inline-flex"
          >
            <SquarePen className="size-4" aria-hidden />
            Crear
          </CreatePostMenu>
        </section>
      )}

      {recommendedPromise && (
        <Suspense fallback={<RecommendedSkeleton />}>
          <RecommendedSection postsPromise={recommendedPromise} />
        </Suspense>
      )}

      {posts.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {tag
            ? "No hay publicaciones con ese tag."
            : "Todavía no hay publicaciones."}
        </p>
      ) : (
        <FeedList
          key={tag ?? "all"}
          tag={tag}
          viewerId={viewer?.id ?? null}
          initialPosts={posts}
          initialHasMore={hasMore}
        />
      )}
    </>
  );
}
