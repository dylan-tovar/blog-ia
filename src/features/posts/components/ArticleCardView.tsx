import { PostCover } from "@/features/posts/components/PostCover";
import { COVER_COLOR_STYLES } from "@/features/posts/cover/cover-palette";
import type { ResolvedCover } from "@/features/posts/cover/cover";
import { cn } from "@/lib/utils";

interface ArticleCardViewProps {
  cover: ResolvedCover;
  title: string | null;
  excerpt: string;
}

// Shared by the feed card and the publish dialog preview. A text cover turns the whole card
// into one palette-colored surface showing only the quote and the title (no excerpt);
// image and no-cover cards keep the neutral surface with the excerpt.
export function ArticleCardView({ cover, title, excerpt }: ArticleCardViewProps) {
  const isText = cover.kind === "text";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border transition-colors",
        cover.kind === "text"
          ? cn(COVER_COLOR_STYLES[cover.color].className, "border-white/10 text-white group-hover:brightness-110")
          : "border-border/80 bg-card group-hover:bg-muted/40",
      )}
    >
      <PostCover cover={cover} />
      <div className={cn("p-4", isText && "px-5 pt-0 pb-5")}>
        <h2
          className={cn(
            "text-base leading-snug font-semibold",
            isText ? "text-white" : "text-foreground",
          )}
        >
          {title || "Sin título"}
        </h2>
        {!isText && excerpt && (
          <p
            className={cn(
              "mt-1.5 text-[15px] text-foreground/80",
              cover.kind === "image" ? "line-clamp-2" : "line-clamp-3",
            )}
          >
            {excerpt}
          </p>
        )}
      </div>
    </div>
  );
}
