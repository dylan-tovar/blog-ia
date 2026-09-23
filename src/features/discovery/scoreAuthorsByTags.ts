export type AuthorCandidate = {
  author_id: string;
  follower_count: number;
  tag_ids: string[];
};

export type RankedAuthor = { author_id: string; score: number };

function scoreOf(candidate: AuthorCandidate, tagIds: Set<string>) {
  const candidateTagIds = new Set(candidate.tag_ids);
  let score = 0;
  for (const tagId of candidateTagIds) {
    if (tagIds.has(tagId)) {
      score += 1;
    }
  }
  return score;
}

function compareByPopularity(a: AuthorCandidate, b: AuthorCandidate) {
  if (a.follower_count !== b.follower_count) {
    return b.follower_count - a.follower_count;
  }
  return a.author_id < b.author_id ? -1 : a.author_id > b.author_id ? 1 : 0;
}

// Reorders a pool of candidate authors (already popularity-ordered upstream, see
// `popular_authors`) by tag affinity with the viewer's profile. With an empty
// `tagIds` every candidate scores 0, so the order that remains is the input
// order: popularity. Not a special branch, just what the scoring does.
export function rankAuthorsByAffinity({
  tagIds,
  candidates,
  limit,
}: {
  tagIds: Set<string>;
  candidates: AuthorCandidate[];
  limit: number;
}): RankedAuthor[] {
  return candidates
    .map((candidate) => ({ candidate, score: scoreOf(candidate, tagIds) }))
    .sort((a, b) => b.score - a.score || compareByPopularity(a.candidate, b.candidate))
    .slice(0, limit)
    .map(({ candidate, score }) => ({ author_id: candidate.author_id, score }));
}
