import { describe, expect, it } from "vitest";
import { isSafeLinkHref } from "@/features/posts/link-safety";

describe("isSafeLinkHref", () => {
  it.each([
    "https://example.com",
    "http://example.com/path?q=1#hash",
    "HTTPS://EXAMPLE.COM",
    "mailto:someone@example.com",
    "/relative/path",
    "#anchor",
    "relative/path",
    "",
  ])("accepts %j", (href) => {
    expect(isSafeLinkHref(href)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "​javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "tel:+123456",
  ])("rejects %j", (href) => {
    expect(isSafeLinkHref(href)).toBe(false);
  });

  it("treats null and undefined as safe (no link to protect)", () => {
    expect(isSafeLinkHref(null)).toBe(true);
    expect(isSafeLinkHref(undefined)).toBe(true);
  });
});
