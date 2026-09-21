import { redirect } from "next/navigation";
import { isCoverColor } from "@/features/posts/cover/cover-palette";
import { getAllTagNames, getOwnPost } from "@/features/posts/queries";
import { DesktopOnly } from "@/features/posts/components/DesktopOnly";
import { PostEditor } from "@/features/posts/components/PostEditor";
import { getViewer } from "@/lib/viewer";

export const maxDuration = 30;

export default async function EditorPage(props: PageProps<"/editor/[id]">) {
  const { id } = await props.params;
  const isNew = id === "new";

  const viewer = await getViewer();
  if (!viewer) {
    redirect("/login");
  }

  const [post, allTagNames] = await Promise.all([
    isNew
      ? Promise.resolve({
          id: "new",
          status: "draft",
          title: "",
          content: "",
          tags: [] as { id: string; name: string }[],
          rejection_reason: null,
          cover_image_url: null,
          cover_text: null,
          cover_color: null,
        })
      : getOwnPost(id),
    getAllTagNames(),
  ]);

  return (
    <DesktopOnly>
      <PostEditor
        postId={post.id}
        userId={viewer.id}
        status={post.status}
        initialTitle={post.title ?? ""}
        initialContent={post.content}
        initialTags={post.tags}
        initialCover={{
          imageUrl: post.cover_image_url,
          text: post.cover_text,
          color: isCoverColor(post.cover_color) ? post.cover_color : null,
        }}
        allTagNames={allTagNames}
        rejectionReason={post.rejection_reason}
      />
    </DesktopOnly>
  );
}
