import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Cached per request: the header, the bottom nav and the page share one lookup.
export const getViewer = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    displayName: profile?.display_name ?? null,
    username: profile?.username ?? null,
    avatarUrl: profile?.avatar_url ?? null,
  };
});
