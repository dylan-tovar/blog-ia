import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { idSchema } from "@/features/posts/schemas";
import { usernameSchema } from "@/features/profile/schemas";

const PROFILE_COLUMNS = "id, display_name, username, created_at";

export async function getPublicProfile(id: string) {
  if (!idSchema.safeParse(id).success) {
    notFound();
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (!profile) {
    notFound();
  }

  return profile;
}

export async function getPublicProfileByUsername(username: string) {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) {
    notFound();
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("username", parsed.data)
    .maybeSingle();

  if (!profile) {
    notFound();
  }

  return profile;
}

// Para revalidatePath en acciones que solo tienen el id a mano (el autor
// dueño de la mutación, o el autor seguido/dejado de seguir) — sin username
// no hay ruta pública que invalidar, así que simplemente no revalidamos ese
// path en vez de reventar la acción.
export async function getUsernameById(id: string) {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", id)
    .maybeSingle();

  return profile?.username ?? null;
}
