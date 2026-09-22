import { describe, expect, it } from "vitest";
import { describeNotification } from "@/features/notifications/format";
import type { Notification } from "@/features/notifications/queries";

function makeNotification(overrides: Partial<Notification>): Notification {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    type: "follow",
    createdAt: "2026-09-21T00:00:00.000Z",
    readAt: null,
    actor: { id: "22222222-2222-2222-2222-222222222222", displayName: "Ana" },
    postId: null,
    noteExcerpt: null,
    ...overrides,
  };
}

describe("describeNotification", () => {
  it("links a follow notification to the actor's profile", () => {
    const result = describeNotification(makeNotification({ type: "follow" }));
    expect(result).toEqual({
      actionText: "empezó a seguirte",
      href: "/author/22222222-2222-2222-2222-222222222222",
    });
  });

  it("links a like notification to the liked post", () => {
    const result = describeNotification(
      makeNotification({ type: "like", postId: "33333333-3333-3333-3333-333333333333" }),
    );
    expect(result).toEqual({
      actionText: "le dio me gusta a tu post",
      href: "/post/33333333-3333-3333-3333-333333333333",
    });
  });

  it("links a note notification to the parent post", () => {
    const result = describeNotification(
      makeNotification({ type: "note", postId: "44444444-4444-4444-4444-444444444444" }),
    );
    expect(result).toEqual({
      actionText: "dejó una nota en tu post",
      href: "/post/44444444-4444-4444-4444-444444444444",
    });
  });

  it("falls back to /activity when the target id is missing", () => {
    const result = describeNotification(makeNotification({ type: "follow", actor: null }));
    expect(result.href).toBe("/activity");
  });
});
