import { Skeleton } from "@/components/ui/skeleton";
import { FeedListSkeleton } from "@/features/posts/components/PostCardSkeleton";
import { FadeOut } from "@/components/shared/page-transition";

export default function Loading() {
  return (
    <FadeOut>
      <article className="px-4 py-6">
        <Skeleton className="h-7 w-3/4" />

        <div className="mt-4 flex items-center gap-3">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </article>

      <section className="border-t">
        <FeedListSkeleton count={3} />
      </section>
    </FadeOut>
  );
}
