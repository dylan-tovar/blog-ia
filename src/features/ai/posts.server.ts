import "server-only";
import { AiError } from "./errors";
import type { AiRouteContext } from "./route-runner.server";

// AI features for authors only ever touch the caller's own ARTICLES. A note (or someone
// else's post, or a missing id) is answered the same way, and never reaches the model.
export async function loadOwnArticleForAi(
  { supabase, user }: Pick<AiRouteContext<unknown>, "supabase" | "user">,
  postId: string,
) {
  const { data, error } = await supabase
    .from("posts")
    .select("id, content, updated_at, ai_generated_titles, content_score")
    .eq("id", postId)
    .eq("author_id", user.id)
    .eq("type", "article")
    .maybeSingle();

  if (error) {
    throw new AiError("unavailable");
  }
  if (!data) {
    throw new AiError("not_allowed");
  }

  return data;
}
