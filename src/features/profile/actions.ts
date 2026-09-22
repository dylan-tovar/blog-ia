"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { welcomeEmail } from "@/lib/email/templates/welcome";
import {
  onboardingSchema,
  updateProfileSchema,
} from "@/features/profile/schemas";

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
    .select("id, display_name, username, avatar_url, onboarded_at")
    .eq("id", user.id)
    .maybeSingle();

  return { user, profile };
}

export async function completeOnboarding(
  _state: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parsed = onboardingSchema.safeParse({
    displayName: formData.get("displayName"),
    username: formData.get("username"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const { supabase, user } = await requireUser();

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  // Never overwrite an existing profile from here (that is /settings' job). The
  // onboarding page decides which step comes next.
  if (existing) {
    redirect("/onboarding");
  }

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    display_name: parsed.data.displayName,
    username: parsed.data.username,
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      // A double submit collides on the primary key. Re-query instead of
      // guessing which constraint fired: if the profile exists it was a double
      // submit, otherwise the username is taken.
      const { data: created } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (created) {
        redirect("/onboarding");
      }
      return { error: "Ese nombre de usuario ya está en uso." };
    }
    return { error: "No pudimos guardar tu perfil. Intentá de nuevo." };
  }

  // Fresh profile only (not the 23505 double-submit path above): send once.
  // Best-effort — sendEmail never throws, so this can't break onboarding.
  if (user.email) {
    void sendEmail({
      to: user.email,
      ...welcomeEmail({ displayName: parsed.data.displayName }),
    });
  }

  redirect("/onboarding");
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
