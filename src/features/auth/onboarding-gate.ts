export const ONBOARDING_PATH = "/onboarding";

const PROTECTED_PATHS = ["/settings", "/editor", "/posts", ONBOARDING_PATH];

export function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some((path) => pathname.startsWith(path));
}

function isOnboardingPath(pathname: string) {
  return pathname === ONBOARDING_PATH || pathname.startsWith(`${ONBOARDING_PATH}/`);
}

interface GateInput {
  pathname: string;
  isAuthenticated: boolean;
  // null = unknown (not looked up, or the lookup failed): the gate fails open.
  hasProfile: boolean | null;
}

// Where the proxy should send the request, or null to let it through.
export function getGateRedirect({
  pathname,
  isAuthenticated,
  hasProfile,
}: GateInput): string | null {
  if (!isAuthenticated) {
    return isProtectedPath(pathname) ? "/login" : null;
  }

  if (hasProfile === null) {
    return null;
  }

  const onOnboarding = isOnboardingPath(pathname);

  if (!hasProfile && !onOnboarding) {
    return ONBOARDING_PATH;
  }

  if (hasProfile && onOnboarding) {
    return "/";
  }

  return null;
}
