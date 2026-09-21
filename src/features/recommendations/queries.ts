import { AUTHOR_EMBED } from "@/features/posts/queries";
import { excerpt } from "@/features/posts/utils";
import { createClient } from "@/lib/supabase/server";
import { CANDIDATE_WINDOW, HISTORY_LIMIT, RECOMMENDATIONS_LIMIT } from "./constants";
import { buildTagProfile, rankCandidates } from "./scoreByTags";

export type RecommendedPost = {
  id: string;
  title: string | null;
  excerpt: string;
  author: { id: string; display_name: string } | null;
};

async function loadRecommendations(viewerId: string): Promise<RecommendedPost[]> {
  const supabase = await createClient();

  const [historyResult, candidatesResult] = await Promise.all([
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
  ]);

  if (historyResult.error) {
    throw new Error(`No pudimos leer el historial: ${historyResult.error.message}`);
  }
  if (candidatesResult.error) {
    throw new Error(`No pudimos leer los candidatos: ${candidatesResult.error.message}`);
  }

  const { readPostIds, tagIds } = buildTagProfile(historyResult.data ?? [], viewerId);
  const ranked = rankCandidates({
    tagIds,
    readPostIds,
    candidates: candidatesResult.data ?? [],
    viewerId,
    limit: RECOMMENDATIONS_LIMIT,
  });

  if (ranked.length === 0) {
    return [];
  }

  const ids = ranked.map(({ id }) => id);
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
