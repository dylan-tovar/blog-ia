import type { EditAction } from "@/features/ai/schemas";
import type { EditorSnapshot } from "./editor-context";

// Block indexes in the snapshot. `mutates` is content the action replaces; `anchors` are blocks it
// only points at (an insertion after a block needs that block to still be there).
type Footprint = { mutates: [number, number] | null; anchors: number[] };

const NONE: Footprint = { mutates: null, anchors: [] };

function footprintOf(action: EditAction, snapshot: EditorSnapshot): Footprint {
  const indexOf = (id: string) => snapshot.blocks.findIndex((block) => block.id === id);
  const selected = () =>
    (snapshot.selection?.blockIds ?? []).map(indexOf).filter((index) => index !== -1);

  switch (action.op) {
    case "append":
      return NONE;
    case "insert_after_block": {
      const index = indexOf(action.blockId);
      return index === -1 ? NONE : { mutates: null, anchors: [index] };
    }
    case "replace_block": {
      const index = indexOf(action.blockId);
      return index === -1 ? NONE : { mutates: [index, index], anchors: [] };
    }
    case "replace_range": {
      const from = indexOf(action.fromBlockId);
      const to = indexOf(action.toBlockId);
      return from === -1 || to === -1 ? NONE : { mutates: [from, to], anchors: [] };
    }
    case "replace_selection": {
      const indexes = selected();
      return indexes.length === 0 ? NONE : { mutates: [Math.min(...indexes), Math.max(...indexes)], anchors: [] };
    }
    case "insert_at_selection":
      return { mutates: null, anchors: selected() };
  }
}

const rangesOverlap = (a: Footprint["mutates"], b: Footprint["mutates"]) => a !== null && b !== null && a[0] <= b[1] && b[0] <= a[1];
const contains = (range: Footprint["mutates"], indexes: number[]) => range !== null && indexes.some((index) => index >= range[0] && index <= range[1]);

// Two proposals overlap when applying one would change what the other points at, so the second one
// could no longer be applied. Insertions after the same block do not: both can be applied.
// Returns the id of the first earlier action the new one collides with.
export function findOverlap(
  action: EditAction,
  earlier: readonly { id: string; action: EditAction }[],
  snapshot: EditorSnapshot,
): string | null {
  const next = footprintOf(action, snapshot);

  for (const other of earlier) {
    const previous = footprintOf(other.action, snapshot);
    if (rangesOverlap(next.mutates, previous.mutates) || contains(next.mutates, previous.anchors) || contains(previous.mutates, next.anchors)) {
      return other.id;
    }
  }

  return null;
}
