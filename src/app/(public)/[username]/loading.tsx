import { Skeleton } from "@/components/ui/skeleton";
import { FeedListSkeleton } from "@/features/posts/components/PostCardSkeleton";
import { FadeOut } from "@/components/shared/page-transition";

export default function Loading() {
  return (
    <FadeOut>
      <div className="mx-auto w-full max-w-xl">
        <section className="px-4 pt-6 pb-2">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="mt-2 h-4 w-24" />
            </div>
            <Skeleton className="size-20 shrink-0 rounded-full sm:size-24" />
          </div>

          <div className="mt-6 flex items-center gap-2.5">
            <Skeleton className="h-9 flex-1 rounded-md" />
            <Skeleton className="size-9 shrink-0 rounded-md" />
          </div>
        </section>

        <div className="mt-2 border-b border-border/60 px-4 pb-3">
          <div className="flex w-full gap-4">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-4 w-14" />
            ))}
          </div>
        </div>

        <FeedListSkeleton count={4} />
      </div>
    </FadeOut>
  );
}
