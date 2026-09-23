import type { ModerationDecision, ModerationImage } from "@/features/ai/moderation";
import { extractImageUrls } from "@/features/posts/cover/cover";
import type { PostStatus } from "@/lib/supabase/database.types";

// A publish attempt claims the post by moving it to `pending_review`. Only draft/rejected
// posts can be claimed; a `pending_review` post is being reviewed by another request unless
// that review was interrupted long ago, in which case it can be claimed again.
export const CLAIMABLE_STATUSES: readonly PostStatus[] = ["draft", "rejected"];
export const PENDING_REVIEW_STALE_MS = 2 * 60 * 1000;

export type PublishClaim = "claim" | "in_progress" | "invalid";

export function classifyPublishClaim(status: string, updatedAtIso: string, nowMs: number): PublishClaim {
  if ((CLAIMABLE_STATUSES as readonly string[]).includes(status)) {
    return "claim";
  }
  if (status !== "pending_review") {
    return "invalid";
  }

  const updatedAt = Date.parse(updatedAtIso);
  return !Number.isNaN(updatedAt) && nowMs - updatedAt > PENDING_REVIEW_STALE_MS ? "claim" : "in_progress";
}

export function staleReviewCutoffIso(nowMs: number) {
  return new Date(nowMs - PENDING_REVIEW_STALE_MS).toISOString();
}

// La portada va primero (si existe), después las del cuerpo en el orden en que
// aparecen; si la portada también está insertada en el cuerpo no se manda dos veces.
export function buildModerationImages(
  coverImageUrl: string | null,
  content: string,
  supabaseUrl: string,
): ModerationImage[] {
  const bodyUrls = extractImageUrls(content, supabaseUrl).filter((url) => url !== coverImageUrl);

  const images: ModerationImage[] = [];
  if (coverImageUrl) images.push({ url: coverImageUrl, label: "la portada" });
  bodyUrls.forEach((url, index) => images.push({ url, label: `la imagen ${index + 1} del cuerpo` }));

  return images;
}

export function buildFinalUpdate(decision: ModerationDecision, nowIso: string) {
  if (decision.status === "rejected") {
    return { status: "rejected" as const, rejection_reason: decision.reason };
  }

  return { status: "published" as const, published_at: nowIso, rejection_reason: null };
}
