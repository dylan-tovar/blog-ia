import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Own verification route so we can decide where to redirect after validating
// the token, instead of Supabase's default `/auth/v1/verify` endpoint. Serves
// both signup confirmation (type=signup, next=/onboarding) and password
// recovery (type=recovery, next=/reset-password) — see PRD-11.1. The
// Supabase Auth email templates must be edited in the dashboard to point
// here (see docs/prds/PRD-11.1-confirmacion-y-recuperacion.md).
const VALID_TYPES: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/";

  if (!tokenHash || !type || !VALID_TYPES.includes(type as EmailOtpType)) {
    return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: type as EmailOtpType,
    token_hash: tokenHash,
  });

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
