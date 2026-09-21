import { getAllTagNames, getOwnPost } from "@/features/posts/queries";
import { DesktopOnly } from "@/features/posts/components/DesktopOnly";
import { PostEditor } from "@/features/posts/components/PostEditor";

export const maxDuration = 30;

export default async function EditorPage(props: PageProps<"/editor/[id]">) {
  const { id } = await props.params;
  const isNew = id === "new";

  const [post, allTagNames] = await Promise.all([
    isNew
      ? Promise.resolve({
          id: "new",
          status: "draft",
          title: "",
          content: "",
          tags: [] as { id: string; name: string }[],
          rejection_reason: null,
        })
      : getOwnPost(id),
    getAllTagNames(),
  ]);

  return (
    <DesktopOnly>
      <PostEditor
        postId={post.id}
        status={post.status}
        initialTitle={post.title ?? ""}
        initialContent={post.content}
        initialTags={post.tags}
        allTagNames={allTagNames}
        rejectionReason={post.rejection_reason}
      />
    </DesktopOnly>
  );
}
