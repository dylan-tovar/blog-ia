import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

// Reads auth.users through follower_emails_for_author (SECURITY DEFINER,
// service_role only) — see supabase/migrations/0012_email_preferences.sql.
// Already filters out followers with notify_new_article_email = false.
export async function getFollowerEmails(authorId: string) {
  const { data, error } = await createAdminClient().rpc("follower_emails_for_author", {
    p_author_id: authorId,
  });

  if (error) {
    throw new Error(`No pudimos leer los emails de los seguidores: ${error.message}`);
  }

  return (data ?? []).filter((row): row is typeof row & { email: string } => row.email !== null);
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
