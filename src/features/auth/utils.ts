// Usernames cannot contain "@" (see usernameSchema), so it tells the two apart.
export function isEmailIdentifier(identifier: string) {
  return identifier.includes("@");
}

export function resolveAuthRedirect(raw: unknown): string {
  if (
    typeof raw === "string" &&
    raw.startsWith("/") &&
    !raw.startsWith("//") &&
    !raw.startsWith("/login")
  ) {
    return raw;
  }
  return "/";
}
