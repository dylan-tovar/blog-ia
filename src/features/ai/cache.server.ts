import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export type AiCachePatch = {
  ai_generated_titles?: Json;
  content_score?: Json;
  ai_generated_summary?: string;
};

// Compare-and-set on `updated_at`: if the author edited the post while the model was
// working, the row no longer matches and the stale result is not stored (a content
// change also nulls the cache columns through the database trigger).
export async function saveAiCache(
  postId: string,
  expectedUpdatedAt: string,
  patch: AiCachePatch,
): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("posts")
    .update(patch)
    .eq("id", postId)
    .eq("updated_at", expectedUpdatedAt)
    .select("id");

  if (error) {
    console.error("[ai] cache write failed", error.code);
    return false;
  }

  return (data?.length ?? 0) > 0;
}
