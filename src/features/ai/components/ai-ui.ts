import { MIN_WORDS_SCORE, MIN_WORDS_TITLES, MIN_WORDS_TONE, TITLES_COUNT } from "@/features/ai/constants";
import type { Tone } from "@/features/ai/schemas";
import type { AiErrorKind, RateLimitScope } from "@/features/ai/errors";
import { POST_CONTENT_MAX_LENGTH } from "@/features/posts/constants";

export const TONE_LABELS: Record<Tone, string> = {
  informal: "Informal",
  formal: "Formal",
  investigacion: "Investigación",
};

// "aborted": the caller cancelled (closed the dialog, unmounted) — nothing to show.
// "superseded": another AI action took over the single in-flight slot — must be explained.
export type ClientAiError = {
  kind: AiErrorKind | "aborted" | "superseded";
  message: string;
  retryAfter?: number;
  scope?: RateLimitScope;
};

export const SUPERSEDED_MESSAGE = "Se canceló porque iniciaste otra acción de IA. Reintentá.";
export const OUTLINE_TOO_LONG_MESSAGE =
  "La estructura no entra: el artículo superaría el límite de longitud. Acortá el texto e intentá de nuevo.";
export const REWRITE_TOO_LONG_MESSAGE =
  "La versión reescrita supera el límite de longitud del artículo, así que no se puede reemplazar.";
export const CONTENT_TOO_LONG_MESSAGE =
  "El artículo es demasiado largo para guardarlo. Acortalo e intentá de nuevo.";

// `ensurePostId` returns null both for "nothing written yet" and "too long to save"; only
// the first is fixed by writing more, so tell them apart.
export function noPostIdError(content: string, fallback: ClientAiError): ClientAiError {
  return content.length > POST_CONTENT_MAX_LENGTH
    ? { kind: "input_too_long", message: CONTENT_TOO_LONG_MESSAGE }
    : fallback;
}

export type OutlineSection = { title: string; subsections: string[] };
export type Suggestion = { type: "claridad" | "seo" | "engagement"; text: string };

function singleLine(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function stripHeadingMarks(text: string) {
  return singleLine(text.replace(/^\s*#+\s*/, "").replace(/\s#+\s/g, " "));
}

// Only `##` and `###`: the editor has no H1 (the title is a separate field) and markdown
// cannot represent an empty paragraph, so each heading is separated by a blank line and the
// author presses Enter under it to start writing.
export function outlineToMarkdown(sections: OutlineSection[]) {
  const blocks: string[] = [];

  for (const section of sections) {
    const title = stripHeadingMarks(section.title);
    if (!title) continue;

    blocks.push(`## ${title}`);
    for (const subsection of section.subsections) {
      const text = stripHeadingMarks(subsection);
      if (text) blocks.push(`### ${text}`);
    }
  }

  return blocks.length === 0 ? "" : `${blocks.join("\n\n")}\n`;
}

const LIST_PREFIX = /^\s*(?:\d+[.)]|[-*•])\s+/;
const WRAPPING_QUOTES = /^["'“”«»]+|["'“”«»]+$/g;

export function cleanTitles(titles: string[], max: number = TITLES_COUNT) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of titles) {
    const title = singleLine(singleLine(raw).replace(LIST_PREFIX, "").replace(WRAPPING_QUOTES, ""));
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;

    seen.add(key);
    result.push(title);
    if (result.length === max) break;
  }

  return result;
}

export function formatRetry(seconds: number) {
  const total = Math.max(1, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;

  if (minutes === 0) return `${rest} s`;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

export function describeAiError(error: ClientAiError, secondsLeft?: number) {
  if (error.kind === "aborted") return "";
  if (error.kind === "superseded") return SUPERSEDED_MESSAGE;

  if (error.kind === "rate_limited" && secondsLeft !== undefined) {
    if (secondsLeft <= 0) return "Ya podés intentar de nuevo.";
    return error.scope === "global"
      ? `La IA está saturada en este momento, probá en ${formatRetry(secondsLeft)}.`
      : `Estás generando muy rápido, esperá ${formatRetry(secondsLeft)}.`;
  }

  return error.message;
}

type GatedFeature = "outline" | "titles" | "tone" | "score";

const MIN_WORDS: Record<GatedFeature, number> = {
  outline: 0,
  titles: MIN_WORDS_TITLES,
  tone: MIN_WORDS_TONE,
  score: MIN_WORDS_SCORE,
};

export function featureAvailability(
  feature: GatedFeature,
  words: number,
): { ok: true } | { ok: false; hint: string } {
  const min = MIN_WORDS[feature];
  if (words >= min) return { ok: true };
  return { ok: false, hint: `Escribí al menos ${min} palabras (tenés ${words}).` };
}

const SUGGESTION_ORDER: { type: Suggestion["type"]; label: string }[] = [
  { type: "claridad", label: "Claridad" },
  { type: "seo", label: "SEO" },
  { type: "engagement", label: "Engagement" },
];

export function groupSuggestions(suggestions: Suggestion[]) {
  return SUGGESTION_ORDER.flatMap(({ type, label }) => {
    const items = suggestions.filter((suggestion) => suggestion.type === type).map(({ text }) => text);
    return items.length > 0 ? [{ type, label, items }] : [];
  });
}

export function scoreBand(score: number): "low" | "medium" | "high" {
  if (score < 40) return "low";
  return score < 70 ? "medium" : "high";
}
