export const INTERESTS_MIN = 3;
export const INTERESTS_MAX = 20;
export const INTEREST_TAGS_LIMIT = 30;

// Relaxed when fewer tags exist than the minimum (down to 0 with none), so
// nobody gets stuck on a step they cannot complete.
export function requiredInterestCount(eligibleCount: number) {
  return Math.min(INTERESTS_MIN, eligibleCount);
}
