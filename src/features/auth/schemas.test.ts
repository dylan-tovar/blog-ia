import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "@/features/auth/schemas";
import { isEmailIdentifier, resolveAuthRedirect } from "@/features/auth/utils";

describe("registerSchema", () => {
  const valid = {
    email: "ana@example.com",
    password: "12345678",
    displayName: "Ana",
    username: "ana_dev",
  };

  it("accepts valid input", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Ingresá un email válido.");
  });

  it("rejects passwords shorter than 8 characters", () => {
    const result = registerSchema.safeParse({ ...valid, password: "1234567" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "La contraseña debe tener al menos 8 caracteres.",
    );
  });

  it("rejects a blank display name after trimming", () => {
    const result = registerSchema.safeParse({ ...valid, displayName: "   " });
    expect(result.success).toBe(false);
  });

  it("trims the display name", () => {
    const result = registerSchema.parse({ ...valid, displayName: "  Ana  " });
    expect(result.displayName).toBe("Ana");
  });

  it("requires a username and normalizes it", () => {
    const withoutUsername: Partial<typeof valid> = { ...valid };
    delete withoutUsername.username;
    expect(registerSchema.safeParse(withoutUsername).success).toBe(false);
    expect(registerSchema.parse({ ...valid, username: " Ana_Dev " }).username).toBe(
      "ana_dev",
    );
  });

  it("rejects a username that looks like an email", () => {
    expect(
      registerSchema.safeParse({ ...valid, username: "ana@example.com" }).success,
    ).toBe(false);
  });

  it("drops unknown fields", () => {
    const result = registerSchema.parse({ ...valid, role: "admin" });
    expect(result).not.toHaveProperty("role");
  });

  it("rejects missing fields", () => {
    expect(registerSchema.safeParse({}).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts an email as identifier", () => {
    expect(
      loginSchema.safeParse({ identifier: "ana@example.com", password: "x" }).success,
    ).toBe(true);
  });

  it("accepts a username as identifier and trims it", () => {
    const result = loginSchema.parse({ identifier: "  ana_dev ", password: "x" });
    expect(result.identifier).toBe("ana_dev");
  });

  it("rejects an empty identifier", () => {
    const result = loginSchema.safeParse({ identifier: "  ", password: "x" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Ingresá tu email o usuario.");
  });

  it("rejects an empty password", () => {
    expect(
      loginSchema.safeParse({ identifier: "ana_dev", password: "" }).success,
    ).toBe(false);
  });

  it("rejects an absurdly long identifier", () => {
    expect(
      loginSchema.safeParse({ identifier: "a".repeat(255), password: "x" }).success,
    ).toBe(false);
  });

  it("no longer reads an `email` field", () => {
    expect(
      loginSchema.safeParse({ email: "ana@example.com", password: "x" }).success,
    ).toBe(false);
  });
});

describe("isEmailIdentifier", () => {
  it("treats anything with an @ as an email", () => {
    expect(isEmailIdentifier("ana@example.com")).toBe(true);
    expect(isEmailIdentifier("not-really@")).toBe(true);
  });

  it("treats a bare handle as a username", () => {
    expect(isEmailIdentifier("ana_dev")).toBe(false);
    expect(isEmailIdentifier("")).toBe(false);
  });
});

describe("resolveAuthRedirect", () => {
  it("allows safe internal paths", () => {
    expect(resolveAuthRedirect("/explore")).toBe("/explore");
    expect(resolveAuthRedirect("/post/123")).toBe("/post/123");
    expect(resolveAuthRedirect("/")).toBe("/");
  });

  it("falls back to root for /login", () => {
    expect(resolveAuthRedirect("/login")).toBe("/");
    expect(resolveAuthRedirect("/login?from=/profile")).toBe("/");
  });

  it("falls back to root for /register and /onboarding", () => {
    expect(resolveAuthRedirect("/register")).toBe("/");
    expect(resolveAuthRedirect("/onboarding")).toBe("/");
    expect(resolveAuthRedirect("/onboarding?x=1")).toBe("/");
  });

  it("blocks paths with a backslash (browsers read it as a slash)", () => {
    expect(resolveAuthRedirect("/\\evil.com")).toBe("/");
    expect(resolveAuthRedirect("/foo\\bar")).toBe("/");
  });

  it("blocks protocol-relative open redirects", () => {
    expect(resolveAuthRedirect("//evil.com")).toBe("/");
    expect(resolveAuthRedirect("//evil.com/path")).toBe("/");
  });

  it("blocks external URLs or invalid inputs", () => {
    expect(resolveAuthRedirect("https://evil.com")).toBe("/");
    expect(resolveAuthRedirect("javascript:alert(1)")).toBe("/");
    expect(resolveAuthRedirect(null)).toBe("/");
    expect(resolveAuthRedirect(undefined)).toBe("/");
    expect(resolveAuthRedirect(123)).toBe("/");
  });
});
