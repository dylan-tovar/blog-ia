export const INTERESTS_MIN = 0;
export const INTERESTS_MAX = 20;
export const INTEREST_TAGS_LIMIT = 30;

// Selecting interests in onboarding is optional (minimum is 0).
export function requiredInterestCount(_eligibleCount?: number) {
  return 0;
}
