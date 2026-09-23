import { INTEREST_TAGS_LIMIT } from "@/features/interests/constants";
import { createClient } from "@/lib/supabase/server";

export type InterestOption = { id: string; name: string };

// A failed lookup is not "no tags exist": the step is mandatory, so the caller has
// to be able to tell the two apart instead of letting people skip it.
export type InterestOptionsResult =
  | { ok: true; options: InterestOption[] }
  | { ok: false };

export async function getInterestOptions(): Promise<InterestOptionsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("popular_tags", {
    p_limit: INTEREST_TAGS_LIMIT,
  });

  if (error) {
    console.error("Interests: could not load popular tags", error.message);
    return { ok: false };
  }

  return { ok: true, options: (data ?? []).map(({ id, name }) => ({ id, name })) };
}

export async function getUserInterestIds(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_interests")
    .select("tag_id")
    .eq("user_id", userId);

  if (error) {
    console.error("Interests: could not load the user's interests", error.message);
    return [];
  }

  return (data ?? []).map(({ tag_id }) => tag_id);
}

export async function getUserInterests(userId: string): Promise<InterestOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_interests")
    .select("tags(id, name)")
    .eq("user_id", userId);

  if (error) {
    console.error("Interests: could not load user interests", error.message);
    return [];
  }

  return (data ?? [])
    .map((row: any) => (Array.isArray(row.tags) ? row.tags[0] : row.tags))
    .filter((tag: any): tag is InterestOption => Boolean(tag && tag.id && tag.name));
}

export async function getAllInterestOptions(): Promise<InterestOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    console.error("Interests: could not load all interest options", error.message);
    return [];
  }

  return data ?? [];
}

