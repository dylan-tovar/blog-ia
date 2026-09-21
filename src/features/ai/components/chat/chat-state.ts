import { trimChatHistory } from "@/features/ai/chat-history";
import { SYSTEM_STEP_IDS } from "@/features/ai/constants";
import type { ArticleAnalysis, ChatStep, EditAction } from "@/features/ai/schemas";
import type { ChatMessage } from "@/features/ai/types";
import type { UndoToken } from "@/features/posts/components/editor/apply-action";
import { findOverlap } from "@/features/posts/components/editor/action-overlap";
import type { EditorSnapshot } from "@/features/posts/components/editor/editor-context";
import type { AiResult } from "../ai-client";
import type { ClientAiError } from "../ai-ui";

export type InsertTarget = "cursor" | "end";

export type ActionStatus = "pending" | "applied" | "discarded" | "stale" | "error";

export type ActionState = {
  id: string;
  action: EditAction;
  // The editor state the answer was based on: what the resolver compares against and what the card previews.
  snapshot: EditorSnapshot;
  status: ActionStatus;
  undo?: UndoToken;
  // Id of an earlier proposal of the same reply that it collides with (see `findOverlap`).
  overlapsWith?: string;
  // Why the action is stale or failed, or why it could not be undone. Shown on the card.
  notice?: string;
};

export type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  streaming?: boolean;
  error?: ClientAiError;
  actions?: ActionState[];
  steps?: ChatStep[];
  analysis?: ArticleAnalysis;
};

export function setAnalysis(entries: ChatEntry[], id: string, analysis: ArticleAnalysis): ChatEntry[] {
  return updateEntry(entries, id, (entry) => ({ ...entry, analysis }));
}

function updateEntry(entries: ChatEntry[], id: string, update: (entry: ChatEntry) => ChatEntry): ChatEntry[] {
  return entries.map((entry) => (entry.id === id ? update(entry) : entry));
}

function updateAction(entries: ChatEntry[], replyId: string, actionId: string, update: (state: ActionState) => ActionState) {
  return updateEntry(entries, replyId, (entry) => ({
    ...entry,
    actions: entry.actions?.map((state) => (state.id === actionId ? update(state) : state)),
  }));
}

export function addAction(entries: ChatEntry[], replyId: string, action: EditAction, snapshot: EditorSnapshot): ChatEntry[] {
  return updateEntry(entries, replyId, (entry) => {
    const actions = entry.actions ?? [];
    const overlapsWith = findOverlap(action, actions, snapshot) ?? undefined;
    return {
      ...entry,
      actions: [...actions, { id: `${replyId}-a${actions.length + 1}`, action, snapshot, status: "pending", ...(overlapsWith ? { overlapsWith } : {}) }],
    };
  });
}

export function upsertStep(entries: ChatEntry[], replyId: string, step: ChatStep): ChatEntry[] {
  return updateEntry(entries, replyId, (entry) => {
    const steps = entry.steps ?? [];
    return { ...entry, steps: steps.some(({ id }) => id === step.id) ? steps.map((item) => (item.id === step.id ? step : item)) : [...steps, step] };
  });
}

export function markApplied(entries: ChatEntry[], replyId: string, actionId: string, undo: UndoToken) {
  return updateAction(entries, replyId, actionId, (state) => ({ ...state, status: "applied", undo, notice: undefined }));
}

export function markDiscarded(entries: ChatEntry[], replyId: string, actionId: string) {
  const discarded = updateAction(entries, replyId, actionId, (state) => ({ ...state, status: "discarded" }));

  // Whatever collided with the discarded proposal no longer has anything to collide with.
  return updateEntry(discarded, replyId, (entry) => ({
    ...entry,
    actions: entry.actions?.map((state) => (state.overlapsWith === actionId ? { ...state, overlapsWith: undefined } : state)),
  }));
}

export function markStale(entries: ChatEntry[], replyId: string, actionId: string, notice: string) {
  return updateAction(entries, replyId, actionId, (state) => ({ ...state, status: "stale", notice }));
}

