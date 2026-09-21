import { describe, expect, it } from "vitest";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_RULES,
  getPasswordStrength,
  isPasswordValid,
  isWithinMaxLength,
  type PasswordRuleId,
} from "@/features/auth/password-rules";

function rule(id: PasswordRuleId) {
  const found = PASSWORD_RULES.find((r) => r.id === id);
  if (!found) throw new Error(`Unknown rule ${id}`);
  return found;
}

describe("PASSWORD_RULES", () => {
  it("lists the rules in a stable order, length first", () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual([
      "length",
      "lowercase",
      "uppercase",
      "number",
      "symbol",
    ]);
  });

  it("carries the Spanish label and server message of the length rule", () => {
    expect(rule("length").label).toBe("Al menos 8 caracteres");
    expect(rule("length").message).toBe(
      "La contraseña debe tener al menos 8 caracteres.",
    );
  });

  describe("length", () => {
    it("fails at 7 characters and passes at 8", () => {
      expect(rule("length").test("1234567")).toBe(false);
      expect(rule("length").test("12345678")).toBe(true);
    });

    it("counts characters, not UTF-16 units", () => {
      expect(rule("length").test("😀".repeat(7))).toBe(false);
      expect(rule("length").test("😀".repeat(8))).toBe(true);
    });
  });

  describe("lowercase", () => {
    it("requires a lowercase letter", () => {
      expect(rule("lowercase").test("ABC123!")).toBe(false);
      expect(rule("lowercase").test("ABc123!")).toBe(true);
    });

    // Supabase's required-characters policy is ASCII-only, so accented
    // letters must not satisfy the rule or the backend would reject them.
    it("only counts ASCII lowercase letters", () => {
      expect(rule("lowercase").test("ñÁü")).toBe(false);
      expect(rule("lowercase").test("ñ")).toBe(false);
      expect(rule("lowercase").test("ña")).toBe(true);
    });
  });

  describe("uppercase", () => {
    it("requires an uppercase letter", () => {
      expect(rule("uppercase").test("abc123!")).toBe(false);
      expect(rule("uppercase").test("abC123!")).toBe(true);
    });

    it("only counts ASCII uppercase letters", () => {
      expect(rule("uppercase").test("Ñ")).toBe(false);
      expect(rule("uppercase").test("ÑA")).toBe(true);
    });
  });

  describe("number", () => {
    it("requires a digit", () => {
      expect(rule("number").test("Abcdefg!")).toBe(false);
      expect(rule("number").test("Abcdefg1")).toBe(true);
    });
  });

  describe("symbol", () => {
    it("accepts common ASCII symbols", () => {
      for (const ch of "!@#$%^&*()_+-=[]{};:'\",.<>/?\\|`~") {
        expect(rule("symbol").test(`a${ch}`), ch).toBe(true);
      }
    });

    it("accepts an underscore", () => {
      expect(rule("symbol").test("a_")).toBe(true);
    });

    it("rejects non-ASCII symbols the backend policy would not recognise", () => {
      expect(rule("symbol").test("a😀")).toBe(false);
      expect(rule("symbol").test("a€")).toBe(false);
      expect(rule("symbol").test("a¡")).toBe(false);
    });

    it("rejects letters, digits and accented letters", () => {
      expect(rule("symbol").test("Abc123")).toBe(false);
      expect(rule("symbol").test("ñÁü")).toBe(false);
    });

    it("does not count whitespace as a symbol", () => {
      expect(rule("symbol").test("abc def")).toBe(false);
      expect(rule("symbol").test(" ")).toBe(false);
      expect(rule("symbol").test("\t\n")).toBe(false);
    });

    it("does not count a combining accent as a symbol", () => {
      expect(rule("symbol").test("é")).toBe(false);
    });
  });
});

describe("PASSWORD_MAX_LENGTH", () => {
  it("is the bcrypt limit of 72 bytes", () => {
    expect(PASSWORD_MAX_LENGTH).toBe(72);
  });

  it("accepts 72 bytes and rejects 73", () => {
    expect(isWithinMaxLength("a".repeat(72))).toBe(true);
    expect(isWithinMaxLength("a".repeat(73))).toBe(false);
  });

  it("measures bytes, so multibyte input cannot exceed the limit", () => {
    // 36 x 2 bytes = 72 bytes; 37 x 2 bytes = 74 bytes.
    expect(isWithinMaxLength("ñ".repeat(36))).toBe(true);
    expect(isWithinMaxLength("ñ".repeat(37))).toBe(false);
    // 18 x 4 bytes = 72 bytes; 19 x 4 bytes = 76 bytes.
    expect(isWithinMaxLength("😀".repeat(18))).toBe(true);
    expect(isWithinMaxLength("😀".repeat(19))).toBe(false);
  });
});

describe("getPasswordStrength", () => {
  it("is empty when there is no input", () => {
    expect(getPasswordStrength("")).toEqual({ passed: 0, total: 5, level: "empty" });
  });

  it("is weak with up to 2 rules passed", () => {
    expect(getPasswordStrength("a")).toMatchObject({ passed: 1, level: "weak" });
    expect(getPasswordStrength("ab")).toMatchObject({ passed: 1, level: "weak" });
    expect(getPasswordStrength("abcdefgh")).toMatchObject({ passed: 2, level: "weak" });
  });

  it("is medium with 3 or 4 rules passed", () => {
    expect(getPasswordStrength("Abcdefgh")).toMatchObject({ passed: 3, level: "medium" });
    expect(getPasswordStrength("Abcdefg1")).toMatchObject({ passed: 4, level: "medium" });
  });

  it("is strong only when every rule passes", () => {
    expect(getPasswordStrength("Abcdef1!")).toEqual({
      passed: 5,
      total: 5,
      level: "strong",
    });
  });
});

describe("isPasswordValid", () => {
  it("requires every rule", () => {
    expect(isPasswordValid("Abcdef1!")).toBe(true);
    expect(isPasswordValid("Abcdef1")).toBe(false);
    expect(isPasswordValid("abcdef1!")).toBe(false);
    expect(isPasswordValid("ABCDEF1!")).toBe(false);
    expect(isPasswordValid("Abcdefg!")).toBe(false);
    expect(isPasswordValid("Abcdefg1")).toBe(false);
  });

  it("rejects a password over the byte limit even if every rule passes", () => {
    expect(isPasswordValid(`Ab1!${"a".repeat(68)}`)).toBe(true);
    expect(isPasswordValid(`Ab1!${"a".repeat(69)}`)).toBe(false);
  });
});
