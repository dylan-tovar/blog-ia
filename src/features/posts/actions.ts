"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { notifyFollowersOfNewArticle } from "@/features/subscriptions/notify-followers";
import { createCoverSchema } from "@/features/posts/cover/cover-schema";
import { MAX_TAGS_PER_POST } from "@/features/ai/constants";
import type { AiErrorKind } from "@/features/ai/errors";
import { generateStructured } from "@/features/ai/provider.server";
import { decideModeration, moderateArticle } from "@/features/ai/moderation";
import { checkAiRateLimit } from "@/features/ai/rate-limit.server";
import {
  createNoteSchema,
  feedQuerySchema,
  idSchema,
  savePostSchema,
  tagNameSchema,
} from "@/features/posts/schemas";
import { scan } from "@/features/moderation/scan";
import { getFeedPage, type FeedScope } from "@/features/posts/queries";
import { buildFinalUpdate, classifyPublishClaim } from "@/features/posts/publish";

export type CreateNoteState = { ok?: boolean; error?: string } | undefined;

export async function createNote(
  _prevState: CreateNoteState,
  formData: FormData,
): Promise<CreateNoteState> {
  const { supabase, user } = await requireUser();

  const rawParent = formData.get("parentPostId");
  const rawReplyTo = formData.get("replyToPostId");
  const parsed = createNoteSchema.safeParse({
    content: formData.get("content"),
    parentPostId: typeof rawParent === "string" && rawParent ? rawParent : undefined,
    replyToPostId: typeof rawReplyTo === "string" && rawReplyTo ? rawReplyTo : undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { content, parentPostId, replyToPostId } = parsed.data;

  const { error } = await supabase.from("posts").insert({
    author_id: user.id,
    type: "note",
    content,
    status: "published",
    published_at: new Date().toISOString(),
    parent_post_id: parentPostId ?? null,
    reply_to_post_id: replyToPostId ?? null,
  });

  if (error) {
    return { error: "No pudimos publicar la nota." };
  }

  revalidatePath("/");
  revalidatePath(`/author/${user.id}`);
  if (parentPostId) {
    revalidatePath(`/post/${parentPostId}`);
  }
  return { ok: true };
}

export async function deleteNote(postId: string): Promise<{ ok: boolean }> {
  if (!idSchema.safeParse(postId).success) {
    return { ok: false };
  }

  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("author_id", user.id)
    .eq("type", "note")
    .select("parent_post_id");

  if (error || !data || data.length === 0) {
    return { ok: false };
  }

  revalidatePath("/");
  revalidatePath(`/author/${user.id}`);
  revalidatePath(`/post/${postId}`);
  const parentPostId = data[0].parent_post_id;
  if (parentPostId) {
    revalidatePath(`/post/${parentPostId}`);
  }
  return { ok: true };
}

export async function updateNote(
  postId: string,
  content: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!idSchema.safeParse(postId).success) {
    return { ok: false, error: "ID inválido." };
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "La nota no puede estar vacía." };
  }
  if (trimmed.length > 500) {
    return { ok: false, error: "La nota no puede superar los 500 caracteres." };
  }

  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("posts")
    .update({ content: trimmed })
    .eq("id", postId)
    .eq("author_id", user.id)
    .eq("type", "note")
    .select("parent_post_id");

  if (error || !data || data.length === 0) {
    return { ok: false, error: "No pudimos actualizar la nota." };
  }

  revalidatePath("/");
  revalidatePath(`/author/${user.id}`);
  revalidatePath(`/post/${postId}`);
  const parentPostId = data[0].parent_post_id;
  if (parentPostId) {
    revalidatePath(`/post/${parentPostId}`);
  }
  return { ok: true };
}

export async function createDraftPost(input: {
  title: string;
  content: string;
}): Promise<{ ok: boolean; postId?: string }> {
  const parsed = savePostSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false };
  }

  const title = parsed.data.title ?? "";
  if (!title && !parsed.data.content.trim()) {
    return { ok: false };
  }

  const { supabase, user } = await requireUser();

  const { data: post, error } = await supabase
    .from("posts")
    .insert({
      author_id: user.id,
      type: "article",
      title: title || null,
      content: parsed.data.content,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !post) {
    return { ok: false };
  }

  revalidatePath("/posts");
  return { ok: true, postId: post.id };
}

export type SavePostResult = { ok: boolean };

export async function savePostContent(
  postId: string,
  input: { title: string; content: string },
): Promise<SavePostResult> {
  if (!idSchema.safeParse(postId).success) {
    return { ok: false };
  }

  const { supabase, user } = await requireUser();

  const parsed = savePostSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false };
  }

  const { error } = await supabase
    .from("posts")
    .update({
      title: parsed.data.title || null,
      content: parsed.data.content,
    })
    .eq("id", postId)
    .eq("author_id", user.id);

  return { ok: !error };
}

export type SaveCoverResult = { ok: true } | { ok: false; error: string };

