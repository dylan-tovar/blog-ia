import { Skeleton } from "@/components/ui/skeleton";
import { FadeOut } from "@/components/shared/page-transition";

export default function Loading() {
  return (
    <FadeOut>
      <div className="flex min-h-svh flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/95 px-3 md:px-4">
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
          <Skeleton className="ml-auto h-8 w-20 shrink-0 rounded-lg" />
        </header>

        <main className="mx-auto flex w-full min-w-0 max-w-3xl flex-1 flex-col px-4 pt-8 pb-24">
          <Skeleton className="mb-6 h-9 w-3/4" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-full" />
          </div>
        </main>
      </div>
    </FadeOut>
  );
}
