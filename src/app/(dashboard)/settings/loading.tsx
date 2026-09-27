import { Skeleton } from "@/components/ui/skeleton";
import { FadeOut } from "@/components/shared/page-transition";

export default function Loading() {
  return (
    <FadeOut>
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 shrink-0 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>

        <div className="mt-8 flex flex-col gap-6">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </FadeOut>
  );
}
