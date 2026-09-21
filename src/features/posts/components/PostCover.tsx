import type { ResolvedCover } from "@/features/posts/cover/cover";
import { cn } from "@/lib/utils";

// A text cover has no background of its own: the card surface (ArticleCardView) paints the
// palette color so the tile and the title share one continuous surface.
export function PostCover({ cover, className }: { cover: ResolvedCover; className?: string }) {
  if (cover.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- already compressed to WebP <= 1600px at upload; skips the host's image optimizer quota
      <img
        src={cover.url}
        alt=""
        width={cover.width ?? undefined}
        height={cover.height ?? undefined}
        loading="lazy"
        decoding="async"
        className={cn("aspect-video w-full bg-muted object-cover", className)}
      />
    );
  }

  if (cover.kind === "text") {
    return (
      <div className={cn("flex min-h-44 flex-col gap-3 p-5 sm:aspect-video sm:min-h-0", className)}>
        <span aria-hidden className="font-serif text-4xl leading-none">
          &ldquo;
        </span>
        <p className="line-clamp-5 font-serif text-lg leading-snug text-balance break-words sm:text-xl">
          {cover.text}
        </p>
      </div>
    );
  }

  return null;
}
