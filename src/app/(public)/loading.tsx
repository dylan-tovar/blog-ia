import { FeedListSkeleton } from "@/features/posts/components/PostCardSkeleton";
import { FadeOut } from "@/components/shared/page-transition";

export default function Loading() {
  return (
    <FadeOut>
      <div className="mx-auto w-full max-w-xl">
        <FeedListSkeleton count={5} />
      </div>
    </FadeOut>
  );
}