// Written with the user client (column grant from migration 0009). It does not touch
// `updated_at` (the trigger only moves it on content changes), so it cannot disturb the
// publish compare-and-set, and it also works on already published articles.
export async function savePostCover(postId: string, input: unknown): Promise<SaveCoverResult> {
  if (!idSchema.safeParse(postId).success) {
    return { ok: false, error: "Post inválido." };
  }

  const { supabase, user } = await requireUser();

  const parsed = createCoverSchema({
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    userId: user.id,
  }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase
    .from("posts")
    .update({
      cover_image_url: parsed.data.imageUrl,
      cover_text: parsed.data.text,
      cover_color: parsed.data.color,
    })
    .eq("id", postId)
    .eq("author_id", user.id)
    .eq("type", "article")
    .select("id");

  if (error || !data?.length) {
    return { ok: false, error: "No pudimos guardar la portada." };
  }

  revalidatePath("/");
  revalidatePath("/explore");
  revalidatePath(`/author/${user.id}`);
  return { ok: true };
}

export type PublishPostResult =
  | { ok: true; status: "published"; aiTags: string[]; aiSkippedReason?: AiErrorKind }
  | { ok: true; status: "rejected"; reason: string }
  | { ok: true; status: "busy"; retryAfter: number }
  | { ok: false; error: string };

const PUBLISH_FAILED = "No pudimos publicar el artículo. Intentá de nuevo.";
const PUBLISH_IN_PROGRESS = "Este artículo ya se está revisando. Probá de nuevo en unos segundos.";
const PUBLISH_BLOCKED_BY_DICTIONARY =
  "El artículo contiene términos de odio o de amenaza a una persona. Revisalos en el editor para poder publicarlo.";
const PUBLISH_CHANGED = "El artículo cambió mientras lo revisábamos. Volvé a publicar.";

type SupabaseUserClient = Awaited<ReturnType<typeof createClient>>;

type AttachTagResult =
  | { ok: true; tag: { id: string; name: string } }
  | { ok: false; reason: "invalid" | "limit" | "failed" };

// DO NOTHING on conflict: a plain upsert would UPDATE an existing tag, and
// `tags` has no UPDATE policy, so reusing a tag would fail under RLS.
async function attachTag(
  supabase: SupabaseUserClient,
  postId: string,
  rawName: string,
): Promise<AttachTagResult> {
  const parsed = tagNameSchema.safeParse(rawName);
  if (!parsed.success) {
    return { ok: false, reason: "invalid" };
  }

  const { count } = await supabase
    .from("post_tags")
    .select("tag_id", { count: "exact", head: true })
    .eq("post_id", postId);

  if ((count ?? 0) >= MAX_TAGS_PER_POST) {
    return { ok: false, reason: "limit" };
  }

  await supabase
    .from("tags")
    .upsert({ name: parsed.data }, { onConflict: "name", ignoreDuplicates: true });

  const { data: tag } = await supabase
    .from("tags")
    .select("id, name")
    .eq("name", parsed.data)
    .maybeSingle();

  if (!tag) {
    return { ok: false, reason: "failed" };
  }

  const { error } = await supabase
    .from("post_tags")
    .upsert(
      { post_id: postId, tag_id: tag.id },
      { onConflict: "post_id,tag_id", ignoreDuplicates: true },
    );

  return error ? { ok: false, reason: "failed" } : { ok: true, tag };
}

// Moderation + auto-tagging (PRD 5 §3.4). `status`, `published_at` and `rejection_reason`
// are not writable by the browser client (migration 0007), so the transitions go through
// the admin client AFTER the user-client read has proved the caller owns an article.
//
// The claim is a real compare-and-set on (status, updated_at): `updated_at` is the time of
// the last content change (trigger), so two concurrent calls cannot both claim the post and
// content edited after the moderator read it can never be published unreviewed.
export async function publishPost(postId: string): Promise<PublishPostResult> {
  if (!idSchema.safeParse(postId).success) {
    return { ok: false, error: "Post inválido." };
  }

  const { supabase, user } = await requireUser();

  try {
    const { data: post } = await supabase
      .from("posts")
      .select("id, title, content, status, updated_at, post_tags(tags(name))")
      .eq("id", postId)
      .eq("author_id", user.id)
      .eq("type", "article")
      .maybeSingle();

    if (!post) {
      return { ok: false, error: "No encontramos el artículo." };
    }
    if (post.status === "published") {
      return { ok: false, error: "Este artículo ya está publicado." };
    }

    const claim = classifyPublishClaim(post.status, post.updated_at, Date.now());
    if (claim === "invalid") {
      return { ok: false, error: PUBLISH_FAILED };
    }
    if (claim === "in_progress") {
      return { ok: false, error: PUBLISH_IN_PROGRESS };
    }
    if (!post.content.trim()) {
      return { ok: false, error: "El artículo no puede estar vacío para publicarlo." };
    }

    // El diccionario se revisa antes de reclamar el artículo y antes de gastar una
    // llamada a la IA: es determinista, no cuesta cuota y evita dejar un reclamo
    // colgado. El editor ya deshabilita el botón, pero eso es interfaz: la regla
    // vale acá, como el resto de las que protegen la publicación (ADR 0012).
    if (scan(`${post.title ?? ""}\n\n${post.content}`).blocked) {
      return { ok: false, error: PUBLISH_BLOCKED_BY_DICTIONARY };
    }

    const existingTags = (post.post_tags ?? []).flatMap((link) => (link.tags ? [link.tags.name] : []));
    const previousStatus = post.status === "rejected" ? "rejected" : "draft";

    const admin = createAdminClient();
    const claimedAt = new Date().toISOString();
    const claimed = await admin
      .from("posts")
      .update({ status: "pending_review", updated_at: claimedAt })
      .eq("id", post.id)
      .eq("author_id", user.id)
      .eq("status", post.status)
      .eq("updated_at", post.updated_at)
      .select("id");

    if (claimed.error) {
      return { ok: false, error: PUBLISH_FAILED };
    }
    if (!claimed.data?.length) {
      return { ok: false, error: PUBLISH_IN_PROGRESS };
    }

    const releaseClaim = () =>
      admin
        .from("posts")
        .update({ status: previousStatus })
        .eq("id", post.id)
        .eq("author_id", user.id)
        .eq("status", "pending_review");

    const outcome = await moderateArticle({
      content: post.content,
      generate: generateStructured,
      rateLimit: () => checkAiRateLimit(user.id, "moderation"),
    });
    const decision = decideModeration(outcome, existingTags);

    // A rate limit must never publish unreviewed content: the claim is released so the
    // author can retry once the window resets.
    if (decision.status === "pending") {
      await releaseClaim();
      return { ok: true, status: "busy", retryAfter: decision.retryAfter };
    }

    // Guarded by the claim version: an edit made during the review changes `updated_at`
    // (trigger), so the moderated text is never swapped for unmoderated text.
    const finished = await admin
      .from("posts")
      .update(buildFinalUpdate(decision, new Date().toISOString()))
      .eq("id", post.id)
      .eq("author_id", user.id)
      .eq("status", "pending_review")
      .eq("updated_at", claimedAt)
      .select("id");

    if (finished.error || !finished.data?.length) {
      await releaseClaim();
      return { ok: false, error: finished.error ? PUBLISH_FAILED : PUBLISH_CHANGED };
    }

    const aiTags: string[] = [];
    if (decision.status === "published") {
      for (const name of decision.tags) {
        const attached = await attachTag(supabase, post.id, name);
        if (attached.ok) {
          aiTags.push(attached.tag.name);
        }
      }
    }

    revalidatePath("/");
    revalidatePath("/posts");
    revalidatePath(`/post/${post.id}`);
    revalidatePath(`/editor/${post.id}`);
    revalidatePath(`/author/${user.id}`);

    if (decision.status === "rejected") {
      return { ok: true, status: "rejected", reason: decision.reason };
    }

    // after(), not a bare void: on serverless a fire-and-forget promise can
    // be cut off as soon as the response is sent, while after() runs it to
    // completion without delaying that response. Sync/best-effort by design
    // (no queue) — see ADR-0028.
    after(() =>
      notifyFollowersOfNewArticle({ authorId: user.id, postId: post.id }).catch((error) =>
        console.error("[new-article-email] fanout failed", error),
      ),
    );

    return {
      ok: true,
      status: "published",
      aiTags,
      ...(decision.aiSkippedReason ? { aiSkippedReason: decision.aiSkippedReason } : {}),
    };
  } catch (error) {
    console.error("[publish] failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: PUBLISH_FAILED };
  }
}

export type TagResult = { ok: boolean; tag?: { id: string; name: string }; error?: string };

export async function addTag(postId: string, rawName: string): Promise<TagResult> {
  if (!idSchema.safeParse(postId).success) {
    return { ok: false };
  }

  const { supabase } = await requireUser();

  const attached = await attachTag(supabase, postId, rawName);
  if (attached.ok) {
    return { ok: true, tag: attached.tag };
  }

  return {
    ok: false,
    ...(attached.reason === "limit"
      ? { error: `Un artículo puede tener hasta ${MAX_TAGS_PER_POST} tags.` }
      : {}),
  };
}

export async function removeTag(postId: string, tagId: string): Promise<{ ok: boolean }> {
  if (!idSchema.safeParse(postId).success || !idSchema.safeParse(tagId).success) {
    return { ok: false };
  }

  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("post_tags")
    .delete()
    .eq("post_id", postId)
    .eq("tag_id", tagId);

  return { ok: !error };
}

export async function loadMoreFeed(input: {
  tag?: string;
  offset: number;
  scope?: FeedScope;
}) {
  const parsed = feedQuerySchema.safeParse(input);
  if (!parsed.success) {
    return { posts: [], hasMore: false };
  }

  return getFeedPage(parsed.data);
}

export async function recordRead(postId: string): Promise<{ ok: boolean }> {
  if (!idSchema.safeParse(postId).success) {
    return { ok: false };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false };
    }

    const { error } = await supabase
      .from("reading_history")
      .upsert(
        { user_id: user.id, post_id: postId, read_at: new Date().toISOString() },
        { onConflict: "user_id,post_id" },
      );

    return { ok: !error };
  } catch {
    // Best effort: a failed read log must never affect reading the post.
    return { ok: false };
  }
}