export function markError(entries: ChatEntry[], replyId: string, actionId: string, notice: string) {
  return updateAction(entries, replyId, actionId, (state) => ({ ...state, status: "error", notice }));
}

// Undone means it can be applied again (the resolver re-checks it against the document as it is then).
export function markUndone(entries: ChatEntry[], replyId: string, actionId: string) {
  return updateAction(entries, replyId, actionId, (state) => ({ ...state, status: "pending", undo: undefined, notice: undefined }));
}

export function markUndoFailed(entries: ChatEntry[], replyId: string, actionId: string, notice: string) {
  return updateAction(entries, replyId, actionId, (state) => ({ ...state, notice }));
}

const isPlanStep = (step: ChatStep) => !(SYSTEM_STEP_IDS as readonly string[]).includes(step.id);

function updatePlan(entries: ChatEntry[], replyId: string, update: (steps: ChatStep[], actions: number) => ChatStep[]) {
  return updateEntry(entries, replyId, (entry) => (entry.steps ? { ...entry, steps: update(entry.steps, entry.actions?.length ?? 0) } : entry));
}

// Plan steps are the model's own `update_plan` (the deterministic steps are never touched). Progress
// follows the proposals in order: the first proposal completes the first step, and so on.
export function startPlan(entries: ChatEntry[], replyId: string): ChatEntry[] {
  return updatePlan(entries, replyId, (steps) => {
    const plan = steps.filter(isPlanStep);
    if (plan.some(({ status }) => status !== "pending")) return steps;

    const first = plan[0];
    return first ? steps.map((step) => (step === first ? { ...step, status: "running" } : step)) : steps;
  });
}

export function advancePlan(entries: ChatEntry[], replyId: string): ChatEntry[] {
  return updatePlan(entries, replyId, (steps) => {
    const current = steps.find((step) => isPlanStep(step) && step.status !== "done");
    if (!current) return steps;

    const next = steps.find((step) => isPlanStep(step) && step.status !== "done" && step !== current);
    return steps.map((step) => (step === current ? { ...step, status: "done" } : step === next ? { ...step, status: "running" } : step));
  });
}

// At the end of the answer: steps that had a proposal are done (also when the plan arrived after
// the proposals); the rest stop spinning but are not claimed as done.
export function finishPlan(entries: ChatEntry[], replyId: string): ChatEntry[] {
  return updatePlan(entries, replyId, (steps, actions) => {
    let uncovered = Math.max(0, actions - steps.filter((step) => isPlanStep(step) && step.status === "done").length);

    return steps.map((step) => {
      if (!isPlanStep(step) || step.status === "done") return step;
      if (uncovered > 0) {
        uncovered--;
        return { ...step, status: "done" };
      }
      return step.status === "running" ? { ...step, status: "pending" } : step;
    });
  });
}

export const OVERLAP_NOTICE =
  "Este cambio se superpone con otro cambio de esta respuesta. «Aplicar todo» no lo incluye: aplicalo por separado si descartás el otro, o pedile de nuevo a la IA.";

// A proposal that collided with another one fails for that reason, not for a generic "the article changed".
export function applyFailureNotice(state: ActionState, message: string) {
  return state.overlapsWith ? "Este cambio se superpone con otro cambio de esta respuesta y ya no se puede aplicar." : message;
}

// What "apply all" runs. Proposals only become applicable once the answer is complete: while it
// streams, the document they refer to and the answer itself may still change. Overlapping ones are
// left out: whichever came first wins and the later one is the author's call.
export function applicableActions(entry: ChatEntry): ActionState[] {
  if (entry.streaming) return [];
  return (entry.actions ?? []).filter(({ status, overlapsWith }) => (status === "pending" || status === "error") && !overlapsWith);
}

// Live feedback while streaming; afterwards only worth keeping when the answer carried proposals.
export function shouldShowSteps(entry: ChatEntry) {
  if (!entry.steps?.length) return false;
  return entry.streaming ? true : Boolean(entry.actions?.length);
}

