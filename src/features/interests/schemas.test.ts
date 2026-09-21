import { describe, expect, it } from "vitest";
import {
  INTERESTS_MAX,
  INTERESTS_MIN,
  INTEREST_TAGS_LIMIT,
  requiredInterestCount,
} from "@/features/interests/constants";
import { interestsSchema } from "@/features/interests/schemas";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("interest constants", () => {
  it("keeps the documented limits", () => {
    expect(INTERESTS_MIN).toBe(3);
    expect(INTERESTS_MAX).toBe(20);
    expect(INTEREST_TAGS_LIMIT).toBe(30);
  });

  it("offers at least as many tags as a user may pick", () => {
    expect(INTEREST_TAGS_LIMIT).toBeGreaterThanOrEqual(INTERESTS_MAX);
  });
});

describe("requiredInterestCount", () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 3],
    [30, 3],
  ])("with %i eligible tags requires %i", (eligible, expected) => {
    expect(requiredInterestCount(eligible)).toBe(expected);
  });
});

describe("interestsSchema", () => {
  it("accepts a list of unique uuids", () => {
    const tagIds = [uuid(1), uuid(2), uuid(3)];

    expect(interestsSchema.parse({ tagIds })).toEqual({ tagIds });
  });

  it("accepts an empty list (the minimum is enforced against the eligible tags)", () => {
    expect(interestsSchema.parse({ tagIds: [] })).toEqual({ tagIds: [] });
  });

  it("accepts exactly INTERESTS_MAX tags", () => {
    const tagIds = Array.from({ length: INTERESTS_MAX }, (_, i) => uuid(i + 1));

    expect(interestsSchema.safeParse({ tagIds }).success).toBe(true);
  });

  it("rejects more than INTERESTS_MAX tags", () => {
    const tagIds = Array.from({ length: INTERESTS_MAX + 1 }, (_, i) => uuid(i + 1));

    const result = interestsSchema.safeParse({ tagIds });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      `Podés elegir hasta ${INTERESTS_MAX} temas.`,
    );
  });

  it("rejects duplicated ids", () => {
    const result = interestsSchema.safeParse({ tagIds: [uuid(1), uuid(1)] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Hay temas repetidos.");
  });

  it.each(["not-a-uuid", "", "1", "' or 1=1 --"])("rejects the id %j", (id) => {
    const result = interestsSchema.safeParse({ tagIds: [uuid(1), id] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Tema inválido.");
  });

  it("rejects a missing or non-array tagIds", () => {
    expect(interestsSchema.safeParse({}).success).toBe(false);
    expect(interestsSchema.safeParse({ tagIds: uuid(1) }).success).toBe(false);
    expect(interestsSchema.safeParse({ tagIds: null }).success).toBe(false);
  });
});
