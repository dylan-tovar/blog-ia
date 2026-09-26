import { AUTHOR_EMBED } from "@/features/posts/queries";
import { excerpt } from "@/features/posts/utils";
import { createClient } from "@/lib/supabase/server";
import {
  CANDIDATE_WINDOW,
  FEED_RECOMMENDATIONS_LIMIT,
  HISTORY_LIMIT,
  RECOMMENDATIONS_LIMIT,
} from "./constants";
import { buildTagProfile, rankCandidates, withInterestTags } from "./scoreByTags";

export type RecommendedPost = {
  id: string;
  title: string | null;
  excerpt: string;
  author: { id: string; display_name: string; avatar_url: string | null } | null;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Ranked ids of unread articles by other authors. `excludeAuthorIds` is applied before the
// limit, but after the candidate window: if excluded authors wrote most of the latest
// `CANDIDATE_WINDOW` articles, the pool can come back short.
async function rankRecommendedIds(
  supabase: SupabaseClient,
  viewerId: string,
  { excludeAuthorIds = [], limit }: { excludeAuthorIds?: string[]; limit: number },
): Promise<string[]> {
  const [historyResult, candidatesResult, interestsResult] = await Promise.all([
    supabase
      .from("reading_history")
      .select("post_id, posts(author_id, post_tags(tag_id))")
      .eq("user_id", viewerId)
      .order("read_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from("posts")
      .select("id, author_id, published_at, post_tags(tag_id)")
      .eq("status", "published")
      .eq("type", "article")
      .neq("author_id", viewerId)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("id")
      .limit(CANDIDATE_WINDOW),
    supabase.from("user_interests").select("tag_id").eq("user_id", viewerId),
  ]);

  if (historyResult.error) {
    throw new Error(`No pudimos leer el historial: ${historyResult.error.message}`);
  }
  if (candidatesResult.error) {
    throw new Error(`No pudimos leer los candidatos: ${candidatesResult.error.message}`);
  }
  // Interests are an extra signal: without them the ranking falls back to history only.
  if (interestsResult.error) {
    console.error("Recommendations: could not read interests", interestsResult.error.message);
  }

  const excluded = new Set(excludeAuthorIds);
  const { readPostIds, tagIds: readTagIds } = buildTagProfile(historyResult.data ?? [], viewerId);
  const tagIds = withInterestTags(
    readTagIds,
    (interestsResult.error ? [] : (interestsResult.data ?? [])).map(({ tag_id }) => tag_id),
  );
  const ranked = rankCandidates({
    tagIds,
    readPostIds,
    candidates: (candidatesResult.data ?? []).filter(
      (candidate) => !excluded.has(candidate.author_id),
    ),
    viewerId,
    limit,
  });

  return ranked.map(({ id }) => id);
}

async function loadRecommendations(viewerId: string): Promise<RecommendedPost[]> {
  const supabase = await createClient();
  const ids = await rankRecommendedIds(supabase, viewerId, { limit: RECOMMENDATIONS_LIMIT });

  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("posts")
    .select(`id, title, content, ${AUTHOR_EMBED}`)
    .in("id", ids);

  if (error) {
    throw new Error(`No pudimos leer los recomendados: ${error.message}`);
  }

  const byId = new Map((data ?? []).map((row) => [row.id, row]));

  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row
      ? [{ id: row.id, title: row.title, excerpt: excerpt(row.content), author: row.author ?? null }]
      : [];
  });
}

export async function getRecommendedPosts(viewerId: string): Promise<RecommendedPost[]> {
  try {
    return await loadRecommendations(viewerId);
  } catch (error) {
    console.error("Recommendations failed", error);
    return [];
  }
}

// Ids for the interleaved home feed. Same ranking as the carousel, and the same contract:
// it never rejects, an error just means no recommendations.
export async function getRecommendedPostIds(
  viewerId: string,
  { excludeAuthorIds = [], limit = FEED_RECOMMENDATIONS_LIMIT }: { excludeAuthorIds?: string[]; limit?: number } = {},
): Promise<string[]> {
  try {
    const supabase = await createClient();
    return await rankRecommendedIds(supabase, viewerId, { excludeAuthorIds, limit });
  } catch (error) {
    console.error("Recommendations failed", error);
    return [];
  }
}
