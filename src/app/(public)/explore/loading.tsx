import { Skeleton } from "@/components/ui/skeleton";
import { FeedListSkeleton } from "@/features/posts/components/PostCardSkeleton";
import { FadeOut } from "@/components/shared/page-transition";

export default function Loading() {
  return (
    <FadeOut>
      <div className="mx-auto w-full md:max-w-4xl pt-4">
        <div className="flex min-h-8 items-center gap-2 px-4 pb-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-7 w-16 shrink-0 rounded-md" />
          ))}
        </div>

        <div className="mx-auto w-full max-w-xl">
          <FeedListSkeleton count={5} />
        </div>
      </div>
    </FadeOut>
  );
}
