import { Suspense } from "react";
import { SearchModal } from "@/features/discovery/components/SearchModal";
import { SuggestedPeopleWidget } from "@/features/discovery/components/SuggestedPeopleWidget";
import { InterestChipsSidebar } from "@/features/interests/components/InterestChipsSidebar";
import { getInterestOptions, getUserInterestIds } from "@/features/interests/queries";
import { getViewer } from "@/lib/viewer";

async function InterestChipsSection({ viewerId }: { viewerId: string }) {
  const [eligible, selectedIds] = await Promise.all([
    getInterestOptions(),
    getUserInterestIds(viewerId),
  ]);

  if (!eligible.ok || eligible.options.length === 0) {
    return null;
  }

  return <InterestChipsSidebar options={eligible.options} initialSelectedIds={selectedIds} />;
}

// Server component; `getViewer` is memoized with `React.cache`, so this is a free
// extra call. Each viewer-gated section streams in its own <Suspense>, best-effort
// like the rest of the home page: a failed section just renders nothing.
export async function RightRail() {
  const viewer = await getViewer();

  return (
    <div className="flex flex-col gap-6">
      <SearchModal variant="bar" />

      {viewer && (
        <>
          <Suspense fallback={null}>
            <SuggestedPeopleWidget viewerId={viewer.id} />
          </Suspense>
          <Suspense fallback={null}>
            <InterestChipsSection viewerId={viewer.id} />
          </Suspense>
        </>
      )}
    </div>
  );
}
