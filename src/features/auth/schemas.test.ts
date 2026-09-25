import { describe, expect, it } from "vitest";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyOtpSchema,
} from "@/features/auth/schemas";
import { isEmailIdentifier, resolveAuthRedirect } from "@/features/auth/utils";

describe("registerSchema", () => {
  const valid = {
    email: "ana@example.com",
    password: "Abcdef1!",
    confirmPassword: "Abcdef1!",
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
    const result = registerSchema.safeParse({
      ...valid,
      password: "Abcde1!",
      confirmPassword: "Abcde1!",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "La contraseña debe tener al menos 8 caracteres.",
    );
  });

  it("rejects mismatched passwords, reporting it on confirmPassword", () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: "Abcdef1?" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Las contraseñas no coinciden.");
    expect(result.error?.issues[0].path).toEqual(["confirmPassword"]);
  });

  it("rejects a missing confirmation", () => {
    const withoutConfirm: Partial<typeof valid> = { ...valid };
    delete withoutConfirm.confirmPassword;
    expect(registerSchema.safeParse(withoutConfirm).success).toBe(false);
  });

  it("no longer reads profile fields", () => {
    const result = registerSchema.parse({
      ...valid,
      displayName: "Ana",
      username: "ana_dev",
    });
    expect(Object.keys(result).sort()).toEqual(["confirmPassword", "email", "password"]);
  });

  it("rejects missing fields", () => {
    expect(registerSchema.safeParse({}).success).toBe(false);
  });

  describe("password strength", () => {
    function firstMessage(password: string) {
      const result = registerSchema.safeParse({
        ...valid,
        password,
        confirmPassword: password,
      });
      expect(result.success).toBe(false);
      return result.error?.issues[0].message;
    }

    it("rejects a password without a lowercase letter", () => {
      expect(firstMessage("ABCDEF1!")).toBe("La contraseña debe incluir una minúscula.");
    });

    it("rejects a password without an uppercase letter", () => {
      expect(firstMessage("abcdef1!")).toBe("La contraseña debe incluir una mayúscula.");
    });

    it("rejects a password without a number", () => {
      expect(firstMessage("Abcdefg!")).toBe("La contraseña debe incluir un número.");
    });

    it("rejects a password without a symbol", () => {
      expect(firstMessage("Abcdefg1")).toBe("La contraseña debe incluir un símbolo.");
    });

    it("reports one issue per failed rule, length first", () => {
      const result = registerSchema.safeParse({
        ...valid,
        password: "abc",
        confirmPassword: "abc",
      });
      expect(result.error?.issues.map((i) => i.message)).toEqual([
        "La contraseña debe tener al menos 8 caracteres.",
        "La contraseña debe incluir una mayúscula.",
        "La contraseña debe incluir un número.",
        "La contraseña debe incluir un símbolo.",
      ]);
      expect(result.error?.issues.every((i) => i.path[0] === "password")).toBe(true);
    });

    it("rejects passwords over 72 bytes", () => {
      const tooLong = `Ab1!${"a".repeat(69)}`;
      expect(firstMessage(tooLong)).toBe(
        "La contraseña no puede superar los 72 bytes.",
      );
    });

    it("counts bytes, not characters, for the maximum", () => {
      // 4 ASCII + 35 x 2 bytes = 74 bytes in only 39 characters.
      expect(firstMessage(`Ab1!${"ñ".repeat(35)}`)).toBe(
        "La contraseña no puede superar los 72 bytes.",
      );
    });

    it("accepts a password of exactly 72 bytes", () => {
      const password = `Ab1!${"a".repeat(68)}`;
      expect(
        registerSchema.safeParse({ ...valid, password, confirmPassword: password })
          .success,
      ).toBe(true);
    });

    it("still reports a mismatch once the password is valid", () => {
      const result = registerSchema.safeParse({ ...valid, confirmPassword: "Abcdef1?" });
      expect(result.error?.issues[0].message).toBe("Las contraseñas no coinciden.");
    });
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

  it("does not enforce the register password rules, so old accounts can sign in", () => {
    expect(
      loginSchema.safeParse({ identifier: "ana_dev", password: "abc" }).success,
    ).toBe(true);
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

describe("forgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "ana@example.com" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = forgotPasswordSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Ingresá un email válido.");
  });
});

describe("resetPasswordSchema", () => {
  const valid = { password: "Abcdef1!", confirmPassword: "Abcdef1!" };

  it("accepts a valid, matching password", () => {
    expect(resetPasswordSchema.safeParse(valid).success).toBe(true);
  });

  it("enforces the same password rules as registerSchema", () => {
    const result = resetPasswordSchema.safeParse({ password: "abc", confirmPassword: "abc" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "La contraseña debe tener al menos 8 caracteres.",
    );
  });

  it("rejects mismatched passwords, reporting it on confirmPassword", () => {
    const result = resetPasswordSchema.safeParse({ ...valid, confirmPassword: "Abcdef1?" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Las contraseñas no coinciden.");
    expect(result.error?.issues[0].path).toEqual(["confirmPassword"]);
  });
});

describe("verifyOtpSchema", () => {
  it("accepts a valid email and 6-digit code", () => {
    expect(
      verifyOtpSchema.safeParse({ email: "ana@example.com", token: "123456" }).success,
    ).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = verifyOtpSchema.safeParse({ email: "not-an-email", token: "123456" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Ingresá un email válido.");
  });

  it("rejects a code that isn't 6 digits", () => {
    const result = verifyOtpSchema.safeParse({ email: "ana@example.com", token: "12345" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Ingresá el código de 6 dígitos.");
  });

  it("rejects a non-numeric code", () => {
    const result = verifyOtpSchema.safeParse({ email: "ana@example.com", token: "abcdef" });
    expect(result.success).toBe(false);
  });

  it("trims surrounding whitespace", () => {
    const result = verifyOtpSchema.parse({ email: "ana@example.com", token: " 123456 " });
    expect(result.token).toBe("123456");
  });
});

describe("changePasswordSchema", () => {
  const valid = {
    currentPassword: "Old12345!",
    newPassword: "Abcdef1!",
    confirmNewPassword: "Abcdef1!",
  };

  it("accepts valid input", () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty current password", () => {
    const result = changePasswordSchema.safeParse({ ...valid, currentPassword: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Ingresá tu contraseña actual.");
  });

  it("enforces the same password rules as registerSchema for the new password", () => {
    const result = changePasswordSchema.safeParse({
      ...valid,
      newPassword: "abc",
      confirmNewPassword: "abc",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "La contraseña debe tener al menos 8 caracteres.",
    );
  });

  it("rejects mismatched new passwords, reporting it on confirmNewPassword", () => {
    const result = changePasswordSchema.safeParse({ ...valid, confirmNewPassword: "Abcdef1?" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Las contraseñas no coinciden.");
    expect(result.error?.issues[0].path).toEqual(["confirmNewPassword"]);
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
    expect(resolveAuthRedirect("/p/123")).toBe("/p/123");
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

  it("blocks control characters that URL parsing strips (\"/\\t/evil.com\")", () => {
    expect(resolveAuthRedirect("/\t/evil.com")).toBe("/");
    expect(resolveAuthRedirect("/\n/evil.com")).toBe("/");
    expect(resolveAuthRedirect("/\r/evil.com")).toBe("/");
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
