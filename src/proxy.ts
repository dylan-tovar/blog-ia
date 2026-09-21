import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getGateRedirect,
  getOnboardingState,
  type OnboardingState,
} from "@/features/auth/onboarding-gate";
import { env } from "@/lib/env";

function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Server actions are POSTs to the page URL and API routes answer with their
  // own status codes: only page navigations look for a profile.
  const isPageNavigation = request.method === "GET" && !isApiPath(pathname);

  // One indexed lookup per navigation of a signed-in user. If it fails we do
  // not know: let the request through instead of locking people out.
  let onboardingState: OnboardingState = null;
  if (user && isPageNavigation) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, onboarded_at")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Onboarding gate: profile lookup failed", error.message);
    } else {
      onboardingState = getOnboardingState(data);
    }
  }

  const target = getGateRedirect({
    pathname,
    isAuthenticated: user !== null,
    onboardingState,
  });

  if (target) {
    const redirect = NextResponse.redirect(new URL(target, request.url));
    // Keep any session cookies refreshed by getUser().
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
