"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { idSchema } from "@/features/posts/schemas";
import { getUsernameById } from "@/features/profile/queries";

// Same reasoning as posts/actions.ts's revalidateAuthorProfile: the public
// profile route is /[username], and these actions only have the followed
// author's id.
async function revalidateAuthorProfile(authorId: string) {
  const username = await getUsernameById(authorId);
  if (username) {
    revalidatePath(`/${username}`);
  }
}

export type FollowResult = { ok: boolean };

export async function followAuthor(authorId: string): Promise<FollowResult> {
  if (!idSchema.safeParse(authorId).success) {
    return { ok: false };
  }

  const { supabase, user } = await requireUser();

  if (user.id === authorId) {
    return { ok: false };
  }

  const { error } = await supabase
    .from("subscriptions")
    .upsert(
      { follower_id: user.id, author_id: authorId },
      { onConflict: "follower_id,author_id", ignoreDuplicates: true },
    );

  revalidatePath("/");
  await revalidateAuthorProfile(authorId);
  return { ok: !error };
}

export async function unfollowAuthor(authorId: string): Promise<FollowResult> {
  if (!idSchema.safeParse(authorId).success) {
    return { ok: false };
  }

  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("subscriptions")
    .delete()
    .eq("follower_id", user.id)
    .eq("author_id", authorId);

  revalidatePath("/");
  await revalidateAuthorProfile(authorId);
  return { ok: !error };
}
