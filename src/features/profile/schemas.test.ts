import { describe, expect, it } from "vitest";
import {
  onboardingSchema,
  updateProfileSchema,
  usernameSchema,
} from "@/features/profile/schemas";

describe("usernameSchema", () => {
  it("accepts lowercase letters, digits and underscores", () => {
    expect(usernameSchema.parse("ana_99")).toBe("ana_99");
  });

  it("trims and lowercases", () => {
    expect(usernameSchema.parse("  Ana_Dev ")).toBe("ana_dev");
  });

  it("accepts the 3 and 20 character boundaries", () => {
    expect(usernameSchema.safeParse("abc").success).toBe(true);
    expect(usernameSchema.safeParse("a".repeat(20)).success).toBe(true);
  });

  it.each([
    "ab",
    "a".repeat(21),
    "",
    "   ",
    "ana perez",
    "ana@perez",
    "ana.perez",
    "ana-perez",
    "ánä",
    "ana/../x",
    "' or 1=1 --",
  ])("rejects %j", (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(false);
  });

  it("explains the rules in Spanish", () => {
    const result = usernameSchema.safeParse("a");
    expect(result.error?.issues[0].message).toBe(
      "El usuario debe tener entre 3 y 20 caracteres: letras, números o guion bajo.",
    );
  });

  it("rejects non-strings", () => {
    expect(usernameSchema.safeParse(undefined).success).toBe(false);
    expect(usernameSchema.safeParse(42).success).toBe(false);
  });
});

describe("updateProfileSchema", () => {
  const valid = { displayName: "Ana", username: "ana_dev" };

  it("accepts a display name and username, trimming the name", () => {
    const result = updateProfileSchema.parse({ ...valid, displayName: "  Ana  " });
    expect(result).toEqual({ displayName: "Ana", username: "ana_dev" });
  });

  it("rejects a blank display name", () => {
    const result = updateProfileSchema.safeParse({ ...valid, displayName: "   " });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Ingresá un nombre para mostrar.");
  });

  it("requires a valid username", () => {
    expect(updateProfileSchema.safeParse({ displayName: "Ana" }).success).toBe(false);
    expect(
      updateProfileSchema.safeParse({ ...valid, username: "no valido" }).success,
    ).toBe(false);
  });

  it("does not let callers set other columns", () => {
    const result = updateProfileSchema.parse({
      ...valid,
      id: "00000000-0000-0000-0000-000000000000",
      avatar_url: "https://evil.example",
    });
    expect(Object.keys(result).sort()).toEqual(["displayName", "username"]);
  });
});

describe("onboardingSchema", () => {
  const valid = { displayName: "Ana", username: "ana_dev" };

  it("trims the name and normalizes the username", () => {
    const result = onboardingSchema.parse({
      displayName: "  Ana  ",
      username: " Ana_Dev ",
    });
    expect(result).toEqual({ displayName: "Ana", username: "ana_dev" });
  });

  it("rejects a blank display name", () => {
    const result = onboardingSchema.safeParse({ ...valid, displayName: "   " });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Ingresá un nombre para mostrar.");
  });

  it("requires a valid username", () => {
    expect(onboardingSchema.safeParse({ displayName: "Ana" }).success).toBe(false);
    expect(
      onboardingSchema.safeParse({ ...valid, username: "ana@example.com" }).success,
    ).toBe(false);
  });

  it("does not let callers set other columns", () => {
    const result = onboardingSchema.parse({
      ...valid,
      id: "00000000-0000-0000-0000-000000000000",
      avatar_url: "https://evil.example",
    });
    expect(Object.keys(result).sort()).toEqual(["displayName", "username"]);
  });
});
