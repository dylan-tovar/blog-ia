import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { SearchModal } from "@/features/discovery/components/SearchModal";
import { SuggestedPeopleWidget } from "@/features/discovery/components/SuggestedPeopleWidget";
import { FeedList } from "@/features/posts/components/FeedList";
import { getAllTagNames, getFeedPage } from "@/features/posts/queries";
import { tagNameSchema } from "@/features/posts/schemas";
import { cn } from "@/lib/utils";

function formatTagLabel(tag: string): string {
  const lower = tag.toLowerCase();
  if (lower === "ia") return "IA";
  if (lower === "nextjs") return "Next.js";
  if (lower === "diseno") return "Diseño";
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

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
    <div className="mx-auto w-full md:max-w-4xl pt-4">
      <h1 className="sr-only">Explorar</h1>

      {/* Tabs bar: takes wider horizontal space on desktop */}
      {tags.length > 0 && (
        <div className="flex min-h-8 items-center gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href="/explore"
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
              !selectedTag
                ? "bg-foreground text-background font-semibold shadow-xs"
                : "bg-neutral-800/80 text-muted-foreground hover:bg-neutral-700 hover:text-foreground",
            )}
          >
            Explorar
          </Link>
          {tags.map((tag) => {
            const isActive = selectedTag === tag;
            return (
              <Link
                key={tag}
                href={`/explore?tag=${encodeURIComponent(tag)}`}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-foreground text-background font-semibold shadow-xs"
                    : "bg-neutral-800/80 text-muted-foreground hover:bg-neutral-700 hover:text-foreground",
                )}
              >
                {formatTagLabel(tag)}
              </Link>
            );
          })}
        </div>
      )}

      {/* Mobile search bar: only shown on phone */}
      <div className={cn("px-4 pb-3 pt-1 md:hidden", tags.length === 0 && "pt-3")}>
        <SearchModal variant="bar" />
      </div>

      {/* Posts & Widgets container: exact same width as home feed (max-w-xl) */}
      <div className="mx-auto w-full max-w-xl">
        {/* lg:+ already shows this in AppShell's RightRail sidebar — avoid rendering it
            (and its own query chain) twice on wide screens. */}
        {viewer && (
          <SuggestedPeopleWidget viewerId={viewer.id} variant="carousel" className="lg:hidden" />
        )}

        {posts.length === 0 ? (
          <p className="px-4 py-16 text-center text-sm text-muted-foreground">
            {selectedTag
              ? `No hay publicaciones con el tag ${formatTagLabel(selectedTag)}.`
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
      </div>
    </div>
  );
}
