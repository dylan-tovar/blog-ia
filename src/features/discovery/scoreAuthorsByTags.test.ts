import { describe, expect, it } from "vitest";
import { rankAuthorsByAffinity, type AuthorCandidate } from "./scoreAuthorsByTags";

function candidate(authorId: string, followerCount: number, tagIds: string[] = []): AuthorCandidate {
  return { author_id: authorId, follower_count: followerCount, tag_ids: tagIds };
}

describe("rankAuthorsByAffinity", () => {
  it("degrades to popularity order when tagIds is empty", () => {
    const result = rankAuthorsByAffinity({
      tagIds: new Set(),
      limit: 10,
      candidates: [candidate("a", 3, ["arq"]), candidate("b", 10, ["ts"]), candidate("c", 5, [])],
    });

    expect(result.map((entry) => entry.author_id)).toEqual(["b", "c", "a"]);
    expect(result.every((entry) => entry.score === 0)).toBe(true);
  });

  it("puts authors sharing the most tags with the profile first", () => {
    const result = rankAuthorsByAffinity({
      tagIds: new Set(["arq", "ts"]),
      limit: 10,
      candidates: [
        candidate("no-match", 100, ["design"]),
        candidate("one-match", 1, ["arq"]),
        candidate("two-matches", 1, ["arq", "ts", "design"]),
      ],
    });

    expect(result).toEqual([
      { author_id: "two-matches", score: 2 },
      { author_id: "one-match", score: 1 },
      { author_id: "no-match", score: 0 },
    ]);
  });

  it("breaks score ties by follower_count descending", () => {
    const result = rankAuthorsByAffinity({
      tagIds: new Set(["arq"]),
      limit: 10,
      candidates: [candidate("less-followed", 2, ["arq"]), candidate("more-followed", 20, ["arq"])],
    });

    expect(result.map((entry) => entry.author_id)).toEqual(["more-followed", "less-followed"]);
  });

  it("breaks full ties by author_id so the order is stable", () => {
    const result = rankAuthorsByAffinity({
      tagIds: new Set(),
      limit: 10,
      candidates: [candidate("b", 1), candidate("a", 1)],
    });

    expect(result.map((entry) => entry.author_id)).toEqual(["a", "b"]);
  });

  it("counts a repeated tag on the same author once", () => {
    const result = rankAuthorsByAffinity({
      tagIds: new Set(["arq"]),
      limit: 10,
      candidates: [candidate("dup", 1, ["arq", "arq"])],
    });

    expect(result).toEqual([{ author_id: "dup", score: 1 }]);
  });

  it("caps the result at the limit", () => {
    const candidates = Array.from({ length: 5 }, (_, index) => candidate(`p${index}`, index));

    expect(
      rankAuthorsByAffinity({ tagIds: new Set(), limit: 2, candidates }),
    ).toHaveLength(2);
  });

  it("returns an empty list when there are no candidates", () => {
    expect(rankAuthorsByAffinity({ tagIds: new Set(["arq"]), limit: 10, candidates: [] })).toEqual(
      [],
    );
  });

  it("does not mutate the candidates it receives", () => {
    const candidates = [candidate("a", 1), candidate("b", 2)];

    rankAuthorsByAffinity({ tagIds: new Set(), limit: 10, candidates });

    expect(candidates.map((entry) => entry.author_id)).toEqual(["a", "b"]);
  });
});
