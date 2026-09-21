import type { EditAction } from "@/features/ai/schemas";
import { POST_CONTENT_MAX_LENGTH } from "@/features/posts/constants";
import { fitsContentLimit } from "@/features/posts/limits";
import { markdownToPlainText } from "@/features/posts/utils";
import { blockFingerprint, type Block, type EditorSnapshot } from "./editor-context";

// A block of the live document with its ProseMirror extent (top-level node start and end).
export type LiveBlock = Block & { from: number; to: number };

export type LiveDoc = {
  blocks: LiveBlock[];
  // `head` is the caret: the end of the selection the author moved, which is not always `to`.
  selection: { from: number; to: number; head: number; text: string };
  // Position right after the last top-level node.
  endPos: number;
  markdownLength: number;
};

export type Placement = { from: number; to: number; mode: "insert" | "replace" };
export type StaleReason = "block_changed" | "selection_changed";
export type Resolution = Placement | { stale: true; reason: StaleReason };

export type PlanResult =
  | { ok: true; placement: Placement }
  | { ok: false; reason: "stale" | "too_long"; message: string };

// Opaque handle the bridge hands out so an applied action can be undone later.
export type UndoToken = { id: string };

export type ApplyOutcome =
  | { ok: true; undo: UndoToken }
  | { ok: false; reason: "stale" | "too_long" | "unavailable"; message: string };

export type UndoOutcome = { ok: true } | { ok: false; message: string };

const STALE_BLOCK = { stale: true, reason: "block_changed" } as const;
const STALE_SELECTION = { stale: true, reason: "selection_changed" } as const;

const idIndex = (id: string) => Number(id.slice(1));

// Where the original sequence of blocks lives now: the same content at the same ids wins, otherwise
// the copy closest to the original position. Content that no longer exists anywhere is stale.
function locateSequence(original: readonly Block[], live: readonly LiveBlock[]): number | null {
  const wanted = original.map(blockFingerprint);
  const current = live.map(blockFingerprint);
  const matches: number[] = [];

  for (let start = 0; start + wanted.length <= current.length; start++) {
    if (wanted.every((fingerprint, offset) => current[start + offset] === fingerprint)) matches.push(start);
  }
  if (matches.length === 0) return null;

  const origin = idIndex(original[0].id);
  return matches.reduce((best, start) =>
    Math.abs(idIndex(live[start].id) - origin) < Math.abs(idIndex(live[best].id) - origin) ? start : best,
  );
}

function originalSpan(snapshot: EditorSnapshot, fromId: string, toId = fromId): Block[] | null {
  const from = snapshot.blocks.findIndex((block) => block.id === fromId);
  const to = snapshot.blocks.findIndex((block) => block.id === toId);
  return from === -1 || to === -1 || from > to ? null : snapshot.blocks.slice(from, to + 1);
}

function locateBlocks(snapshot: EditorSnapshot, live: LiveDoc, fromId: string, toId?: string) {
  const span = originalSpan(snapshot, fromId, toId);
  if (!span) return null;

  const start = locateSequence(span, live.blocks);
  return start === null ? null : { first: live.blocks[start], last: live.blocks[start + span.length - 1] };
}

// Pure and positional only: it never touches the editor. The fingerprints of the snapshot the answer
// was based on decide whether what the model saw is still there.
export function resolveAction(action: EditAction, snapshot: EditorSnapshot, live: LiveDoc): Resolution {
  switch (action.op) {
    case "append":
      // An empty article is still one empty paragraph: replace it so the new content does not start under a blank line.
      return live.blocks.length === 0
        ? { from: 0, to: live.endPos, mode: "replace" }
        : { from: live.endPos, to: live.endPos, mode: "insert" };

    case "insert_after_block": {
      const found = locateBlocks(snapshot, live, action.blockId);
      return found ? { from: found.last.to, to: found.last.to, mode: "insert" } : STALE_BLOCK;
    }

    case "replace_block": {
      const found = locateBlocks(snapshot, live, action.blockId);
      return found ? { from: found.first.from, to: found.last.to, mode: "replace" } : STALE_BLOCK;
    }

    case "replace_range": {
      const found = locateBlocks(snapshot, live, action.fromBlockId, action.toBlockId);
      return found ? { from: found.first.from, to: found.last.to, mode: "replace" } : STALE_BLOCK;
    }

    case "replace_selection": {
      const { selection } = live;
      const unchanged = snapshot.selection !== null && selection.from !== selection.to && selection.text === snapshot.selection.text;
      return unchanged ? { from: selection.from, to: selection.to, mode: "replace" } : STALE_SELECTION;
    }

    case "insert_at_selection": {
      const { selection } = live;
      // No selection in the snapshot means a manual "insert at cursor": it goes exactly at the caret, even with
      // text selected. A proposal made for a selection goes right after it.
      if (!snapshot.selection) return { from: selection.head, to: selection.head, mode: "insert" };
      if (selection.text !== snapshot.selection.text) return STALE_SELECTION;
      return { from: selection.to, to: selection.to, mode: "insert" };
    }
  }
}

