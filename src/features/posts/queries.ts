import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { countWords } from "@/features/ai/words";
import { idSchema } from "@/features/posts/schemas";
import { excerpt, flattenTags, type ParentRef } from "@/features/posts/utils";
import { getFollowedAuthorIds } from "@/features/subscriptions/queries";
import { getLikedPostIds } from "@/features/likes/queries";
import { getViewer } from "@/lib/viewer";
import type { PostType } from "@/lib/supabase/database.types";

const POST_COLUMNS =
  "id, author_id, title, content, status, rejection_reason, created_at, updated_at, published_at";
const TAGS_EMBED = "tags:post_tags(tag:tags(id, name))";
const CARD_COLUMNS = "id, type, title, content, published_at, parent_post_id";
export const AUTHOR_EMBED = "author:profiles(id, display_name)";
const LIKES_EMBED = "likes(count)";

export const FEED_PAGE_SIZE = 20;
const AUTHOR_POSTS_LIMIT = 50;
const NOTES_PER_POST_LIMIT = 100;

type FeedAuthor = { id: string; display_name: string } | null;

type FeedPostBase = {
  id: string;
  publishedAt: string | null;
  author: FeedAuthor;
  viewerFollows: boolean;
  likeCount: number;
  viewerLiked: boolean;
  notesCount: number;
};

export type ArticleFeedPost = FeedPostBase & {
  type: "article";
  title: string | null;
  excerpt: string;
};

export type NoteFeedPost = FeedPostBase & {
  type: "note";
  content: string;
  parent: ParentRef | null;
};

export type FeedPost = ArticleFeedPost | NoteFeedPost;

type CardRow = {
  id: string;
  type: PostType;
  title: string | null;
  content: string;
  published_at: string | null;
  parent_post_id: string | null;
  author: FeedAuthor;
  likes: { count: number }[] | null;
};

type HydrationContext = {
  followed: Set<string>;
  liked: Set<string>;
  parents: Map<string, ParentRef>;
  notesCounts: Map<string, number>;
};

function toFeedPost(row: CardRow, ctx: HydrationContext): FeedPost {
  const base: FeedPostBase = {
    id: row.id,
    publishedAt: row.published_at,
    author: row.author,
    viewerFollows: row.author ? ctx.followed.has(row.author.id) : false,
    likeCount: row.likes?.[0]?.count ?? 0,
    viewerLiked: ctx.liked.has(row.id),
    notesCount: ctx.notesCounts.get(row.id) ?? 0,
  };

  if (row.type === "note") {
    return {
      ...base,
      type: "note",
      content: row.content,
      parent: row.parent_post_id ? (ctx.parents.get(row.parent_post_id) ?? null) : null,
    };
  }

  return { ...base, type: "article", title: row.title, excerpt: excerpt(row.content) };
}

async function getNotesCounts(postIds: string[]) {
  const ids = [...new Set(postIds)];
  const counts = new Map<string, number>();
  if (ids.length === 0) {
    return counts;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select("parent_post_id")
    .in("parent_post_id", ids)
    .eq("type", "note")
    .eq("status", "published");

  if (error) {
    throw new Error(`No pudimos contar las notas: ${error.message}`);
  }

  for (const row of data ?? []) {
    if (row.parent_post_id) {
      counts.set(row.parent_post_id, (counts.get(row.parent_post_id) ?? 0) + 1);
    }
  }
  return counts;
}

async function getParentRefs(parentIds: string[]) {
  const ids = [...new Set(parentIds)];
  const parents = new Map<string, ParentRef>();
  if (ids.length === 0) {
    return parents;
  }

  // A deleted or non-published parent simply won't come back, so the reply
  // loses its reference without failing.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select("id, type, title, author:profiles(display_name)")
    .in("id", ids)
    .eq("status", "published");

  if (error) {
    throw new Error(`No pudimos leer los posts originales: ${error.message}`);
  }

  for (const row of (data ?? []) as unknown as ParentRef[]) {
    parents.set(row.id, row);
  }
  return parents;
}

async function hydrateFeedPosts(rows: CardRow[], { withFollows }: { withFollows: boolean }) {
  const viewer = await getViewer();
  const authorIds = [
    ...new Set(rows.flatMap((row) => (row.author ? [row.author.id] : []))),
  ];

  const [followedIds, likedIds, parents, notesCounts] = await Promise.all([
    withFollows && viewer ? getFollowedAuthorIds(viewer.id, authorIds) : [],
    viewer ? getLikedPostIds(viewer.id, rows.map((row) => row.id)) : [],
    getParentRefs(rows.flatMap((row) => (row.parent_post_id ? [row.parent_post_id] : []))),
    getNotesCounts(rows.map((row) => row.id)),
  ]);

  const ctx: HydrationContext = {
    followed: new Set(followedIds),
    liked: new Set(likedIds),
    parents,
    notesCounts,
  };
  return rows.map((row) => toFeedPost(row, ctx));
}

export async function getOwnPost(id: string) {
  if (!idSchema.safeParse(id).success) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: post } = await supabase
    .from("posts")
    .select(`${POST_COLUMNS}, ${TAGS_EMBED}`)
    .eq("id", id)
    .eq("author_id", user.id)
    .eq("type", "article")
    .maybeSingle();

  if (!post) {
    notFound();
  }

  return flattenTags(post);
}

