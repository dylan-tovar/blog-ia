export const ONBOARDING_PATH = "/onboarding";

const PROTECTED_PATHS = ["/settings", "/editor", "/posts", ONBOARDING_PATH];

export function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some((path) => pathname.startsWith(path));
}

function isOnboardingPath(pathname: string) {
  return pathname === ONBOARDING_PATH || pathname.startsWith(`${ONBOARDING_PATH}/`);
}

// "none": no profile yet (step 1). "interests": profile without onboarded_at (step 2).
// "done": fully onboarded. null: unknown (not looked up, or the lookup failed): the
// gate fails open.
export type OnboardingState = "none" | "interests" | "done" | null;

export function getOnboardingState(
  profile: { onboarded_at: string | null } | null,
): Exclude<OnboardingState, null> {
  if (!profile) {
    return "none";
  }
  return profile.onboarded_at === null ? "interests" : "done";
}

interface GateInput {
  pathname: string;
  isAuthenticated: boolean;
  onboardingState: OnboardingState;
}

// Where the proxy should send the request, or null to let it through.
export function getGateRedirect({
  pathname,
  isAuthenticated,
  onboardingState,
}: GateInput): string | null {
  if (!isAuthenticated) {
    return isProtectedPath(pathname) ? "/login" : null;
  }

  if (onboardingState === null) {
    return null;
  }

  const onOnboarding = isOnboardingPath(pathname);

  if (onboardingState !== "done" && !onOnboarding) {
    return ONBOARDING_PATH;
  }

  if (onboardingState === "done" && onOnboarding) {
    return "/";
  }

  return null;
}