function removedChars(action: EditAction, placement: Placement, live: LiveDoc) {
  if (placement.mode === "insert") return 0;
  if (action.op === "replace_selection") return live.selection.text.length;

  return live.blocks
    .filter((block) => block.from >= placement.from && block.to <= placement.to)
    .reduce((sum, block) => sum + block.markdown.length, 0);
}

export function planApply(action: EditAction, snapshot: EditorSnapshot, live: LiveDoc): PlanResult {
  const resolution = resolveAction(action, snapshot, live);
  if ("stale" in resolution) {
    return {
      ok: false,
      reason: "stale",
      message: "El artículo cambió desde que se hizo esta propuesta, así que ya no se puede aplicar. Pedila de nuevo o hacé el cambio a mano.",
    };
  }

  const projected = live.markdownLength - removedChars(action, resolution, live) + action.markdown.length;
  if (!fitsContentLimit(projected)) {
    return {
      ok: false,
      reason: "too_long",
      message: `El cambio supera el límite de longitud del artículo por ${projected - POST_CONTENT_MAX_LENGTH} caracteres. Acortalo o borrá contenido antes de aplicarlo.`,
    };
  }

  return { ok: true, placement: resolution };
}

const LABEL_MAX_CHARS = 40;

function blockLabel(block: Block | undefined) {
  if (!block) return null;
  const text = markdownToPlainText(block.markdown);
  return text.length > LABEL_MAX_CHARS ? `${text.slice(0, LABEL_MAX_CHARS).trimEnd()}…` : text;
}

export function describeLocation(action: EditAction, snapshot: EditorSnapshot): string {
  const label = (id: string) => blockLabel(snapshot.blocks.find((block) => block.id === id));

  switch (action.op) {
    case "append":
      return "Al final del artículo";
    case "insert_after_block": {
      const name = label(action.blockId);
      return name ? `Después de «${name}»` : "Después de un bloque del artículo";
    }
    case "replace_block": {
      const name = label(action.blockId);
      return name ? `Reemplaza «${name}»` : "Reemplaza un bloque del artículo";
    }
    case "replace_range": {
      const from = label(action.fromBlockId);
      const to = label(action.toBlockId);
      return from && to ? `Reemplaza desde «${from}» hasta «${to}»` : "Reemplaza una sección del artículo";
    }
    case "replace_selection":
      return "Reemplaza la selección";
    case "insert_at_selection":
      return "Después de la selección";
  }
}

// What the card shows: the content that goes away (when it is a replacement) and the new content.
export function actionPreview(action: EditAction, snapshot: EditorSnapshot): { before: string | null; after: string } {
  const after = action.markdown;

  switch (action.op) {
    case "replace_block": {
      const span = originalSpan(snapshot, action.blockId);
      return { before: span ? span[0].markdown : null, after };
    }
    case "replace_range": {
      const span = originalSpan(snapshot, action.fromBlockId, action.toBlockId);
      return { before: span ? span.map((block) => block.markdown).join("\n\n") : null, after };
    }
    case "replace_selection":
      return { before: snapshot.selection?.text ?? null, after };
    default:
      return { before: null, after };
  }
}

const DEFAULT_LABELS: Record<EditAction["op"], string> = {
  append: "Agregar al final",
  insert_after_block: "Insertar contenido",
  insert_at_selection: "Insertar contenido",
  replace_block: "Reemplazar bloque",
  replace_range: "Reemplazar sección",
  replace_selection: "Reemplazar selección",
};

export function defaultActionLabel(op: EditAction["op"]) {
  return DEFAULT_LABELS[op];
}