export async function getOwnPosts() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: posts } = await supabase
    .from("posts")
    .select("id, title, content, status, updated_at, rejection_reason")
    .eq("author_id", user.id)
    .eq("type", "article")
    .order("updated_at", { ascending: false });

  if (!posts) {
    return [];
  }

  // Purge any empty ghost drafts so they don't pollute the drafts list
  const emptyDraftIds = posts
    .filter(
      (p) =>
        p.status === "draft" &&
        (!p.title || !p.title.trim()) &&
        (!p.content || !p.content.trim())
    )
    .map((p) => p.id);

  if (emptyDraftIds.length > 0) {
    await supabase.from("posts").delete().in("id", emptyDraftIds);
  }

  return posts.filter((p) => !emptyDraftIds.includes(p.id));
}

export async function getPublishedPost(id: string) {
  if (!idSchema.safeParse(id).success) {
    notFound();
  }

  const supabase = await createClient();

  const { data: post } = await supabase
    .from("posts")
    .select(
      `id, type, title, content, status, created_at, updated_at, published_at, parent_post_id, ai_generated_summary, ${AUTHOR_EMBED}, ${LIKES_EMBED}`,
    )
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (!post) {
    notFound();
  }

  const viewer = await getViewer();
  const [likedIds, parents, notesCounts] = await Promise.all([
    viewer ? getLikedPostIds(viewer.id, [post.id]) : [],
    getParentRefs(post.parent_post_id ? [post.parent_post_id] : []),
    getNotesCounts([post.id]),
  ]);

  const { likes, ...rest } = post;
  return {
    ...rest,
    likeCount: likes?.[0]?.count ?? 0,
    viewerLiked: likedIds.length > 0,
    notesCount: notesCounts.get(post.id) ?? 0,
    parent: post.parent_post_id ? (parents.get(post.parent_post_id) ?? null) : null,
    wordCount: post.type === "article" ? countWords(post.content) : 0,
  };
}

export async function getNotesForPost(postId: string) {
  if (!idSchema.safeParse(postId).success) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(`${CARD_COLUMNS}, ${AUTHOR_EMBED}, ${LIKES_EMBED}`)
    .eq("parent_post_id", postId)
    .eq("type", "note")
    .eq("status", "published")
    .order("published_at", { ascending: true })
    .order("id")
    .limit(NOTES_PER_POST_LIMIT);

  if (error) {
    throw new Error(`No pudimos cargar las notas: ${error.message}`);
  }

  const posts = await hydrateFeedPosts((data ?? []) as unknown as CardRow[], {
    withFollows: false,
  });
  return posts.filter((post): post is NoteFeedPost => post.type === "note");
}

export async function getFeedPage({
  tag,
  offset = 0,
}: {
  tag?: string;
  offset?: number;
}) {
  const supabase = await createClient();

  // RLS also lets owners read their own drafts, so `published` must be explicit.
  // Tags are only used to filter: they are never selected for display.
  const filterEmbed = tag ? ", post_tags!inner(tags!inner(name))" : "";
  let query = supabase
    .from("posts")
    .select(`${CARD_COLUMNS}, ${AUTHOR_EMBED}, ${LIKES_EMBED}${filterEmbed}`)
    .eq("status", "published");

  if (tag) {
    query = query.eq("post_tags.tags.name", tag);
  }

  const { data, error } = await query
    .order("published_at", { ascending: false })
    .order("id")
    .range(offset, offset + FEED_PAGE_SIZE);

  if (error) {
    throw new Error(`No pudimos cargar el feed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as CardRow[];
  const pageRows = rows.slice(0, FEED_PAGE_SIZE);

  return {
    posts: await hydrateFeedPosts(pageRows, { withFollows: true }),
    hasMore: rows.length > FEED_PAGE_SIZE,
  };
}

export async function getPublishedPostsByAuthor(authorId: string) {
  if (!idSchema.safeParse(authorId).success) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(`${CARD_COLUMNS}, ${AUTHOR_EMBED}, ${LIKES_EMBED}`)
    .eq("author_id", authorId)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .order("id")
    .limit(AUTHOR_POSTS_LIMIT);

  if (error) {
    throw new Error(`No pudimos cargar los posts del autor: ${error.message}`);
  }

  return hydrateFeedPosts((data ?? []) as unknown as CardRow[], { withFollows: false });
}

export async function getLikedPostsByUser(userId: string) {
  if (!idSchema.safeParse(userId).success) {
    return [];
  }

  const supabase = await createClient();
  const { data: likesData, error: likesError } = await supabase
    .from("likes")
    .select("post_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(AUTHOR_POSTS_LIMIT);

  if (likesError) {
    throw new Error(`No pudimos cargar los me gusta del usuario: ${likesError.message}`);
  }

  const postIds = (likesData ?? []).map((row) => row.post_id);
  if (postIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("posts")
    .select(`${CARD_COLUMNS}, ${AUTHOR_EMBED}, ${LIKES_EMBED}`)
    .in("id", postIds)
    .eq("status", "published");

  if (error) {
    throw new Error(`No pudimos cargar los posts: ${error.message}`);
  }

  const posts = await hydrateFeedPosts((data ?? []) as unknown as CardRow[], {
    withFollows: false,
  });
  const postsMap = new Map(posts.map((p) => [p.id, p]));
  return postIds.map((id) => postsMap.get(id)).filter((p): p is FeedPost => Boolean(p));
}

export async function getAllTagNames() {
  const supabase = await createClient();
  const { data: tags } = await supabase.from("tags").select("name").order("name");
  return tags?.map((tag) => tag.name) ?? [];
}
