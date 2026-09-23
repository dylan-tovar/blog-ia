import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { SuggestedPeopleWidget } from "@/features/discovery/components/SuggestedPeopleWidget";
import { FeedList } from "@/features/posts/components/FeedList";
import { getAllTagNames, getFeedPage } from "@/features/posts/queries";
import { tagNameSchema } from "@/features/posts/schemas";
import { cn } from "@/lib/utils";

export default async function ExplorePage(props: PageProps<"/explore">) {
  const { tag: rawTag } = await props.searchParams;
  const parsedTag = tagNameSchema.safeParse(rawTag);
  const selectedTag = parsedTag.success ? parsedTag.data : undefined;

  const [viewer, tags, { posts, hasMore }] = await Promise.all([
    getViewer(),
    getAllTagNames(),
    getFeedPage({ tag: selectedTag }),
  ]);

  return (
    <>
      <h1 className="sr-only">Explorar</h1>

      {/* lg:+ already shows this in AppShell's RightRail sidebar — avoid rendering it
          (and its own query chain) twice on wide screens. */}
      {viewer && (
        <SuggestedPeopleWidget viewerId={viewer.id} className="border-b px-4 py-3 lg:hidden" />
      )}

      {tags.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto border-b px-4 py-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href="/explore"
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              !selectedTag
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            Todos
          </Link>
          {tags.map((tag) => (
            <Link
              key={tag}
              href={`/explore?tag=${encodeURIComponent(tag)}`}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                selectedTag === tag
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}

      {posts.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-muted-foreground">
          {selectedTag
            ? `No hay publicaciones con el tag #${selectedTag}.`
            : "Todavía no hay publicaciones para explorar."}
        </p>
      ) : (
        <FeedList
          key={selectedTag ?? "all"}
          tag={selectedTag}
          viewerId={viewer?.id ?? null}
          initialPosts={posts}
          initialHasMore={hasMore}
        />
      )}
    </>
  );
}
