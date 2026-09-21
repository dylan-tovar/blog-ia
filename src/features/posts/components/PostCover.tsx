import { COVER_COLOR_STYLES } from "@/features/posts/cover/cover-palette";
import type { ResolvedCover } from "@/features/posts/cover/cover";
import { cn } from "@/lib/utils";

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
      <div
        className={cn(
          "flex min-h-44 flex-col gap-3 p-5 text-white ring-1 ring-white/10 ring-inset sm:aspect-video sm:min-h-0",
          COVER_COLOR_STYLES[cover.color].className,
          className,
        )}
      >
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
