import { describe, expect, it } from "vitest";
import { formatRelativeDate, formatShortDate, getInitials } from "@/lib/format";

describe("getInitials", () => {
  it("takes the first letter of the first two words, uppercased", () => {
    expect(getInitials("Ana Pérez")).toBe("AP");
    expect(getInitials("ana maria lopez")).toBe("AM");
  });

  it("uses a single letter for a single word", () => {
    expect(getInitials("ana")).toBe("A");
  });

  it("ignores extra whitespace", () => {
    expect(getInitials("  Ana    Pérez  ")).toBe("AP");
  });

  it("falls back to ? for blank or missing names", () => {
    expect(getInitials("")).toBe("?");
    expect(getInitials("   ")).toBe("?");
    expect(getInitials(null)).toBe("?");
    expect(getInitials(undefined)).toBe("?");
  });

  it("keeps accented and non-latin letters intact", () => {
    expect(getInitials("álvaro núñez")).toBe("ÁN");
    expect(getInitials("李 雷")).toBe("李雷");
  });

  it("does not split an emoji in half", () => {
    expect(getInitials("😀 Smile")).toBe("😀S");
  });
});

describe("formatShortDate", () => {
  it("formats day and short month in Spanish", () => {
    expect(formatShortDate("2026-08-21T12:00:00Z", "UTC")).toBe("21 ago");
  });

  it("respects the given time zone", () => {
    expect(formatShortDate("2026-09-07T01:00:00Z", "UTC")).toBe("7 sept");
    expect(formatShortDate("2026-09-07T01:00:00Z", "America/Argentina/Buenos_Aires")).toBe(
      "6 sept",
    );
  });

  it("returns an empty string for missing or invalid dates", () => {
    expect(formatShortDate(null)).toBe("");
    expect(formatShortDate(undefined)).toBe("");
    expect(formatShortDate("not a date")).toBe("");
  });
});

describe("formatRelativeDate", () => {
  const base = new Date("2026-09-18T20:00:00Z");

  it("returns empty string for null, undefined or invalid input", () => {
    expect(formatRelativeDate(null)).toBe("");
    expect(formatRelativeDate(undefined)).toBe("");
    expect(formatRelativeDate("invalid")).toBe("");
  });

  it("returns recién when less than a minute ago", () => {
    const date = new Date("2026-09-18T19:59:30Z").toISOString();
    expect(formatRelativeDate(date, { baseDate: base })).toBe("recién");
  });

  it("returns minutes when less than an hour ago", () => {
    const date = new Date("2026-09-18T19:40:00Z").toISOString();
    expect(formatRelativeDate(date, { baseDate: base })).toBe("20m");
  });

  it("returns hours when less than 24 hours ago", () => {
    const date = new Date("2026-09-18T15:00:00Z").toISOString();
    expect(formatRelativeDate(date, { baseDate: base })).toBe("5h");
  });

  it("returns ayer when 1 day ago", () => {
    const date = new Date("2026-09-17T15:00:00Z").toISOString();
    expect(formatRelativeDate(date, { baseDate: base })).toBe("ayer");
  });

  it("returns days when between 2 and 6 days ago", () => {
    const date = new Date("2026-09-15T20:00:00Z").toISOString();
    expect(formatRelativeDate(date, { baseDate: base })).toBe("3d");
  });

  it("falls back to formatShortDate when 7 or more days ago", () => {
    const date = new Date("2026-09-08T12:00:00Z").toISOString();
    expect(formatRelativeDate(date, { baseDate: base, timeZone: "UTC" })).toBe("8 sept");
  });
});
