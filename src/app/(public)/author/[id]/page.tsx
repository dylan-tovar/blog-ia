import { getViewer } from "@/lib/viewer";
import { getLikedPostsByUser, getPublishedPostsByAuthor } from "@/features/posts/queries";
import { getPublicProfile } from "@/features/profile/queries";
import { getFollowerCount, isFollowing } from "@/features/subscriptions/queries";
import { AuthorProfileView } from "@/features/profile/components/AuthorProfileView";

export default async function AuthorPage(props: PageProps<"/author/[id]">) {
  const { id } = await props.params;
  const profile = await getPublicProfile(id);
  const viewer = await getViewer();

  const [posts, likedPosts, followerCount, following] = await Promise.all([
    getPublishedPostsByAuthor(profile.id),
    getLikedPostsByUser(profile.id),
    getFollowerCount(profile.id),
    viewer && viewer.id !== profile.id
      ? isFollowing(viewer.id, profile.id)
      : Promise.resolve(false),
  ]);

  return (
    <AuthorProfileView
      profile={profile}
      viewer={viewer}
      posts={posts}
      likedPosts={likedPosts}
      followerCount={followerCount}
      following={following}
    />
  );
}
