import type { RecommendedPost } from "@/features/recommendations/queries";
import { RecommendedCard } from "./RecommendedCard";
import { RECOMMENDED_ITEM_CLASS, RECOMMENDED_ROW_CLASS } from "./row-styles";

// The promise comes from getRecommendedPosts, which never rejects.
export async function RecommendedSection({ postsPromise }: { postsPromise: Promise<RecommendedPost[]> }) {
  const posts = await postsPromise;

  if (posts.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="recommended-heading" className="border-b py-4">
      <h2 id="recommended-heading" className="px-4 text-sm font-semibold text-foreground">
        Recomendados para ti
      </h2>
      <ul className={`mt-3 ${RECOMMENDED_ROW_CLASS}`}>
        {posts.map((post) => (
          <li key={post.id} className={RECOMMENDED_ITEM_CLASS}>
            <RecommendedCard post={post} />
          </li>
        ))}
      </ul>
    </section>
  );
}
