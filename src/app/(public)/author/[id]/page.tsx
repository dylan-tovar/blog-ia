import { notFound, permanentRedirect } from "next/navigation";
import { getPublicProfile } from "@/features/profile/queries";

// Old route, kept only as a redirect shim (see ADR/plan: bookmarks and
// already-sent emails point here forever). Can't be a next.config.ts
// `redirects()` rule like /post/:id -> /p/:id because the destination
// segment (username) isn't a mechanical rewrite of `id` — it needs a DB
// lookup. `getPublicProfile` already 404s on a bad/missing id.
export default async function AuthorRedirectPage(props: PageProps<"/author/[id]">) {
  const { id } = await props.params;
  const profile = await getPublicProfile(id);

  if (!profile.username) {
    notFound();
  }

  permanentRedirect(`/${profile.username}`);
}
