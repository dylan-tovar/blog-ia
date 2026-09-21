"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { setLikeSchema } from "@/features/likes/schemas";

export type SetLikeResult = { ok: boolean };

export async function setLike(postId: string, liked: boolean): Promise<SetLikeResult> {
  const parsed = setLikeSchema.safeParse({ postId, liked });
  if (!parsed.success) {
    return { ok: false };
  }

  const { supabase, user } = await requireUser();

  const { error } = parsed.data.liked
    ? await supabase
        .from("likes")
        .upsert(
          { user_id: user.id, post_id: parsed.data.postId },
          { onConflict: "user_id,post_id", ignoreDuplicates: true },
        )
    : await supabase
        .from("likes")
        .delete()
        .eq("user_id", user.id)
        .eq("post_id", parsed.data.postId);

  revalidatePath("/");
  revalidatePath(`/post/${parsed.data.postId}`);
  return { ok: !error };
}
