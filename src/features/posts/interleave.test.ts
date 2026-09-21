import { describe, expect, it } from "vitest";
import { interleaveRecommended } from "@/features/posts/interleave";
import type { FeedPost } from "@/features/posts/queries";

function post(id: string): FeedPost {
  return {
    id,
    type: "note",
    content: id,
    parent: null,
    publishedAt: null,
    author: null,
    viewerFollows: false,
    likeCount: 0,
    viewerLiked: false,
    notesCount: 0,
  };
}

function posts(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => post(`${prefix}${index + 1}`));
}

function layout(items: ReturnType<typeof interleaveRecommended>) {
  return items.map(({ post: { id }, recommended }) => (recommended ? `*${id}` : id));
}

describe("interleaveRecommended", () => {
  it("inserts one recommended post after every 3 feed posts", () => {
    const result = interleaveRecommended(posts("f", 6), posts("r", 2));
    expect(layout(result)).toEqual(["f1", "f2", "f3", "*r1", "f4", "f5", "f6", "*r2"]);
  });

  it("returns the feed untouched when there are no recommendations", () => {
    const result = interleaveRecommended(posts("f", 4), []);
    expect(layout(result)).toEqual(["f1", "f2", "f3", "f4"]);
    expect(result.every(({ recommended }) => !recommended)).toBe(true);
  });

  it("inserts nothing when the feed is shorter than the interval", () => {
    expect(layout(interleaveRecommended(posts("f", 2), posts("r", 3)))).toEqual(["f1", "f2"]);
  });

  it("inserts after exactly `every` posts", () => {
    expect(layout(interleaveRecommended(posts("f", 3), posts("r", 1)))).toEqual([
      "f1",
      "f2",
      "f3",
      "*r1",
    ]);
  });

  it("stops inserting when the recommendations run out", () => {
    const result = interleaveRecommended(posts("f", 9), posts("r", 1));
    expect(layout(result)).toEqual(["f1", "f2", "f3", "*r1", "f4", "f5", "f6", "f7", "f8", "f9"]);
  });

  it("ignores recommendations whose id is already in the feed", () => {
    const feed = posts("f", 6);
    const recs = [post("f2"), post("r1")];
    expect(layout(interleaveRecommended(feed, recs))).toEqual([
      "f1",
      "f2",
      "f3",
      "*r1",
      "f4",
      "f5",
      "f6",
    ]);
  });

  it("does not repeat a recommendation listed twice", () => {
    const result = interleaveRecommended(posts("f", 6), [post("r1"), post("r1"), post("r2")]);
    expect(layout(result)).toEqual(["f1", "f2", "f3", "*r1", "f4", "f5", "f6", "*r2"]);
  });

  it("supports a custom interval", () => {
    const result = interleaveRecommended(posts("f", 4), posts("r", 2), 2);
    expect(layout(result)).toEqual(["f1", "f2", "*r1", "f3", "f4", "*r2"]);
  });

  it("keeps the position pattern when the feed grows (load more)", () => {
    const first = layout(interleaveRecommended(posts("f", 3), posts("r", 3)));
    const extended = layout(interleaveRecommended(posts("f", 6), posts("r", 3)));
    expect(extended.slice(0, first.length)).toEqual(first);
  });

  it("does not mutate its inputs", () => {
    const feed = posts("f", 3);
    const recs = posts("r", 1);
    interleaveRecommended(feed, recs);
    expect(feed).toHaveLength(3);
    expect(recs).toHaveLength(1);
  });
});
