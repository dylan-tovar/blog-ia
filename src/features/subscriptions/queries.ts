import { createClient } from "@/lib/supabase/server";

export async function isFollowing(followerId: string, authorId: string) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("follower_id", followerId)
    .eq("author_id", authorId);

  if (error) {
    throw new Error(`No pudimos leer el seguimiento: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

export async function getFollowedAuthorIds(followerId: string, authorIds: string[]) {
  if (authorIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("author_id")
    .eq("follower_id", followerId)
    .in("author_id", authorIds);

  if (error) {
    throw new Error(`No pudimos leer los seguimientos: ${error.message}`);
  }

  return (data ?? []).map((row) => row.author_id);
}

export async function getAllFollowedAuthorIds(followerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("author_id")
    .eq("follower_id", followerId);

  if (error) {
    throw new Error(`No pudimos leer los seguimientos: ${error.message}`);
  }

  return (data ?? []).map((row) => row.author_id);
}

export async function getFollowerCount(authorId: string) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("author_id", authorId);

  if (error) {
    throw new Error(`No pudimos contar los seguidores: ${error.message}`);
  }

  return count ?? 0;
}
