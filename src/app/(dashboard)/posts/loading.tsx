import { Skeleton } from "@/components/ui/skeleton";
import { FadeOut } from "@/components/shared/page-transition";

export default function Loading() {
  return (
    <FadeOut>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-6">
          <div>
            <Skeleton className="h-7 w-40" />
            <Skeleton className="mt-2 h-4 w-52" />
          </div>
          <Skeleton className="h-10 w-36 shrink-0 rounded-xl" />
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/50 p-4 sm:p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="size-8 rounded-lg" />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="mt-2 h-4 w-full" />
                </div>
                <Skeleton className="size-16 shrink-0 rounded-xl sm:size-20" />
              </div>
              <div className="mt-1 flex items-center gap-2 pt-2 border-t border-border/40">
                <Skeleton className="h-7 w-16 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </FadeOut>
  );
}
