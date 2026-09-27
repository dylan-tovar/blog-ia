import { Skeleton } from "@/components/ui/skeleton";
import { RECOMMENDED_ITEM_CLASS, RECOMMENDED_ROW_CLASS } from "./row-styles";

export function RecommendedSkeleton() {
  return (
    <div aria-hidden className="border-b py-4">
      <Skeleton className="mx-4 h-4 w-40 rounded" />
      <div className={`mt-3 ${RECOMMENDED_ROW_CLASS}`}>
        {[0, 1, 2].map((key) => (
          <Skeleton
            key={key}
            className={`${RECOMMENDED_ITEM_CLASS} h-[9.25rem] rounded-xl border border-border/80`}
          />
        ))}
      </div>
    </div>
  );
}
