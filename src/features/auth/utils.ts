// Usernames cannot contain "@" (see usernameSchema), so it tells the two apart.
export function isEmailIdentifier(identifier: string) {
  return identifier.includes("@");
}

// Pages that make no sense as a post-login destination.
const AUTH_ONLY_PATHS = ["/login", "/register", "/onboarding"];

export function resolveAuthRedirect(raw: unknown): string {
  if (
    typeof raw === "string" &&
    raw.startsWith("/") &&
    !raw.startsWith("//") &&
    // Browsers treat "\" as "/", so "/\evil.com" would be protocol-relative.
    !raw.includes("\\") &&
    !AUTH_ONLY_PATHS.some((path) => raw.startsWith(path))
  ) {
    return raw;
  }
  return "/";
}
