import { RECOMMENDED_ITEM_CLASS, RECOMMENDED_ROW_CLASS } from "./row-styles";

export function RecommendedSkeleton() {
  return (
    <div aria-hidden className="border-b py-4">
      <div className="mx-4 h-4 w-40 animate-pulse rounded bg-muted" />
      <div className={`mt-3 ${RECOMMENDED_ROW_CLASS}`}>
        {[0, 1, 2].map((key) => (
          <div
            key={key}
            className={`${RECOMMENDED_ITEM_CLASS} h-[9.25rem] animate-pulse rounded-xl border border-border/80 bg-card`}
          />
        ))}
      </div>
    </div>
  );
}
