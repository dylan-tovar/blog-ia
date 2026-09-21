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

// Only used to preselect chips when resuming: a failure just means no preselection.
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
