import { IMAGE_ACCEPTED_TYPES } from "@/features/posts/images/image-limits";
import {
  MAX_MODERATION_IMAGES,
  MAX_TAGS_PER_POST,
  MODERATION_IMAGE_FETCH_TIMEOUT_MS,
  MODERATION_TIMEOUT_MS,
} from "./constants";
import { AiError, mapGeminiError, type AiErrorKind } from "./errors";
import { buildModerationPrompt, type LabeledImage } from "./prompts";
import { rateLimitToAiError, type RateLimitResult } from "./rate-limit";
import { moderationSchema, normalizeAiTags, truncateReason, type Moderation } from "./schemas";
import type { GenerateStructured } from "./types";

export const GENERIC_REJECTION_REASON = "El contenido no cumple las normas de la comunidad.";
export const GENERIC_BLOCKED_REASON = "El contenido fue bloqueado por los filtros de seguridad.";

export type ModerationOutcome =
  | { kind: "result"; result: Moderation }
  | { kind: "error"; error: AiError };

export type ModerationDecision =
  | { status: "published"; tags: string[]; aiSkippedReason?: AiErrorKind }
  | { status: "rejected"; reason: string }
  | { status: "pending"; retryAfter: number };

const normalizeTag = (tag: string) => tag.trim().toLowerCase();

// Existing tags always win and are never dropped; suggestions fill the remaining slots.
export function mergeTags(existing: string[], suggested: string[], max: number): string[] {
  const merged = new Set(existing.map(normalizeTag).filter(Boolean));

  for (const tag of suggested.map(normalizeTag)) {
    if (merged.size >= max) break;
    if (tag) merged.add(tag);
  }

  return [...merged];
}

// Provider failures (timeout, outage, quota, unusable output) publish without AI tags
// (PRD 5 §3.4): an outage must never stop an author from publishing. Two failures are not
// outages: a safety block means the content itself tripped the filters (rejected), and a
// rate limit is a state an attacker can drive on purpose, so failing open would let anyone
// skip moderation by exhausting it — the post stays pending and the author retries.
export function decideModeration(outcome: ModerationOutcome, existingTags: string[] = []): ModerationDecision {
  if (outcome.kind === "error") {
    if (outcome.error.kind === "blocked") {
      return { status: "rejected", reason: GENERIC_BLOCKED_REASON };
    }
    if (outcome.error.kind === "rate_limited") {
      return { status: "pending", retryAfter: Math.max(1, Math.ceil(outcome.error.retryAfter ?? 1)) };
    }
    return { status: "published", tags: [], aiSkippedReason: outcome.error.kind };
  }

  const { result } = outcome;
  if (!result.is_appropriate) {
    return { status: "rejected", reason: truncateReason(result.reason) || GENERIC_REJECTION_REASON };
  }

  const existing = new Set(existingTags.map(normalizeTag));
  const merged = mergeTags(existingTags, normalizeAiTags(result.suggested_tags), MAX_TAGS_PER_POST);

  return { status: "published", tags: merged.filter((tag) => !existing.has(tag)) };
}

// Una URL de imagen para moderar, ya etiquetada por quien arma la lista (publishPost
// sabe cuál es la portada y cuáles son del cuerpo; acá no hace falta adivinarlo).
export type ModerationImage = { url: string; label: string };

const ACCEPTED_MIME_TYPES: readonly string[] = IMAGE_ACCEPTED_TYPES;

// Baja y codifica una imagen para mandarla al modelo. Un tipo de contenido no permitido
// se descarta sin abortar las demás (no es un error, es una imagen que no corresponde
// revisar); cualquier otra falla (red, timeout, status no ok) se propaga como AiError
// "unavailable", el mismo camino que ya existe para una caída del proveedor.
async function fetchModerationImage(image: ModerationImage, signal?: AbortSignal): Promise<LabeledImage | null> {
  const timeout = AbortSignal.timeout(MODERATION_IMAGE_FETCH_TIMEOUT_MS);
  const fetchSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(image.url, { signal: fetchSignal });
  } catch {
    throw new AiError("unavailable");
  }
  if (!response.ok) {
    throw new AiError("unavailable");
  }

  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!ACCEPTED_MIME_TYPES.includes(mimeType)) {
    console.info("[ai]", { feature: "moderation", skippedImage: image.label, reason: "unsupported_mime" });
    return null;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  return { label: image.label, part: { type: "image", mimeType, data: Buffer.from(bytes).toString("base64") } };
}

async function fetchModerationImages(images: ModerationImage[], signal?: AbortSignal): Promise<LabeledImage[]> {
  const bounded = images.slice(0, MAX_MODERATION_IMAGES);
  const fetched = await Promise.all(bounded.map((image) => fetchModerationImage(image, signal)));
  return fetched.filter((image): image is LabeledImage => image !== null);
}

export async function moderateArticle({
  title,
  content,
  images = [],
  generate,
  rateLimit,
  signal,
}: {
  title: string;
  content: string;
  images?: ModerationImage[];
  generate: GenerateStructured;
  rateLimit: () => Promise<RateLimitResult>;
  signal?: AbortSignal;
}): Promise<ModerationOutcome> {
  const limit = await rateLimit();
  if (!limit.ok) {
    return { kind: "error", error: rateLimitToAiError(limit) };
  }

  try {
    const labeledImages = await fetchModerationImages(images, signal);
    const { systemInstruction, contents } = buildModerationPrompt(title, content, labeledImages);
    const result = await generate({
      feature: "moderation",
      system: systemInstruction,
      contents,
      schema: moderationSchema,
      timeoutMs: MODERATION_TIMEOUT_MS,
      signal,
    });

    return { kind: "result", result };
  } catch (error) {
    return { kind: "error", error: mapGeminiError(error) };
  }
}
