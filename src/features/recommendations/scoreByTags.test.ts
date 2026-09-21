import { describe, expect, it } from "vitest";
import {
  buildTagProfile,
  rankCandidates,
  type Candidate,
  type HistoryRow,
} from "./scoreByTags";

const VIEWER = "viewer";

function read(postId: string, authorId: string, tagIds: string[] | null): HistoryRow {
  return {
    post_id: postId,
    posts:
      tagIds === null
        ? null
        : { author_id: authorId, post_tags: tagIds.map((tag_id) => ({ tag_id })) },
  };
}

function candidate(
  id: string,
  publishedAt: string | null,
  tagIds: string[] | null,
  authorId = "author",
): Candidate {
  return {
    id,
    author_id: authorId,
    published_at: publishedAt,
    post_tags: tagIds === null ? null : tagIds.map((tag_id) => ({ tag_id })),
  };
}

const profile = (tagIds: string[], readPostIds: string[] = []) => ({
  tagIds: new Set(tagIds),
  readPostIds: new Set(readPostIds),
});

describe("buildTagProfile", () => {
  it("returns empty sets when there is no history", () => {
    const result = buildTagProfile([], VIEWER);

    expect(result.tagIds.size).toBe(0);
    expect(result.readPostIds.size).toBe(0);
  });

  it("collects the read post ids and the union of their tags", () => {
    const result = buildTagProfile(
      [read("p1", "a", ["t1", "t2"]), read("p2", "a", ["t2", "t3"])],
      VIEWER,
    );

    expect([...result.readPostIds].sort()).toEqual(["p1", "p2"]);
    expect([...result.tagIds].sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("counts a tag once even when several read posts share it", () => {
    const result = buildTagProfile(
      [read("p1", "a", ["t1"]), read("p2", "a", ["t1"]), read("p3", "a", ["t1", "t1"])],
      VIEWER,
    );

    expect(result.tagIds.size).toBe(1);
  });

  it("ignores the tags of the viewer's own posts but still marks them as read", () => {
    const result = buildTagProfile(
      [read("mine", VIEWER, ["t1"]), read("theirs", "a", ["t2"])],
      VIEWER,
    );

    expect([...result.tagIds]).toEqual(["t2"]);
    expect(result.readPostIds.has("mine")).toBe(true);
  });

  it("keeps the read id but skips tags when the post is no longer visible", () => {
    const result = buildTagProfile([read("gone", "a", null)], VIEWER);

    expect(result.readPostIds.has("gone")).toBe(true);
    expect(result.tagIds.size).toBe(0);
  });

  it("handles posts whose tag embed is null", () => {
    const rows: HistoryRow[] = [{ post_id: "p1", posts: { author_id: "a", post_tags: null } }];

    expect(buildTagProfile(rows, VIEWER).tagIds.size).toBe(0);
  });
});

describe("rankCandidates", () => {
  const base = { viewerId: VIEWER, limit: 10 };

  it("returns the most recent posts when the user has no history", () => {
    const result = rankCandidates({
      ...base,
      ...profile([]),
      candidates: [
        candidate("old", "2026-01-01T00:00:00Z", ["t1"]),
        candidate("new", "2026-03-01T00:00:00Z", ["t2"]),
        candidate("mid", "2026-02-01T00:00:00Z", null),
      ],
    });

    expect(result.map((entry) => entry.id)).toEqual(["new", "mid", "old"]);
    expect(result.every((entry) => entry.score === 0)).toBe(true);
  });

  it("puts posts sharing the most tags with the history first", () => {
    const result = rankCandidates({
      ...base,
      ...profile(["arq", "ts"]),
      candidates: [
        candidate("recent-no-match", "2026-03-01T00:00:00Z", ["design"]),
        candidate("one-match", "2026-01-02T00:00:00Z", ["arq"]),
        candidate("two-matches", "2026-01-01T00:00:00Z", ["arq", "ts", "design"]),
      ],
    });

    expect(result).toEqual([
      { id: "two-matches", score: 2 },
      { id: "one-match", score: 1 },
      { id: "recent-no-match", score: 0 },
    ]);
  });

  it("never returns a post the user already read", () => {
    const result = rankCandidates({
      ...base,
      ...profile(["arq"], ["read"]),
      candidates: [
        candidate("read", "2026-03-01T00:00:00Z", ["arq"]),
        candidate("unread", "2026-01-01T00:00:00Z", ["arq"]),
      ],
    });

    expect(result.map((entry) => entry.id)).toEqual(["unread"]);
  });

  it("never returns the viewer's own posts", () => {
    const result = rankCandidates({
      ...base,
      ...profile(["arq"]),
      candidates: [
        candidate("mine", "2026-03-01T00:00:00Z", ["arq"], VIEWER),
        candidate("theirs", "2026-01-01T00:00:00Z", ["arq"]),
      ],
    });

    expect(result.map((entry) => entry.id)).toEqual(["theirs"]);
  });

  it("breaks score ties by published_at descending", () => {
    const result = rankCandidates({
      ...base,
      ...profile(["arq"]),
      candidates: [
        candidate("older", "2026-01-01T00:00:00Z", ["arq"]),
        candidate("newer", "2026-02-01T00:00:00Z", ["arq"]),
      ],
    });

    expect(result.map((entry) => entry.id)).toEqual(["newer", "older"]);
  });

  it("breaks full ties by id so the order is stable", () => {
    const result = rankCandidates({
      ...base,
      ...profile([]),
      candidates: [
        candidate("b", "2026-01-01T00:00:00Z", null),
        candidate("a", "2026-01-01T00:00:00Z", null),
      ],
    });

    expect(result.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("sorts posts without a publication date last", () => {
    const result = rankCandidates({
      ...base,
      ...profile([]),
      candidates: [candidate("undated", null, null), candidate("dated", "2026-01-01T00:00:00Z", null)],
    });

    expect(result.map((entry) => entry.id)).toEqual(["dated", "undated"]);
  });

  it.each([
    ["dated first", ["dated", "broken"]],
    ["broken first", ["broken", "dated"]],
  ])("sorts unparsable dates last regardless of input order (%s)", (_label, order) => {
    const byId = {
      dated: candidate("dated", "2026-01-01T00:00:00Z", null),
      broken: candidate("broken", "not-a-date", null),
    };

    const result = rankCandidates({
      ...base,
      ...profile([]),
      candidates: order.map((id) => byId[id as keyof typeof byId]),
    });

    expect(result.map((entry) => entry.id)).toEqual(["dated", "broken"]);
  });

  it("counts a repeated tag on the same post once", () => {
    const result = rankCandidates({
      ...base,
      ...profile(["arq"]),
      candidates: [candidate("dup", "2026-01-01T00:00:00Z", ["arq", "arq"])],
    });

    expect(result).toEqual([{ id: "dup", score: 1 }]);
  });

  it("fills the remaining slots with recent unmatched posts without duplicates", () => {
    const result = rankCandidates({
      ...base,
      limit: 4,
      ...profile(["arq"]),
      candidates: [
        candidate("match", "2026-01-01T00:00:00Z", ["arq"]),
        candidate("r1", "2026-03-03T00:00:00Z", ["x"]),
        candidate("r2", "2026-03-02T00:00:00Z", null),
        candidate("r3", "2026-03-01T00:00:00Z", ["y"]),
        candidate("r4", "2026-02-01T00:00:00Z", ["z"]),
      ],
    });

    expect(result.map((entry) => entry.id)).toEqual(["match", "r1", "r2", "r3"]);
    expect(new Set(result.map((entry) => entry.id)).size).toBe(result.length);
  });

  it("caps the result at the limit", () => {
    const candidates = Array.from({ length: 5 }, (_, index) =>
      candidate(`p${index}`, `2026-01-0${index + 1}T00:00:00Z`, null),
    );

    expect(rankCandidates({ ...base, limit: 2, ...profile([]), candidates })).toHaveLength(2);
  });

  it("returns an empty list when there are no candidates", () => {
    expect(rankCandidates({ ...base, ...profile(["arq"]), candidates: [] })).toEqual([]);
  });

  it("does not mutate the candidates it receives", () => {
    const candidates = [
      candidate("a", "2026-01-01T00:00:00Z", null),
      candidate("b", "2026-02-01T00:00:00Z", null),
    ];

    rankCandidates({ ...base, ...profile([]), candidates });

    expect(candidates.map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});
