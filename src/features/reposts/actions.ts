"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { setRepostSchema } from "@/features/reposts/schemas";

export type SetRepostResult = { ok: boolean };

export async function setRepost(postId: string, reposted: boolean): Promise<SetRepostResult> {
  const parsed = setRepostSchema.safeParse({ postId, reposted });
  if (!parsed.success) {
    return { ok: false };
  }

  const { supabase, user } = await requireUser();

  const { error } = parsed.data.reposted
    ? await supabase
        .from("reposts")
        .upsert(
          { user_id: user.id, post_id: parsed.data.postId },
          { onConflict: "user_id,post_id", ignoreDuplicates: true },
        )
    : await supabase
        .from("reposts")
        .delete()
        .eq("user_id", user.id)
        .eq("post_id", parsed.data.postId);

  revalidatePath("/");
  revalidatePath(`/p/${parsed.data.postId}`);
  return { ok: !error };
}
