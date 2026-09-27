import { Skeleton } from "@/components/ui/skeleton";

export function PostCardSkeleton() {
  return (
    <div aria-hidden className="flex flex-col border-b">
      <div className="grid grid-cols-[auto_1fr] gap-3 px-4 md:px-0 pt-3 pb-2">
        <Skeleton className="size-10 rounded-full" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="mt-2 flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="mt-3 flex items-center gap-4">
            <Skeleton className="h-5 w-10" />
            <Skeleton className="h-5 w-10" />
            <Skeleton className="h-5 w-10" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeedListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <PostCardSkeleton key={index} />
      ))}
    </>
  );
}