export function appendDelta(entries: ChatEntry[], id: string, text: string): ChatEntry[] {
  return entries.map((entry) => (entry.id === id ? { ...entry, content: entry.content + text } : entry));
}

// A stop keeps whatever was already streamed; only a real failure shows an error.
export function settleReply(entries: ChatEntry[], id: string, result: AiResult<null>): ChatEntry[] {
  const stopped = !result.ok && result.error.kind === "aborted";

  return entries.flatMap((entry) => {
    if (entry.id !== id) return [entry];
    if (stopped && !entry.content) return [];

    return [{ ...entry, streaming: false, ...(!result.ok && !stopped ? { error: result.error } : {}) }];
  });
}

// Retry resends the last user message, so the reply that failed goes away first.
export function dropFailedReply(entries: ChatEntry[]): ChatEntry[] {
  const last = entries.at(-1);
  return last?.role === "assistant" && last.error ? entries.slice(0, -1) : entries;
}

export function toRequestMessages(entries: ChatEntry[]): ChatMessage[] {
  return trimChatHistory(
    entries.filter((entry) => entry.content.trim()).map(({ role, content }) => ({ role, content })),
  );
}

export function formatMessageTime(createdAt: number, locale = "es-AR", timeZone?: string) {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(createdAt);
}

const BOTTOM_THRESHOLD_PX = 48;

export function isNearBottom({
  scrollTop,
  clientHeight,
  scrollHeight,
}: Pick<HTMLElement, "scrollTop" | "clientHeight" | "scrollHeight">) {
  return scrollHeight - scrollTop - clientHeight <= BOTTOM_THRESHOLD_PX;
}

// `keyCode 229` is what Safari reports for the Enter that confirms an IME composition.
export function shouldSubmitOnEnter(event: Pick<KeyboardEvent, "key" | "shiftKey" | "isComposing" | "keyCode">) {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229;
}

/**
 * Strips internal block index identifiers (e.g. [b0], [b1]) if leaked in chat output.
 */
export function cleanChatContent(text: string): string {
  if (!text) return "";
  return text
    .replace(/\s*\[b\d+\]/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\(\s*y\s*\)/g, "")
    .replace(/ {2,}/g, " ");
}

/**
 * Determines whether a chat message actually contains article-ready content that
 * can be inserted into the editor, avoiding offering insertion on purely consultative
 * or question-ending dialogue turns.
 */
export function isInsertableContent(entry: ChatEntry): boolean {
  // Messages with explicit proposed actions or score analysis should not offer direct insertion.
  if (entry.actions && entry.actions.length > 0) return false;
  if (entry.analysis) return false;
  if (entry.role !== "assistant" || entry.streaming) return false;

  const text = entry.content.trim();
  if (!text) return false;

  // Conversational questions directed at the user should not be inserted into the article.
  if (/\?\s*$/.test(text)) return false;
  if (/¿(?:te gustaría|querés|deseás|te parece|necesitás)/i.test(text)) return false;

  // Headings (e.g. outline, structure, new section) are always insertable article content.
  if (/(?:^|\n)#{1,4}\s+/m.test(text)) return true;

  // Code or markdown blocks
  if (text.includes("```")) return true;

  // Explicit blockquotes (used for sample drafts/paragraphs)
  if (/(?:^|\n)>\s+/m.test(text)) return true;

  // Pure advisory feedback / critique is consultative, not article content.
  if (
    /^(?:para mejorar|te sugiero|te recomiendo|te aconsejo|en mi opinión|podrías|podés|mi sugerencia|revisando|analizando|encontré|como recomendación)/i.test(
      text
    )
  ) {
    return false;
  }

  // Short messages without any list/outline formatting are usually chatter
  if (text.length < 80 && !/(?:^|\n)[-*]\s+/m.test(text)) {
    return false;
  }

  return true;
}
