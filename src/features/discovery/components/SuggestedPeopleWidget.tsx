import Link from "next/link";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { getSuggestedPeople } from "@/features/discovery/queries";
import { FollowButton } from "@/features/subscriptions/components/FollowButton";
import { cn } from "@/lib/utils";

// Server component; best-effort like `RecommendedSection`. The pool already
// excludes people the viewer follows, so `initialFollowing` is always false.
export async function SuggestedPeopleWidget({
  viewerId,
  className,
}: {
  viewerId: string;
  className?: string;
}) {
  const people = await getSuggestedPeople(viewerId);

  if (people.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="suggested-people-heading" className={cn("flex flex-col gap-2", className)}>
      <h2 id="suggested-people-heading" className="text-sm font-semibold text-foreground">
        Gente para seguir
      </h2>
      <ul className="flex flex-col">
        {people.map((person) => (
          <li key={person.id} className="flex items-center gap-2">
            <Link
              href={`/author/${person.id}`}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1.5 transition-colors hover:bg-muted/60"
            >
              <UserAvatar name={person.displayName} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {person.displayName || "Usuario"}
                </span>
                {person.username && (
                  <span className="block truncate text-xs text-muted-foreground">
                    @{person.username}
                  </span>
                )}
              </span>
            </Link>
            <FollowButton authorId={person.id} initialFollowing={false} variant="text" />
          </li>
        ))}
      </ul>
    </section>
  );
}
