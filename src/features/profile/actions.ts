"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateProfileSchema } from "@/features/profile/schemas";

export type ProfileActionState = { error?: string; success?: boolean } | undefined;

const UNIQUE_VIOLATION = "23505";

export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, username, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return { user, profile };
}

export async function updateProfile(
  _state: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parsed = updateProfileSchema.safeParse({
    displayName: formData.get("displayName"),
    username: formData.get("username"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    display_name: parsed.data.displayName,
    username: parsed.data.username,
  });

  if (error) {
    return {
      error:
        error.code === UNIQUE_VIOLATION
          ? "Ese nombre de usuario ya está en uso."
          : "No pudimos guardar tu perfil. Intentá de nuevo.",
    };
  }

  return { success: true };
}
