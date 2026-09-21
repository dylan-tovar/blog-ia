"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, registerSchema } from "@/features/auth/schemas";
import { findEmailByUsername } from "@/features/auth/queries";
import { isEmailIdentifier, resolveAuthRedirect } from "@/features/auth/utils";

export type AuthActionState = { error?: string } | undefined;

// Reserved TLD (RFC 2606): never resolves to a real account.
const UNKNOWN_USER_EMAIL = "unknown-user@example.invalid";

export async function signUp(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const { email, password } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (error.code === "user_already_exists") {
      return { error: "Ya existe una cuenta con este email." };
    }
    return { error: "No pudimos crear tu cuenta. Intentá de nuevo." };
  }

  // The profile (display name + username) is created in /onboarding.
  redirect("/onboarding");
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
