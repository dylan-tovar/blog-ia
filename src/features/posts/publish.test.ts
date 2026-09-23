import { describe, expect, it } from "vitest";
import {
  PENDING_REVIEW_STALE_MS,
  buildFinalUpdate,
  buildModerationImages,
  classifyPublishClaim,
  staleReviewCutoffIso,
} from "./publish";

const SUPABASE = "https://proj.supabase.co";
const cover = `${SUPABASE}/storage/v1/object/public/post-images/u1/cover-800x600.webp`;
const body1 = `${SUPABASE}/storage/v1/object/public/post-images/u1/body1-800x600.webp`;
const body2 = `${SUPABASE}/storage/v1/object/public/post-images/u1/body2-800x600.webp`;

describe("classifyPublishClaim", () => {
  const now = Date.parse("2026-09-19T12:00:00.000Z");
  const fresh = new Date(now - 30_000).toISOString();
  const stale = new Date(now - PENDING_REVIEW_STALE_MS - 1_000).toISOString();

  it.each(["draft", "rejected"])("claims a %s post", (status) => {
    expect(classifyPublishClaim(status, fresh, now)).toBe("claim");
  });

  it("does not claim a fresh pending_review post: someone is already reviewing it", () => {
    expect(classifyPublishClaim("pending_review", fresh, now)).toBe("in_progress");
  });

  it("re-claims a stale pending_review post left over by an interrupted review", () => {
    expect(classifyPublishClaim("pending_review", stale, now)).toBe("claim");
  });

  it("treats a pending_review post with an unreadable date as fresh (never double-claims)", () => {
    expect(classifyPublishClaim("pending_review", "nope", now)).toBe("in_progress");
  });

  it.each(["published", "archived", ""])("rejects publishing from %s", (status) => {
    expect(classifyPublishClaim(status, fresh, now)).toBe("invalid");
  });
});

describe("staleReviewCutoffIso", () => {
  it("is the moment before which a pending_review post counts as stale", () => {
    const now = Date.parse("2026-09-19T12:00:00.000Z");

    expect(staleReviewCutoffIso(now)).toBe(new Date(now - PENDING_REVIEW_STALE_MS).toISOString());
  });
});

describe("buildModerationImages", () => {
  it("puts the cover first and then the body images in order", () => {
    const content = `Intro\n\n![a](${body1})\n\n![b](${body2})`;

    expect(buildModerationImages(cover, content, SUPABASE)).toEqual([
      { url: cover, label: "la portada" },
      { url: body1, label: "la imagen 1 del cuerpo" },
      { url: body2, label: "la imagen 2 del cuerpo" },
    ]);
  });

  it("does not send the cover twice when it is also inserted in the body", () => {
    const content = `![a](${cover})\n\n![b](${body1})`;

    expect(buildModerationImages(cover, content, SUPABASE)).toEqual([
      { url: cover, label: "la portada" },
      { url: body1, label: "la imagen 1 del cuerpo" },
    ]);
  });

  it("returns only the body images when there is no cover", () => {
    expect(buildModerationImages(null, `![a](${body1})`, SUPABASE)).toEqual([
      { url: body1, label: "la imagen 1 del cuerpo" },
    ]);
  });

  it("returns an empty list for an article without images", () => {
    expect(buildModerationImages(null, "Solo texto.", SUPABASE)).toEqual([]);
  });
});

describe("buildFinalUpdate", () => {
  const now = "2026-09-19T12:00:00.000Z";

  it("publishes with a timestamp and clears any stale rejection reason", () => {
    expect(buildFinalUpdate({ status: "published", tags: ["ia"] }, now)).toEqual({
      status: "published",
      published_at: now,
      rejection_reason: null,
    });
  });

  it("publishes the same way when the AI was skipped", () => {
    expect(buildFinalUpdate({ status: "published", tags: [], aiSkippedReason: "timeout" }, now)).toEqual({
      status: "published",
      published_at: now,
      rejection_reason: null,
    });
  });

  it("rejects with the reason and without a publication date", () => {
    expect(buildFinalUpdate({ status: "rejected", reason: "Contiene spam." }, now)).toEqual({
      status: "rejected",
      rejection_reason: "Contiene spam.",
    });
  });
});
