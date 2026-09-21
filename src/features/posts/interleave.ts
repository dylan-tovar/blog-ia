import type { FeedPost } from "@/features/posts/queries";

export const RECOMMENDED_EVERY = 3;

export type InterleavedPost = { post: FeedPost; recommended: boolean };

// Puts one recommended post after every `every` feed posts while recommendations remain.
// Recommendations already present in the feed (or repeated) are skipped so no post shows
// twice. Positions depend only on the feed index, so loading more pages never reshuffles
// what is already on screen.
export function interleaveRecommended(
  feed: FeedPost[],
  recommended: FeedPost[],
  every = RECOMMENDED_EVERY,
): InterleavedPost[] {
  const seen = new Set(feed.map((post) => post.id));
  const pool = recommended.filter((post) => {
    if (seen.has(post.id)) {
      return false;
    }
    seen.add(post.id);
    return true;
  });

  const result: InterleavedPost[] = [];
  let next = 0;

  feed.forEach((post, index) => {
    result.push({ post, recommended: false });
    if ((index + 1) % every === 0 && next < pool.length) {
      result.push({ post: pool[next], recommended: true });
      next += 1;
    }
  });

  return result;
}
