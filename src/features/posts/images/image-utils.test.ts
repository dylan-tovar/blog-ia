import { describe, expect, it } from "vitest";
import {
  buildImagePath,
  computeTargetSize,
  defaultAltText,
  isAllowedImageUrl,
  parseImageSize,
  shouldInterceptPaste,
  validateSourceFile,
} from "@/features/posts/images/image-utils";
import {
  IMAGE_MAX_SOURCE_BYTES,
  IMAGE_MAX_WIDTH,
} from "@/features/posts/images/image-limits";

const SUPABASE_URL = "https://abcd.supabase.co";
const PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/post-images`;

describe("validateSourceFile", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s", (type) => {
    expect(validateSourceFile({ type, size: 1024 })).toEqual({ ok: true });
  });

  it.each(["image/gif", "image/svg+xml", "application/pdf", "text/plain", ""])(
    "rejects unsupported type %j",
    (type) => {
      expect(validateSourceFile({ type, size: 1024 })).toEqual({ ok: false, reason: "type" });
    },
  );

  it("accepts a file exactly at the source limit", () => {
    expect(validateSourceFile({ type: "image/png", size: IMAGE_MAX_SOURCE_BYTES })).toEqual({
      ok: true,
    });
  });

  it("rejects a file over the source limit", () => {
    expect(validateSourceFile({ type: "image/png", size: IMAGE_MAX_SOURCE_BYTES + 1 })).toEqual({
      ok: false,
      reason: "size",
    });
  });

  it("rejects an empty file", () => {
    expect(validateSourceFile({ type: "image/png", size: 0 })).toEqual({
      ok: false,
      reason: "empty",
    });
  });
});

describe("computeTargetSize", () => {
  it("downscales wide images to the max width keeping aspect ratio", () => {
    expect(computeTargetSize(3200, 1800)).toEqual({ width: IMAGE_MAX_WIDTH, height: 900 });
  });

  it("never upscales small images", () => {
    expect(computeTargetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("keeps images exactly at the max width untouched", () => {
    expect(computeTargetSize(IMAGE_MAX_WIDTH, 1000)).toEqual({
      width: IMAGE_MAX_WIDTH,
      height: 1000,
    });
  });

  it("rounds the scaled height to an integer", () => {
    const { width, height } = computeTargetSize(2001, 1001);
    expect(width).toBe(IMAGE_MAX_WIDTH);
    expect(Number.isInteger(height)).toBe(true);
    expect(height).toBe(Math.round((1001 * IMAGE_MAX_WIDTH) / 2001));
  });

  it("never returns a zero dimension for extreme aspect ratios", () => {
    expect(computeTargetSize(10000, 1).height).toBe(1);
  });

  it("honours a custom max width", () => {
    expect(computeTargetSize(1000, 500, 400)).toEqual({ width: 400, height: 200 });
  });

  it.each([
    [0, 100],
    [100, 0],
    [-5, 100],
    [Number.NaN, 100],
  ])("throws on invalid size %s x %s", (w, h) => {
    expect(() => computeTargetSize(w, h)).toThrow();
  });
});

describe("buildImagePath", () => {
  it("builds <userId>/<uuid>-<w>x<h>.webp", () => {
    expect(buildImagePath("user-1", "uuid-1", 1600, 900)).toBe("user-1/uuid-1-1600x900.webp");
  });

  it("supports a custom extension", () => {
    expect(buildImagePath("user-1", "uuid-1", 10, 20, "jpg")).toBe("user-1/uuid-1-10x20.jpg");
  });
});

describe("parseImageSize", () => {
  it("reads the dimensions encoded in the file name", () => {
    expect(parseImageSize(`${PUBLIC_PREFIX}/user-1/uuid-1-1600x900.webp`)).toEqual({
      width: 1600,
      height: 900,
    });
  });

  it("ignores query strings and hashes", () => {
    expect(parseImageSize(`${PUBLIC_PREFIX}/u/x-640x480.jpg?v=2#top`)).toEqual({
      width: 640,
      height: 480,
    });
  });

  it.each([
    `${PUBLIC_PREFIX}/user-1/plain.webp`,
    `${PUBLIC_PREFIX}/user-1/uuid-0x900.webp`,
    `${PUBLIC_PREFIX}/user-1/uuid-1600x0.webp`,
    "not a url",
    "",
  ])("returns null when there are no usable dimensions: %j", (url) => {
    expect(parseImageSize(url)).toBeNull();
  });
});

