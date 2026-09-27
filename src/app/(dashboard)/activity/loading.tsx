import { Skeleton } from "@/components/ui/skeleton";
import { FadeOut } from "@/components/shared/page-transition";

export default function Loading() {
  return (
    <FadeOut>
      <div className="mx-auto w-full max-w-xl">
        <div className="hidden md:flex items-center justify-between border-b px-4 py-5">
          <Skeleton className="h-6 w-28" />
        </div>

        <div className="flex flex-col">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-center gap-3 border-b px-4 py-4">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </FadeOut>
  );
}
