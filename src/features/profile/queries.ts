import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { idSchema } from "@/features/posts/schemas";

export async function getPublicProfile(id: string) {
  if (!idSchema.safeParse(id).success) {
    notFound();
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, username, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!profile) {
    notFound();
  }

  return profile;
}
