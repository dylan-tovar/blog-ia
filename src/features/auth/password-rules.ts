// Single source of truth for signup password rules. Pure on purpose: used by
// the Zod schema (server) and the strength indicator (client).

export type PasswordRuleId = "length" | "lowercase" | "uppercase" | "number" | "symbol";

export type PasswordRule = {
  id: PasswordRuleId;
  /** Short requirement shown in the checklist. */
  label: string;
  /** Sentence shown when the server rejects the password. */
  message: string;
  test: (password: string) => boolean;
};

export const PASSWORD_MIN_LENGTH = 8;

// bcrypt (used by Supabase Auth) only reads the first 72 bytes, so anything
// longer would be silently truncated. The limit is in bytes, not characters.
export const PASSWORD_MAX_LENGTH = 72;

export const PASSWORD_MAX_LENGTH_MESSAGE = `La contraseña no puede superar los ${PASSWORD_MAX_LENGTH} bytes.`;

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: "length",
    label: `Al menos ${PASSWORD_MIN_LENGTH} caracteres`,
    message: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    // Spread counts code points, so an emoji is one character.
    test: (pw) => [...pw].length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "lowercase",
    label: "Una minúscula",
    message: "La contraseña debe incluir una minúscula.",
    // The character-class rules are ASCII on purpose: Supabase's required
    // characters policy only recognises ASCII, so anything else that passed
    // here would be rejected by the backend with no way to explain why.
    test: (pw) => /[a-z]/.test(pw),
  },
  {
    id: "uppercase",
    label: "Una mayúscula",
    message: "La contraseña debe incluir una mayúscula.",
    test: (pw) => /[A-Z]/.test(pw),
  },
  {
    id: "number",
    label: "Un número",
    message: "La contraseña debe incluir un número.",
    test: (pw) => /[0-9]/.test(pw),
  },
  {
    id: "symbol",
    label: "Un símbolo",
    message: "La contraseña debe incluir un símbolo.",
    // ASCII punctuation (the 32 printable non-alphanumeric characters).
    test: (pw) => /[!-/:-@[-`{-~]/.test(pw),
  },
];

export function isWithinMaxLength(password: string) {
  return new TextEncoder().encode(password).length <= PASSWORD_MAX_LENGTH;
}

export type PasswordStrengthLevel = "empty" | "weak" | "medium" | "strong";

export type PasswordStrength = {
  passed: number;
  total: number;
  level: PasswordStrengthLevel;
};

export function getPasswordStrength(password: string): PasswordStrength {
  const total = PASSWORD_RULES.length;
  const passed = PASSWORD_RULES.filter((rule) => rule.test(password)).length;

  let level: PasswordStrengthLevel;
  if (password.length === 0) level = "empty";
  else if (passed === total) level = "strong";
  else if (passed >= 3) level = "medium";
  else level = "weak";

  return { passed, total, level };
}

export function isPasswordValid(password: string) {
  return PASSWORD_RULES.every((rule) => rule.test(password)) && isWithinMaxLength(password);
}
