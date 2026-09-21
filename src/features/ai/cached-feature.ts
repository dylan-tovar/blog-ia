import { rateLimitToAiError, type RateLimitResult } from "./rate-limit";

// Shared flow of the cache-capable features (titles, content score, summary):
// a cache hit costs nothing (no limiter, no model); a miss or an explicit
// regenerate goes through the limiter, the model and then the cache write.
// Failures are thrown as AiError by `generate` / the limiter; a cache write that
// fails or is refused (the post changed meanwhile) never fails the request.
export async function runCachedFeature<T>({
  cached,
  regenerate,
  rateLimit,
  generate,
  save,
}: {
  cached: T | null;
  regenerate: boolean;
  rateLimit: () => Promise<RateLimitResult>;
  generate: () => Promise<T>;
  save: (value: T) => Promise<unknown>;
}): Promise<{ data: T; cached: boolean }> {
  if (cached !== null && !regenerate) {
    return { data: cached, cached: true };
  }

  const limit = await rateLimit();
  if (!limit.ok) {
    throw rateLimitToAiError(limit);
  }

  const data = await generate();

  try {
    await save(data);
  } catch {
    // Best effort: the author still gets the result.
  }

  return { data, cached: false };
}
