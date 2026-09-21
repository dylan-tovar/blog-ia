"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { idSchema } from "@/features/posts/schemas";

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
  revalidatePath(`/author/${authorId}`);
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
  revalidatePath(`/author/${authorId}`);
  return { ok: !error };
}
