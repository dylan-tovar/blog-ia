import { describe, expect, it } from "vitest";
import { setRepostSchema } from "@/features/reposts/schemas";

const postId = "3f2b8c1e-6a4d-4f1b-9c7e-2d5a8b0e1f34";

describe("setRepostSchema", () => {
  it.each([true, false])("accepts reposted=%s", (reposted) => {
    expect(setRepostSchema.safeParse({ postId, reposted }).success).toBe(true);
  });

  it.each(["", "abc", "../../etc/passwd", undefined, 42])(
    "rejects postId %j",
    (bad) => {
      expect(setRepostSchema.safeParse({ postId: bad, reposted: true }).success).toBe(false);
    },
  );

  it.each(["true", 1, null, undefined])("rejects non-boolean reposted %j", (reposted) => {
    expect(setRepostSchema.safeParse({ postId, reposted }).success).toBe(false);
  });

  it("drops unknown fields", () => {
    const result = setRepostSchema.parse({ postId, reposted: true, user_id: "someone-else" });
    expect(Object.keys(result).sort()).toEqual(["postId", "reposted"]);
  });
});
