export type HistoryRow = {
  post_id: string;
  posts: {
    author_id: string;
    post_tags: { tag_id: string }[] | null;
  } | null;
};

export type Candidate = {
  id: string;
  author_id: string;
  published_at: string | null;
  post_tags: { tag_id: string }[] | null;
};

export type RankedCandidate = { id: string; score: number };

export function buildTagProfile(history: HistoryRow[], viewerId: string) {
  const readPostIds = new Set<string>();
  const tagIds = new Set<string>();

  for (const row of history) {
    readPostIds.add(row.post_id);

    if (!row.posts || row.posts.author_id === viewerId) {
      continue;
    }
    for (const { tag_id } of row.posts.post_tags ?? []) {
      tagIds.add(tag_id);
    }
  }

  return { readPostIds, tagIds };
}

// Chosen interests count like read tags: they seed the profile of users with little
// or no history. Returns a new set.
export function withInterestTags(tagIds: Set<string>, interestTagIds: string[]) {
  return new Set([...tagIds, ...interestTagIds]);
}

function scoreOf(candidate: Candidate, tagIds: Set<string>) {
  const postTagIds = new Set((candidate.post_tags ?? []).map(({ tag_id }) => tag_id));
  let score = 0;
  for (const tagId of postTagIds) {
    if (tagIds.has(tagId)) {
      score += 1;
    }
  }
  return score;
}

function publishedTime(candidate: Candidate) {
  const time = candidate.published_at ? Date.parse(candidate.published_at) : Number.NaN;
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function compareByRecency(a: Candidate, b: Candidate) {
  const aTime = publishedTime(a);
  const bTime = publishedTime(b);
  if (aTime !== bTime) {
    return bTime > aTime ? 1 : -1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function rankCandidates({
  tagIds,
  readPostIds,
  candidates,
  viewerId,
  limit,
}: {
  tagIds: Set<string>;
  readPostIds: Set<string>;
  candidates: Candidate[];
  viewerId: string;
  limit: number;
}): RankedCandidate[] {
  return candidates
    .filter((candidate) => candidate.author_id !== viewerId && !readPostIds.has(candidate.id))
    .map((candidate) => ({ candidate, score: scoreOf(candidate, tagIds) }))
    .sort((a, b) => b.score - a.score || compareByRecency(a.candidate, b.candidate))
    .slice(0, limit)
    .map(({ candidate, score }) => ({ id: candidate.id, score }));
}
