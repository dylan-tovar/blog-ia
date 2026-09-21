import { describe, expect, it } from "vitest";
import { setLikeSchema } from "@/features/likes/schemas";

const postId = "3f2b8c1e-6a4d-4f1b-9c7e-2d5a8b0e1f34";

describe("setLikeSchema", () => {
  it.each([true, false])("accepts liked=%s", (liked) => {
    expect(setLikeSchema.safeParse({ postId, liked }).success).toBe(true);
  });

  it.each(["", "abc", "../../etc/passwd", undefined, 42])(
    "rejects postId %j",
    (bad) => {
      expect(setLikeSchema.safeParse({ postId: bad, liked: true }).success).toBe(false);
    },
  );

  it.each(["true", 1, null, undefined])("rejects non-boolean liked %j", (liked) => {
    expect(setLikeSchema.safeParse({ postId, liked }).success).toBe(false);
  });

  it("drops unknown fields", () => {
    const result = setLikeSchema.parse({ postId, liked: true, user_id: "someone-else" });
    expect(Object.keys(result).sort()).toEqual(["liked", "postId"]);
  });
});
