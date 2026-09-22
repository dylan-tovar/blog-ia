import "server-only";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { markdownToEmailHtml } from "@/lib/email/markdown";
import { newArticleEmail } from "@/lib/email/templates/new-article";
import { getFollowerEmails } from "@/features/subscriptions/queries";

// Lives in `subscriptions`, not `posts`, to avoid a posts -> subscriptions ->
// posts import cycle (this needs getFollowerEmails, which lives here).
// Called from publishPost via after() — see PRD-11.3 and ADR-0028.
export async function notifyFollowersOfNewArticle({
  authorId,
  postId,
}: {
  authorId: string;
  postId: string;
}) {
  const admin = createAdminClient();

  const [{ data: post }, { data: author }, followers] = await Promise.all([
    admin.from("posts").select("title, content").eq("id", postId).maybeSingle(),
    admin.from("profiles").select("display_name").eq("id", authorId).maybeSingle(),
    getFollowerEmails(authorId),
  ]);

  if (!post || !author || followers.length === 0) {
    return;
  }

  const bodyHtml = await markdownToEmailHtml(post.content);
  const results = await Promise.allSettled(
    followers.map((follower) =>
      sendEmail({
        to: follower.email,
        ...newArticleEmail({
          authorName: author.display_name,
          title: post.title ?? "Nuevo artículo",
          bodyHtml,
          postUrl: `${env.NEXT_PUBLIC_SITE_URL}/post/${postId}`,
          unsubscribeUrl: `${env.NEXT_PUBLIC_SITE_URL}/unsubscribe/${follower.unsubscribe_token}`,
        }),
      }),
    ),
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.error(`[new-article-email] ${failed}/${followers.length} envíos fallaron`, { postId });
  }
}
