import { OwnPostsManager } from "@/features/posts/components/OwnPostsManager";
import { getOwnPosts } from "@/features/posts/queries";

export default async function PostsPage() {
  const posts = await getOwnPosts();

  return (
    <>
      <h1 className="sr-only">Mis publicaciones</h1>
      <OwnPostsManager initialPosts={posts} />
    </>
  );
}
