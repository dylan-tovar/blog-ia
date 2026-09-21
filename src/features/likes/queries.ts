import { createClient } from "@/lib/supabase/server";

export async function getLikedPostIds(userId: string, postIds: string[]) {
  if (postIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("likes")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);

  if (error) {
    throw new Error(`No pudimos leer los me gusta: ${error.message}`);
  }

  return (data ?? []).map((row) => row.post_id);
}
