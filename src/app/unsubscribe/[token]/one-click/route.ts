import { createAdminClient } from "@/lib/supabase/admin";

// RFC 8058 one-click unsubscribe target: mail clients (Gmail, Yahoo) POST
// here directly from the List-Unsubscribe header, with no user visiting any
// page. Kept out of `../page.tsx`'s segment on purpose — Next.js doesn't
// allow a route.ts and a page.tsx in the same route segment, and that page
// is the human-facing GET link that stays inside the email body. Same
// mutation as that page, just answering 200 without rendering anything.
export async function POST(_request: Request, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;

  await createAdminClient()
    .from("profiles")
    .update({ notify_new_article_email: false })
    .eq("unsubscribe_token", token);

  return new Response(null, { status: 200 });
}
