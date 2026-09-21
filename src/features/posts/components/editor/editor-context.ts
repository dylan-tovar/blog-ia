import type { EditAction } from "@/features/ai/schemas";
import type { ApplyOutcome, LiveBlock, LiveDoc, UndoOutcome, UndoToken } from "./apply-action";
import { AI_MAX_INPUT_CHARS, CHAT_MAX_BLOCKS, CHAT_SELECTION_MAX_CHARS } from "@/features/ai/constants";

// Minimal ProseMirror JSON shape (Tiptap's JSONContent is assignable to it).
export type DocNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
};

// `id` is `b<index of the top-level node>`, so it stays aligned with the document even when
// empty nodes are skipped.
export type Block = { id: string; type: string; level?: number; markdown: string };

export type EditorSelection = { blockIds: string[]; text: string };

export type EditorSnapshot = {
  title: string;
  blocks: Block[];
  selection: EditorSelection | null;
  fingerprint: string;
};

export type EditorBridge = {
  getSnapshot: () => EditorSnapshot;
  // One ProseMirror transaction (one Ctrl+Z step). Never throws: failures come back as `ok: false`.
  apply: (action: EditAction, snapshot: EditorSnapshot) => ApplyOutcome;
  undo: (token: UndoToken) => UndoOutcome;
};

export type OutlineItem = { blockId: string; level: number; text: string };

export function docToBlocks(doc: DocNode | readonly DocNode[], serialize: (node: DocNode) => string): Block[] {
  const nodes = Array.isArray(doc) ? doc : ((doc as DocNode).content ?? []);
  const blocks: Block[] = [];

  nodes.forEach((node, index) => {
    const markdown = serialize(node).trim();
    if (!markdown) return;

    const level = node.attrs?.level;
    blocks.push({
      id: `b${index}`,
      type: node.type ?? "unknown",
      ...(typeof level === "number" ? { level } : {}),
      markdown,
    });
  });

  return blocks;
}

export function outline(blocks: readonly Block[]): OutlineItem[] {
  return blocks.flatMap((block) =>
    block.type === "heading" && block.level !== undefined
      ? [{ blockId: block.id, level: block.level, text: block.markdown.replace(/^#+\s*/, "").trim() }]
      : [],
  );
}

// FNV-1a: a fast non-cryptographic hash. It only detects that a block changed, it is not a security boundary.
function hash(text: string) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value = Math.imul(value ^ text.charCodeAt(index), 0x01000193);
  }
  return (value >>> 0).toString(16).padStart(8, "0");
}

// The id is left out on purpose: a block that only moved keeps its fingerprint.
export function blockFingerprint({ type, level, markdown }: Block) {
  return hash(`${type}\u0000${level ?? ""}\u0000${markdown}`);
}

export function docFingerprint(blocks: readonly Block[]) {
  return hash(blocks.map((block) => `${block.id}:${blockFingerprint(block)}`).join("|"));
}

type Range = { from: number; to: number };

export function selectionToBlockIds(ranges: readonly (Range & { id: string })[], selection: Range): string[] {
  const collapsed = selection.from === selection.to;

  return ranges
    .filter(({ from, to }) =>
      collapsed ? from <= selection.from && selection.from <= to : selection.from < to && selection.to > from,
    )
    .map(({ id }) => id);
}

export type PositionedNode = Range & { node: DocNode };

export function buildSnapshot({
  title,
  nodes,
  selection,
  serialize,
}: {
  title: string;
  nodes: readonly PositionedNode[];
  selection: (Range & { text: string }) | null;
  serialize: (node: DocNode) => string;
}): EditorSnapshot {
  const blocks = docToBlocks(
    nodes.map(({ node }) => node),
    serialize,
  );

  // A collapsed cursor selects nothing the model could act on.
  let editorSelection: EditorSelection | null = null;
  if (selection && selection.from !== selection.to) {
    const ranges = blocks.map((block) => ({ id: block.id, ...nodes[Number(block.id.slice(1))] }));
    const blockIds = selectionToBlockIds(ranges, selection);
    if (blockIds.length > 0) editorSelection = { blockIds, text: selection.text };
  }

  return { title, blocks, selection: editorSelection, fingerprint: docFingerprint(blocks) };
}

// The live document as `apply-action` needs it: blocks with positions plus the current selection.
export function buildLiveDoc({
  nodes,
  selection,
  endPos,
  markdownLength,
  serialize,
}: {
  nodes: readonly PositionedNode[];
  selection: LiveDoc["selection"];
  endPos: number;
  markdownLength: number;
  serialize: (node: DocNode) => string;
}): LiveDoc {
  const blocks: LiveBlock[] = docToBlocks(
    nodes.map(({ node }) => node),
    serialize,
  ).map((block) => {
    const { from, to } = nodes[Number(block.id.slice(1))];
    return { ...block, from, to };
  });

  return { blocks, selection, endPos, markdownLength };
}

export type FitLimits = { maxChars: number; maxBlocks: number; pinnedIds?: readonly string[] };

// Whole blocks only, in document order. Pinned blocks (the selection) are considered first so they
// survive a cut; a block that could never fit is skipped instead of ending the document early.
export function fitBlocks(blocks: readonly Block[], { maxChars, maxBlocks, pinnedIds = [] }: FitLimits) {
  const pinned = new Set(pinnedIds);
  const chosen = new Set<string>();
  let used = 0;

  const tryAdd = (block: Block) => {
    const size = block.markdown.length;
    if (size > maxChars) return true;
    if (chosen.size >= maxBlocks || used + size > maxChars) return false;
    chosen.add(block.id);
    used += size;
    return true;
  };

  for (const block of blocks) if (pinned.has(block.id)) tryAdd(block);
  for (const block of blocks) if (!pinned.has(block.id) && !tryAdd(block)) break;

  const kept = blocks.filter((block) => chosen.has(block.id));
  return { blocks: kept, omitted: blocks.length - kept.length };
}

export type ChatRequestContext = EditorSnapshot & { totalBlocks: number };

type RequestLimits = { maxChars: number; maxBlocks: number; maxSelectionChars: number };

const REQUEST_LIMITS: RequestLimits = {
  maxChars: AI_MAX_INPUT_CHARS,
  maxBlocks: CHAT_MAX_BLOCKS,
  maxSelectionChars: CHAT_SELECTION_MAX_CHARS,
};

// What actually goes over the wire: the snapshot cut to the request caps, plus the real block count
// so the prompt can say how much of the article the model did not see.
export function toRequestContext(snapshot: EditorSnapshot, limits: RequestLimits = REQUEST_LIMITS): ChatRequestContext {
  const { blocks } = fitBlocks(snapshot.blocks, {
    maxChars: limits.maxChars,
    maxBlocks: limits.maxBlocks,
    pinnedIds: snapshot.selection?.blockIds,
  });

  return {
    ...snapshot,
    blocks,
    totalBlocks: snapshot.blocks.length,
    selection: snapshot.selection && {
      blockIds: snapshot.selection.blockIds.slice(0, limits.maxBlocks),
      text: snapshot.selection.text.slice(0, limits.maxSelectionChars),
    },
  };
}
