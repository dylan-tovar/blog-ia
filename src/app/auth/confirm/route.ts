import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Own verification route so we can decide where to redirect after validating
// the token, instead of Supabase's default `/auth/v1/verify` endpoint.
// Signup and password-recovery links moved to a 6-digit code entered at
// /verify instead (see PRD-1.4): Gmail and corporate link scanners prefetch
// and consume the one-time link token before the user clicks it, breaking
// this route for both flows. Kept for any other email link (invite,
// email_change) that still relies on the click-through pattern.
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
