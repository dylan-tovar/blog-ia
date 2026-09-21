import Link from "next/link";
import { formatShortDate } from "@/lib/format";
import { PostStatusBadge } from "@/features/posts/components/PostStatusBadge";
import { getOwnPosts } from "@/features/posts/queries";

export default async function PostsPage() {
  const posts = await getOwnPosts();

  return (
    <>
      <h1 className="sr-only">Mis posts</h1>

      {posts.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Todavía no creaste ningún post. Tocá + para empezar.
        </p>
      ) : (
        <ul className="flex flex-col">
          {posts.map((post) => (
            <li key={post.id} className="border-b">
              <Link
                href={`/editor/${post.id}`}
                className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {post.title || "Sin título"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Actualizado el{" "}
                    <time dateTime={post.updated_at} suppressHydrationWarning>
                      {formatShortDate(post.updated_at)}
                    </time>
                  </p>
                </div>
                <PostStatusBadge status={post.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
