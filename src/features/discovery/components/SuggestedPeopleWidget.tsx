import { getSuggestedPeople } from "@/features/discovery/queries";
import { SuggestedPeopleCard } from "./SuggestedPeopleCard";

// Server component; best-effort like `RecommendedSection`. The pool already
// excludes people the viewer follows, so `initialFollowing` is always false.
export async function SuggestedPeopleWidget({
  viewerId,
  className,
  variant,
}: {
  viewerId: string;
  className?: string;
  variant?: "card" | "feed" | "carousel";
}) {
  const people = await getSuggestedPeople(viewerId);

  if (people.length === 0) {
    return null;
  }

  return <SuggestedPeopleCard initialPeople={people} className={className} variant={variant} />;
}
