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

export interface Subscriber {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  isFollowing: boolean;
}

export async function getSubscribers(
  authorId: string,
  viewerId?: string | null,
): Promise<Subscriber[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select(`
      created_at,
      follower:profiles!subscriptions_follower_id_fkey (
        id,
        display_name,
        username,
        avatar_url
      )
    `)
    .eq("author_id", authorId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`No pudimos leer los seguidores: ${error.message}`);
  }

  type SubscriberRow = {
    created_at: string;
    follower: {
      id: string;
      display_name: string;
      username: string;
      avatar_url: string | null;
    } | null;
  };

  const rows = (data as unknown as SubscriberRow[]) ?? [];
  const followers = rows
    .map((r) => r.follower)
    .filter((f): f is NonNullable<typeof f> => Boolean(f));

  let followedIds = new Set<string>();
  if (viewerId && followers.length > 0) {
    const followedList = await getFollowedAuthorIds(
      viewerId,
      followers.map((f) => f.id),
    );
    followedIds = new Set(followedList);
  }

  return followers.map((f) => ({
    id: f.id,
    displayName: f.display_name,
    username: f.username,
    avatarUrl: f.avatar_url,
    isFollowing: viewerId ? followedIds.has(f.id) : false,
  }));
}

export async function getSubscriptions(
  userId: string,
  viewerId?: string | null,
): Promise<Subscriber[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select(`
      created_at,
      author:profiles!subscriptions_author_id_fkey (
        id,
        display_name,
        username,
        avatar_url
      )
    `)
    .eq("follower_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`No pudimos leer las suscripciones: ${error.message}`);
  }

  type SubscriptionRow = {
    created_at: string;
    author: {
      id: string;
      display_name: string;
      username: string;
      avatar_url: string | null;
    } | null;
  };

  const rows = (data as unknown as SubscriptionRow[]) ?? [];
  const authors = rows
    .map((r) => r.author)
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  let followedIds = new Set<string>();
  if (viewerId && authors.length > 0) {
    const followedList = await getFollowedAuthorIds(
      viewerId,
      authors.map((a) => a.id),
    );
    followedIds = new Set(followedList);
  }

  return authors.map((a) => ({
    id: a.id,
    displayName: a.display_name,
    username: a.username,
    avatarUrl: a.avatar_url,
    isFollowing: viewerId ? followedIds.has(a.id) : false,
  }));
}

