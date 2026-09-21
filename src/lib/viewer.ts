import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Cached per request: the header, the bottom nav and the page share one lookup.
// Only `display_name` is read so the shell keeps working if optional columns
// (like `username`) are missing from an older schema.
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
    .select("display_name, username")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    displayName: profile?.display_name ?? null,
    username: profile?.username ?? null,
  };
});
