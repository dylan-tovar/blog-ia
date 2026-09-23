import { describe, expect, it } from "vitest";
import { SEARCH_QUERY_MAX_LENGTH } from "@/features/discovery/constants";
import { searchQuerySchema } from "@/features/discovery/schemas";

describe("searchQuerySchema", () => {
  it("trims the query", () => {
    expect(searchQuerySchema.parse({ q: "  Ada  " }).q).toBe("Ada");
  });

  it("rejects an empty or blank query", () => {
    expect(searchQuerySchema.safeParse({ q: "" }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: "   " }).success).toBe(false);
  });

  it("rejects a missing query", () => {
    expect(searchQuerySchema.safeParse({}).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: null }).success).toBe(false);
  });

  it("accepts a query exactly at the limit and rejects one over it", () => {
    expect(searchQuerySchema.safeParse({ q: "a".repeat(SEARCH_QUERY_MAX_LENGTH) }).success).toBe(
      true,
    );
    expect(
      searchQuerySchema.safeParse({ q: "a".repeat(SEARCH_QUERY_MAX_LENGTH + 1) }).success,
    ).toBe(false);
  });
});
