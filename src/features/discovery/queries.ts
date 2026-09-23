import { cache } from "react";
import { buildTagProfile, withInterestTags } from "@/features/recommendations/scoreByTags";
import { HISTORY_LIMIT } from "@/features/recommendations/constants";
import { getAllFollowedAuthorIds } from "@/features/subscriptions/queries";
import { createClient } from "@/lib/supabase/server";
import { SEARCH_RESULTS_LIMIT, SUGGESTED_PEOPLE_LIMIT, SUGGESTED_PEOPLE_POOL } from "./constants";
import { rankAuthorsByAffinity, type AuthorCandidate } from "./scoreAuthorsByTags";

export type SuggestedPerson = {
  id: string;
  displayName: string | null;
  username: string | null;
  followerCount: number;
};

export type SearchPerson = { id: string; displayName: string | null; username: string | null };
export type SearchPost = { id: string; title: string | null };
export type SearchTag = { id: string; name: string };
export type SearchResults = { people: SearchPerson[]; posts: SearchPost[]; tags: SearchTag[] };

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Same profile the recommendations ranking builds (read history + interests), reused
// instead of forked so both rankings agree on what the viewer is into.
async function loadViewerTagProfile(supabase: SupabaseClient, viewerId: string) {
  const [historyResult, interestsResult] = await Promise.all([
    supabase
      .from("reading_history")
      .select("post_id, posts(author_id, post_tags(tag_id))")
      .eq("user_id", viewerId)
      .order("read_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase.from("user_interests").select("tag_id").eq("user_id", viewerId),
  ]);

  if (historyResult.error) {
    throw new Error(`No pudimos leer el historial: ${historyResult.error.message}`);
  }
  // Interests are an extra signal: without them the profile falls back to history only.
  if (interestsResult.error) {
    console.error("Discovery: could not read interests", interestsResult.error.message);
  }

  const { tagIds } = buildTagProfile(historyResult.data ?? [], viewerId);
  return withInterestTags(
    tagIds,
    (interestsResult.error ? [] : (interestsResult.data ?? [])).map(({ tag_id }) => tag_id),
  );
}

async function loadSuggestedPeople(viewerId: string): Promise<SuggestedPerson[]> {
  const supabase = await createClient();
  const followedIds = await getAllFollowedAuthorIds(viewerId);

  const { data: pool, error: poolError } = await supabase.rpc("popular_authors", {
    p_exclude: [viewerId, ...followedIds],
    p_limit: SUGGESTED_PEOPLE_POOL,
  });

  if (poolError) {
    throw new Error(`No pudimos leer autores populares: ${poolError.message}`);
  }
  if (!pool || pool.length === 0) {
    return [];
  }

  const poolIds = pool.map((row) => row.id);

  const [tagsResult, tagIds] = await Promise.all([
    supabase
      .from("posts")
      .select("author_id, post_tags(tag_id)")
      .in("author_id", poolIds)
      .eq("status", "published")
      .eq("type", "article"),
    loadViewerTagProfile(supabase, viewerId),
  ]);

  if (tagsResult.error) {
    throw new Error(`No pudimos leer los tags de los autores: ${tagsResult.error.message}`);
  }

  const tagsByAuthor = new Map<string, Set<string>>();
  for (const row of tagsResult.data ?? []) {
    const tagSet = tagsByAuthor.get(row.author_id) ?? new Set<string>();
    for (const { tag_id } of row.post_tags ?? []) {
      tagSet.add(tag_id);
    }
    tagsByAuthor.set(row.author_id, tagSet);
  }

  const candidates: AuthorCandidate[] = pool.map((row) => ({
    author_id: row.id,
    follower_count: row.follower_count,
    tag_ids: [...(tagsByAuthor.get(row.id) ?? [])],
  }));

  const ranked = rankAuthorsByAffinity({ tagIds, candidates, limit: SUGGESTED_PEOPLE_LIMIT });
  if (ranked.length === 0) {
    return [];
  }

  const followerCountById = new Map(pool.map((row) => [row.id, row.follower_count]));

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name, username")
    .in(
      "id",
      ranked.map(({ author_id }) => author_id),
    );

  if (profilesError) {
    throw new Error(`No pudimos leer los perfiles sugeridos: ${profilesError.message}`);
  }

  const profileById = new Map((profiles ?? []).map((row) => [row.id, row]));

  return ranked.flatMap(({ author_id }) => {
    const profile = profileById.get(author_id);
    return profile
      ? [
          {
            id: profile.id,
            displayName: profile.display_name,
            username: profile.username,
            followerCount: followerCountById.get(author_id) ?? 0,
          },
        ]
      : [];
  });
}

// Best-effort, same contract as `getRecommendedPosts`: an error just means no suggestions.
// `cache()`-wrapped so rendering the widget twice in one request (RightRail on `lg:+`,
// `/explore`'s own mobile copy) only runs the underlying query chain once.
export const getSuggestedPeople = cache(async (viewerId: string): Promise<SuggestedPerson[]> => {
  try {
    return await loadSuggestedPeople(viewerId);
  } catch (error) {
    console.error("Discovery: could not load suggested people", error);
    return [];
  }
});

// Escapes ILIKE's own escape/wildcard characters so a literal "\", "%" or "_" in the
// query is matched literally instead of being read as ILIKE syntax. Backslash must be
// escaped first, or escaping "%"/"_" afterwards would double-escape the backslashes
// that step just introduced.
function escapeIlike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

async function searchPeople(supabase: SupabaseClient, pattern: string, viewerId?: string) {
  // Two single-column `.ilike()` calls instead of one `.or("username.ilike....,display_name.ilike....")`:
  // a hand-built `.or()` filter string only escapes ILIKE's own wildcards, not PostgREST's
  // filter-syntax metacharacters (`,` `.` `(` `)`), so a query containing those breaks out of
  // the intended expression. A plain `.ilike(column, pattern)` has no such composite-string
  // parsing to escape around, so it's safe even with those characters in `pattern`.
  let byUsername = supabase
    .from("profiles")
    .select("id, display_name, username")
    .ilike("username", pattern)
    .limit(SEARCH_RESULTS_LIMIT);
  let byDisplayName = supabase
    .from("profiles")
    .select("id, display_name, username")
    .ilike("display_name", pattern)
    .limit(SEARCH_RESULTS_LIMIT);

  if (viewerId) {
    byUsername = byUsername.neq("id", viewerId);
    byDisplayName = byDisplayName.neq("id", viewerId);
  }

  const [usernameResult, displayNameResult] = await Promise.all([byUsername, byDisplayName]);
  if (usernameResult.error) {
    throw new Error(`No pudimos buscar personas: ${usernameResult.error.message}`);
  }
  if (displayNameResult.error) {
    throw new Error(`No pudimos buscar personas: ${displayNameResult.error.message}`);
  }

  const byId = new Map<string, SearchPerson>();
  for (const row of [...(usernameResult.data ?? []), ...(displayNameResult.data ?? [])]) {
    byId.set(row.id, { id: row.id, displayName: row.display_name, username: row.username });
  }

  return [...byId.values()].slice(0, SEARCH_RESULTS_LIMIT);
}

async function searchPosts(supabase: SupabaseClient, pattern: string) {
  const { data, error } = await supabase
    .from("posts")
    .select("id, title")
    .eq("status", "published")
    .eq("type", "article")
    .ilike("title", pattern)
    .limit(SEARCH_RESULTS_LIMIT);

  if (error) {
    throw new Error(`No pudimos buscar publicaciones: ${error.message}`);
  }

  return (data ?? []).map((row) => ({ id: row.id, title: row.title }));
}

async function searchTags(supabase: SupabaseClient, pattern: string) {
  const { data, error } = await supabase
    .from("tags")
    .select("id, name")
    .ilike("name", pattern)
    .limit(SEARCH_RESULTS_LIMIT);

  if (error) {
    throw new Error(`No pudimos buscar temas: ${error.message}`);
  }

  return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
}

async function loadSearchResults(query: string, viewerId?: string): Promise<SearchResults> {
  const supabase = await createClient();
  const pattern = `%${escapeIlike(query)}%`;

  const [people, posts, tags] = await Promise.all([
    searchPeople(supabase, pattern, viewerId),
    searchPosts(supabase, pattern),
    searchTags(supabase, pattern),
  ]);

  return { people, posts, tags };
}

// Best-effort: a failed sub-query never breaks the whole search, it just comes back empty.
export async function searchAll(query: string, viewerId?: string): Promise<SearchResults> {
  try {
    return await loadSearchResults(query, viewerId);
  } catch (error) {
    console.error("Discovery: search failed", error);
    return { people: [], posts: [], tags: [] };
  }
}