describe("isAllowedImageUrl", () => {
  it("accepts public post-images URLs on the Supabase host", () => {
    expect(isAllowedImageUrl(`${PUBLIC_PREFIX}/user-1/a-1x1.webp`, SUPABASE_URL)).toBe(true);
  });

  it("accepts http on the configured host (local Supabase)", () => {
    expect(
      isAllowedImageUrl(
        "http://127.0.0.1:54321/storage/v1/object/public/post-images/u/a-1x1.webp",
        "http://127.0.0.1:54321",
      ),
    ).toBe(true);
  });

  it.each([
    ["foreign host", "https://evil.example.com/storage/v1/object/public/post-images/u/a.webp"],
    ["other bucket", `${SUPABASE_URL}/storage/v1/object/public/avatars/u/a.webp`],
    ["non-public path", `${SUPABASE_URL}/storage/v1/object/sign/post-images/u/a.webp`],
    ["lookalike host", "https://abcd.supabase.co.evil.com/storage/v1/object/public/post-images/a.webp"],
    ["userinfo trick", "https://abcd.supabase.co@evil.com/storage/v1/object/public/post-images/a.webp"],
    ["different port", "https://abcd.supabase.co:8443/storage/v1/object/public/post-images/a.webp"],
    ["path traversal", `${PUBLIC_PREFIX}/../avatars/a.webp`],
    ["javascript scheme", "javascript:alert(1)"],
    ["data URI", "data:image/png;base64,AAAA"],
    ["protocol-relative", "//abcd.supabase.co/storage/v1/object/public/post-images/a.webp"],
    ["relative", "/storage/v1/object/public/post-images/a.webp"],
    ["empty", ""],
  ])("rejects %s", (_label, url) => {
    expect(isAllowedImageUrl(url, SUPABASE_URL)).toBe(false);
  });

  it("rejects everything when the Supabase URL is missing or invalid", () => {
    expect(isAllowedImageUrl(`${PUBLIC_PREFIX}/u/a.webp`, "")).toBe(false);
    expect(isAllowedImageUrl(`${PUBLIC_PREFIX}/u/a.webp`, "not a url")).toBe(false);
  });
});

describe("defaultAltText", () => {
  it("turns a descriptive file name into readable text", () => {
    expect(defaultAltText("atardecer-en_la-playa.jpg")).toBe("atardecer en la playa");
  });

  it("strips characters that would break markdown image syntax", () => {
    expect(defaultAltText("foo [bar] (baz) <x>.png")).toBe("foo bar baz x");
  });

  it("collapses whitespace and trims", () => {
    expect(defaultAltText("  a   b  .webp")).toBe("a b");
  });

  it.each([
    "IMG_1234.jpg",
    "DSC00123.JPG",
    "PXL_20260921_101010.jpg",
    "Screenshot 2026-09-21 at 4.30.15 PM.png",
    "Captura de pantalla 2026-09-21 a las 4.30.15.png",
    "image.png",
    "123456.png",
    "",
  ])("returns an empty alt for generic file name %j", (name) => {
    expect(defaultAltText(name)).toBe("");
  });

  it("truncates very long names", () => {
    expect(defaultAltText(`${"palabra ".repeat(30)}.png`).length).toBeLessThanOrEqual(80);
  });
});

describe("shouldInterceptPaste", () => {
  function clipboard(files: string[], text: Record<string, string> = {}) {
    return {
      files: files.map((type) => ({ type })),
      getData: (format: string) => text[format] ?? "",
    };
  }

  it("intercepts a pasted image with no text payload (screenshot)", () => {
    expect(shouldInterceptPaste(clipboard(["image/png"]))).toBe(true);
  });

  it("does not intercept an image that comes with HTML (Word, Excel, Sheets)", () => {
    expect(
      shouldInterceptPaste(clipboard(["image/png"], { "text/html": "<table><tr><td>1</td></tr></table>" })),
    ).toBe(false);
  });

  it("does not intercept an image that comes with plain text", () => {
    expect(shouldInterceptPaste(clipboard(["image/png"], { "text/plain": "a1\tb1" }))).toBe(false);
  });

  it("intercepts when the text payloads are only whitespace", () => {
    expect(
      shouldInterceptPaste(clipboard(["image/png"], { "text/plain": "  \n", "text/html": "" })),
    ).toBe(true);
  });

  it("does not intercept text-only pastes", () => {
    expect(shouldInterceptPaste(clipboard([], { "text/plain": "hola" }))).toBe(false);
  });

  it("does not intercept an empty clipboard", () => {
    expect(shouldInterceptPaste(clipboard([]))).toBe(false);
  });

  it("does not intercept non-image files", () => {
    expect(shouldInterceptPaste(clipboard(["application/pdf"]))).toBe(false);
  });

  it("does not intercept when there is no clipboard data", () => {
    expect(shouldInterceptPaste(null)).toBe(false);
  });
});
