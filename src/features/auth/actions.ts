"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, registerSchema } from "@/features/auth/schemas";
import { findEmailByUsername } from "@/features/auth/queries";
import { isEmailIdentifier, resolveAuthRedirect } from "@/features/auth/utils";
import { isUsernameAvailable } from "@/features/profile/queries";

export type AuthActionState = { error?: string } | undefined;

// Reserved TLD (RFC 2606): never resolves to a real account.
const UNKNOWN_USER_EMAIL = "unknown-user@example.invalid";

async function createProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: { id: string; display_name: string; username: string },
) {
  const { error } = await supabase.from("profiles").insert(profile);

  if (error) {
    // Reintento único ante un fallo transitorio (ver PRD 1, sección 6).
    const retry = await supabase.from("profiles").insert(profile);

    // Si vuelve a fallar, el usuario completa su perfil manualmente en
    // /settings; no bloqueamos el registro por esto.
    return !retry.error;
  }

  return true;
}

export async function signUp(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
    username: formData.get("username"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const { email, password, displayName, username } = parsed.data;
  const supabase = await createClient();

  // Antes de crear el usuario en Auth: si falla después, quedaría una cuenta sin perfil.
  if (!(await isUsernameAvailable(username))) {
    return { error: "Ese nombre de usuario ya está en uso." };
  }

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (error.code === "user_already_exists") {
      return { error: "Ya existe una cuenta con este email." };
    }
    return { error: "No pudimos crear tu cuenta. Intentá de nuevo." };
  }

  if (data.user) {
    await createProfile(supabase, {
      id: data.user.id,
      display_name: displayName,
      username,
    });
  }

  redirect("/");
}

export async function signIn(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const { identifier, password } = parsed.data;

  let email: string | null = identifier;
  if (!isEmailIdentifier(identifier)) {
    try {
      email = await findEmailByUsername(identifier.toLowerCase());
    } catch (error) {
      console.error("Username lookup failed", error);
      return { error: "No pudimos iniciar sesión. Intentá de nuevo." };
    }
  }

  const supabase = await createClient();
  // A username that doesn't exist still goes through Auth, so the response
  // time doesn't reveal which usernames are registered.
  const { error } = await supabase.auth.signInWithPassword({
    email: email ?? UNKNOWN_USER_EMAIL,
    password,
  });

  if (error) {
    return { error: "Credenciales inválidas." };
  }

  redirect(resolveAuthRedirect(formData.get("redirectTo")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
