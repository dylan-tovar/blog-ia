"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyOtpSchema,
} from "@/features/auth/schemas";
import { findEmailByUsername } from "@/features/auth/queries";
import { isEmailIdentifier, resolveAuthRedirect } from "@/features/auth/utils";

// `email` lets the register form keep what was typed: React resets uncontrolled
// forms after an action, which would otherwise wipe it on a validation error.
export type AuthActionState =
  | { error?: string; notice?: string; email?: string }
  | undefined;

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
    const typedEmail = formData.get("email");
    return {
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
      email: typeof typedEmail === "string" ? typedEmail : undefined,
    };
  }

  const { email, password } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    // Keep the typed email: React resets the form after the action returns.
    if (error.code === "user_already_exists") {
      return { error: "Ya existe una cuenta con este email.", email };
    }
    // The dashboard password policy can be stricter than ours.
    if (error.code === "weak_password") {
      return {
        error:
          "La contraseña no cumple los requisitos de seguridad. Probá con una más larga o con otros caracteres.",
        email,
      };
    }
    return { error: "No pudimos crear tu cuenta. Intentá de nuevo.", email };
  }

  // With "Confirm email" enabled in Supabase there is no session yet: send
  // the user to enter the 6-digit code we just emailed them.
  if (!data.session) {
    redirect(`/verify?email=${encodeURIComponent(email)}`);
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

// Always the same generic notice, whether or not the email is registered:
// leaking that would let anyone probe which emails have an account.
const FORGOT_PASSWORD_NOTICE =
  "Si existe una cuenta con ese email, te enviamos un correo para restablecer tu contraseña.";

export async function requestPasswordReset(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/confirm?type=recovery&next=/reset-password`,
  });

  if (error) {
    console.error("[requestPasswordReset] failed", error);
  }

  // Same message either way (see FORGOT_PASSWORD_NOTICE above).
  return { notice: FORGOT_PASSWORD_NOTICE };
}

export async function resetPassword(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { error: "No pudimos actualizar tu contraseña. Pedí un nuevo enlace e intentá de nuevo." };
  }

  redirect("/login");
}

export async function verifySignupOtp(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = verifyOtpSchema.safeParse({
    email: formData.get("email"),
    token: formData.get("token"),
  });

  if (!parsed.success) {
    const typedEmail = formData.get("email");
    return {
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
      email: typeof typedEmail === "string" ? typedEmail : undefined,
    };
  }

  const { email, token } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });

  if (error) {
    return { error: "El código es inválido o venció. Pedí uno nuevo.", email };
  }

  // The profile (display name + username) is created in /onboarding.
  redirect("/onboarding");
}

// Always the same generic notice, whether or not resend actually succeeded:
// leaking that would let anyone probe which emails have a pending signup
// (the same reasoning as FORGOT_PASSWORD_NOTICE above).
const RESEND_OTP_NOTICE = "Si el email tiene un registro pendiente, te enviamos un código nuevo.";

export async function resendSignupOtp(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const { email } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });

  if (error) {
    console.error("[resendSignupOtp] failed", error);
  }

  // Same message either way (see RESEND_OTP_NOTICE above).
  return { notice: RESEND_OTP_NOTICE, email };
}

export type ChangePasswordActionState = { error?: string; success?: boolean } | undefined;

export async function changePassword(
  _state: ChangePasswordActionState,
  formData: FormData,
): Promise<ChangePasswordActionState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmNewPassword: formData.get("confirmNewPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const { supabase, user } = await requireUser();

  if (!user.email) {
    return { error: "No pudimos verificar tu contraseña actual." };
  }

  // Reauthenticate with the current password before allowing the change:
  // an open session on a shared device shouldn't be enough on its own.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });

  if (reauthError) {
    return { error: "La contraseña actual es incorrecta." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });

  if (error) {
    return { error: "No pudimos actualizar tu contraseña. Intentá de nuevo." };
  }

  return { success: true };
}
