import { getViewer } from "@/lib/viewer";
import { getLikedPostsByUser, getPublishedPostsByAuthor } from "@/features/posts/queries";
import { getPublicProfileByUsername } from "@/features/profile/queries";
import { getFollowerCount, getSubscribers, getSubscriptions, isFollowing } from "@/features/subscriptions/queries";
import { AuthorProfileView } from "@/features/profile/components/AuthorProfileView";

export default async function AuthorPage(props: PageProps<"/[username]">) {
  const { username } = await props.params;
  const profile = await getPublicProfileByUsername(username);
  const viewer = await getViewer();

  const [posts, likedPosts, followerCount, following, subscribers, subscriptions] = await Promise.all([
    getPublishedPostsByAuthor(profile.id),
    getLikedPostsByUser(profile.id),
    getFollowerCount(profile.id),
    viewer && viewer.id !== profile.id
      ? isFollowing(viewer.id, profile.id)
      : Promise.resolve(false),
    getSubscribers(profile.id, viewer?.id),
    getSubscriptions(profile.id, viewer?.id),
  ]);

  return (
    <AuthorProfileView
      profile={profile}
      viewer={viewer}
      posts={posts}
      likedPosts={likedPosts}
      followerCount={followerCount}
      following={following}
      subscribers={subscribers}
      subscriptions={subscriptions}
    />
  );
}
