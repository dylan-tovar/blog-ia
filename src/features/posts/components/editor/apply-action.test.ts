import { describe, expect, it } from "vitest";
import { POST_CONTENT_MAX_LENGTH } from "@/features/posts/constants";
import type { EditAction } from "@/features/ai/schemas";
import {
  actionPreview,
  defaultActionLabel,
  describeLocation,
  planApply,
  resolveAction,
  type LiveBlock,
  type LiveDoc,
} from "./apply-action";
import { docFingerprint, type Block, type EditorSnapshot } from "./editor-context";

const block = (index: number, markdown: string, extra: Partial<Block> = {}): Block => ({
  id: `b${index}`,
  type: "paragraph",
  markdown,
  ...extra,
});

const snapshotOf = (blocks: Block[], selection: EditorSnapshot["selection"] = null): EditorSnapshot => ({
  title: "Mi artículo",
  blocks,
  selection,
  fingerprint: docFingerprint(blocks),
});

// 10 positions per block, like a real doc where each node has its own extent.
function liveOf(blocks: Block[], overrides: Partial<LiveDoc> = {}): LiveDoc {
  const live: LiveBlock[] = blocks.map((item, position) => ({ ...item, from: position * 10, to: position * 10 + 10 }));
  return {
    blocks: live,
    selection: { from: 0, to: 0, head: 0, text: "" },
    endPos: blocks.length * 10,
    markdownLength: blocks.reduce((sum, item) => sum + item.markdown.length, 0),
    ...overrides,
  };
}

const blocks = [
  block(0, "## Introducción", { type: "heading", level: 2 }),
  block(1, "Primer párrafo."),
  block(2, "Segundo párrafo."),
  block(3, "Cierre."),
];

describe("resolveAction", () => {
  const snapshot = snapshotOf(blocks);

  it("appends at the end of the document", () => {
    expect(resolveAction({ op: "append", markdown: "Fin" }, snapshot, liveOf(blocks))).toEqual({ from: 40, to: 40, mode: "insert" });
  });

  it("replaces the placeholder empty paragraph when appending to an empty article", () => {
    const empty = liveOf([], { endPos: 2 });

    expect(resolveAction({ op: "append", markdown: "Fin" }, snapshotOf([]), empty)).toEqual({ from: 0, to: 2, mode: "replace" });
  });

  it("inserts right after the end of the referenced block", () => {
    const action: EditAction = { op: "insert_after_block", blockId: "b1", markdown: "Nuevo" };

    expect(resolveAction(action, snapshot, liveOf(blocks))).toEqual({ from: 20, to: 20, mode: "insert" });
  });

  it("replaces the whole referenced block", () => {
    const action: EditAction = { op: "replace_block", blockId: "b2", markdown: "Nuevo" };

    expect(resolveAction(action, snapshot, liveOf(blocks))).toEqual({ from: 20, to: 30, mode: "replace" });
  });

  it("replaces a range from the start of the first block to the end of the last", () => {
    const action: EditAction = { op: "replace_range", fromBlockId: "b1", toBlockId: "b2", markdown: "Nuevo" };

    expect(resolveAction(action, snapshot, liveOf(blocks))).toEqual({ from: 10, to: 30, mode: "replace" });
  });

  it("follows a block that moved because the user added content above it", () => {
    const edited = [block(0, "Un párrafo nuevo arriba"), ...blocks].map((item, index) => ({ ...item, id: `b${index}` }));
    const action: EditAction = { op: "replace_block", blockId: "b2", markdown: "Nuevo" };

    expect(resolveAction(action, snapshot, liveOf(edited))).toEqual({ from: 30, to: 40, mode: "replace" });
  });

  it("is stale when the referenced block text changed", () => {
    const edited = blocks.map((item) => (item.id === "b2" ? { ...item, markdown: "Otro texto" } : item));
    const action: EditAction = { op: "replace_block", blockId: "b2", markdown: "Nuevo" };

    expect(resolveAction(action, snapshot, liveOf(edited))).toEqual({ stale: true, reason: "block_changed" });
  });

  it("is stale when the referenced block was deleted", () => {
    const action: EditAction = { op: "insert_after_block", blockId: "b3", markdown: "Nuevo" };

    expect(resolveAction(action, snapshot, liveOf(blocks.slice(0, 3)))).toEqual({ stale: true, reason: "block_changed" });
  });

  it("is stale when the block id does not exist in the snapshot", () => {
    const action: EditAction = { op: "replace_block", blockId: "b9", markdown: "Nuevo" };

    expect(resolveAction(action, snapshot, liveOf(blocks))).toEqual({ stale: true, reason: "block_changed" });
  });

  it("picks the copy closest to the original position when the text appears twice", () => {
    const original = [block(0, "otro"), block(1, "igual"), block(2, "intermedio"), block(3, "igual")];
    const action: EditAction = { op: "replace_block", blockId: "b3", markdown: "Nuevo" };
    // The author deleted the block in the middle: both copies survive, at b1 and b2.
    const live = liveOf([block(0, "otro"), block(1, "igual"), block(2, "igual")]);

    expect(resolveAction(action, snapshotOf(original), live)).toEqual({ from: 20, to: 30, mode: "replace" });
  });

  it("is stale when any block inside a range changed", () => {
    const edited = blocks.map((item) => (item.id === "b2" ? { ...item, markdown: "Cambiado" } : item));
    const action: EditAction = { op: "replace_range", fromBlockId: "b1", toBlockId: "b3", markdown: "Nuevo" };

    expect(resolveAction(action, snapshot, liveOf(edited))).toEqual({ stale: true, reason: "block_changed" });
  });

  it("is stale when a paragraph was inserted inside the range", () => {
    const edited = [blocks[0], blocks[1], block(2, "Intruso"), { ...blocks[2], id: "b3" }, { ...blocks[3], id: "b4" }];
    const action: EditAction = { op: "replace_range", fromBlockId: "b1", toBlockId: "b2", markdown: "Nuevo" };

    expect(resolveAction(action, snapshot, liveOf(edited))).toEqual({ stale: true, reason: "block_changed" });
  });

  it("is stale for a range whose ends are in reverse order", () => {
    const action: EditAction = { op: "replace_range", fromBlockId: "b3", toBlockId: "b1", markdown: "Nuevo" };

    expect(resolveAction(action, snapshot, liveOf(blocks))).toEqual({ stale: true, reason: "block_changed" });
  });

  describe("selection ops", () => {
    const selected = snapshotOf(blocks, { blockIds: ["b1"], text: "Primer" });
    const live = liveOf(blocks, { selection: { from: 12, to: 18, head: 18, text: "Primer" } });

    it("replaces exactly the live selection when it still holds the same text", () => {
      expect(resolveAction({ op: "replace_selection", markdown: "X" }, selected, live)).toEqual({ from: 12, to: 18, mode: "replace" });
    });

    it("inserts after the live selection", () => {
      expect(resolveAction({ op: "insert_at_selection", markdown: "X" }, selected, live)).toEqual({ from: 18, to: 18, mode: "insert" });
    });

    it("is stale when the author selected something else in the meantime", () => {
      const moved = liveOf(blocks, { selection: { from: 22, to: 28, head: 28, text: "Segund" } });

      expect(resolveAction({ op: "replace_selection", markdown: "X" }, selected, moved)).toEqual({ stale: true, reason: "selection_changed" });
      expect(resolveAction({ op: "insert_at_selection", markdown: "X" }, selected, moved)).toEqual({ stale: true, reason: "selection_changed" });
    });

    it("is stale for replace_selection when the request had no selection or the selection collapsed", () => {
      const collapsed = liveOf(blocks, { selection: { from: 12, to: 12, head: 12, text: "" } });

      expect(resolveAction({ op: "replace_selection", markdown: "X" }, snapshot(), live)).toEqual({ stale: true, reason: "selection_changed" });
      expect(resolveAction({ op: "replace_selection", markdown: "X" }, selected, collapsed)).toEqual({ stale: true, reason: "selection_changed" });
    });

    it("inserts at the cursor when the snapshot had no selection (manual insert)", () => {
      const cursor = liveOf(blocks, { selection: { from: 14, to: 14, head: 14, text: "" } });

      expect(resolveAction({ op: "insert_at_selection", markdown: "X" }, snapshot(), cursor)).toEqual({ from: 14, to: 14, mode: "insert" });
    });

    it("inserts at the caret, not after the selection, for a manual insert with text selected", () => {
      // The caret sits at the start of the selection (selected backwards).
      const backwards = liveOf(blocks, { selection: { from: 12, to: 18, head: 12, text: "Primer" } });

      expect(resolveAction({ op: "insert_at_selection", markdown: "X" }, snapshot(), backwards)).toEqual({ from: 12, to: 12, mode: "insert" });
    });

    function snapshot() {
      return snapshotOf(blocks);
    }
  });
});

describe("planApply", () => {
  const snapshot = snapshotOf(blocks);

  it("returns the placement when the action still applies and fits", () => {
    const plan = planApply({ op: "append", markdown: "Fin" }, snapshot, liveOf(blocks));

    expect(plan).toEqual({ ok: true, placement: { from: 40, to: 40, mode: "insert" } });
  });

  it("explains a stale action in Spanish", () => {
    const edited = blocks.map((item) => (item.id === "b1" ? { ...item, markdown: "Distinto" } : item));

    const plan = planApply({ op: "replace_block", blockId: "b1", markdown: "X" }, snapshot, liveOf(edited));

    expect(plan).toMatchObject({ ok: false, reason: "stale" });
    expect(!plan.ok && plan.message).toContain("cambió");
  });

  it("refuses to go over the article length limit and says by how much", () => {
    const live = liveOf(blocks, { markdownLength: POST_CONTENT_MAX_LENGTH - 5 });

    const plan = planApply({ op: "append", markdown: "x".repeat(15) }, snapshot, live);

    expect(plan).toMatchObject({ ok: false, reason: "too_long" });
    expect(!plan.ok && plan.message).toContain("10 caracteres");
  });

  it("does not count the replaced block against the limit", () => {
    const live = liveOf(blocks, { markdownLength: POST_CONTENT_MAX_LENGTH });

    const plan = planApply({ op: "replace_block", blockId: "b1", markdown: "x".repeat("Primer párrafo.".length) }, snapshot, live);

    expect(plan.ok).toBe(true);
  });

  it("does not count the replaced range or selection against the limit either", () => {
    const live = liveOf(blocks, { markdownLength: POST_CONTENT_MAX_LENGTH, selection: { from: 12, to: 18, head: 18, text: "Primer" } });
    const selected = snapshotOf(blocks, { blockIds: ["b1"], text: "Primer" });
    const range: EditAction = { op: "replace_range", fromBlockId: "b1", toBlockId: "b2", markdown: "x".repeat(31) };

    expect(planApply(range, snapshot, live).ok).toBe(true);
    expect(planApply({ op: "replace_selection", markdown: "x".repeat(6) }, selected, live).ok).toBe(true);
    expect(planApply({ op: "replace_selection", markdown: "x".repeat(7) }, selected, live).ok).toBe(false);
  });
});

describe("describeLocation", () => {
  const snapshot = snapshotOf(blocks, { blockIds: ["b1"], text: "Primer" });
  const locate = (action: EditAction) => describeLocation(action, snapshot);

  it.each<[string, EditAction, string]>([
    ["append", { op: "append", markdown: "x" }, "Al final del artículo"],
    ["insert after a heading", { op: "insert_after_block", blockId: "b0", markdown: "x" }, "Después de «Introducción»"],
    ["insert after a paragraph", { op: "insert_after_block", blockId: "b1", markdown: "x" }, "Después de «Primer párrafo.»"],
    ["replace a block", { op: "replace_block", blockId: "b2", markdown: "x" }, "Reemplaza «Segundo párrafo.»"],
    ["replace a range", { op: "replace_range", fromBlockId: "b1", toBlockId: "b3", markdown: "x" }, "Reemplaza desde «Primer párrafo.» hasta «Cierre.»"],
    ["replace the selection", { op: "replace_selection", markdown: "x" }, "Reemplaza la selección"],
    ["insert at the selection", { op: "insert_at_selection", markdown: "x" }, "Después de la selección"],
  ])("describes %s", (_label, action, expected) => {
    expect(locate(action)).toBe(expected);
  });

  it("shortens long block text", () => {
    const long = snapshotOf([block(0, "palabra ".repeat(30))]);

    const text = describeLocation({ op: "replace_block", blockId: "b0", markdown: "x" }, long);

    expect(text.length).toBeLessThan(70);
    expect(text).toContain("…");
  });

  it("falls back to a generic name for a block that is not in the snapshot", () => {
    expect(locate({ op: "replace_block", blockId: "b9", markdown: "x" })).toBe("Reemplaza un bloque del artículo");
  });
});

describe("actionPreview", () => {
  const snapshot = snapshotOf(blocks, { blockIds: ["b1"], text: "Primer" });

  it("has no before for insertions", () => {
    expect(actionPreview({ op: "append", markdown: "Nuevo" }, snapshot)).toEqual({ before: null, after: "Nuevo" });
    expect(actionPreview({ op: "insert_after_block", blockId: "b1", markdown: "Nuevo" }, snapshot)).toEqual({ before: null, after: "Nuevo" });
  });

  it("shows the replaced block, range and selection as the before", () => {
    expect(actionPreview({ op: "replace_block", blockId: "b1", markdown: "N" }, snapshot).before).toBe("Primer párrafo.");
    expect(actionPreview({ op: "replace_range", fromBlockId: "b1", toBlockId: "b2", markdown: "N" }, snapshot).before).toBe(
      "Primer párrafo.\n\nSegundo párrafo.",
    );
    expect(actionPreview({ op: "replace_selection", markdown: "N" }, snapshot).before).toBe("Primer");
  });

  it("has no before when the replaced content is not in the snapshot", () => {
    expect(actionPreview({ op: "replace_block", blockId: "b9", markdown: "N" }, snapshot).before).toBeNull();
  });
});

describe("defaultActionLabel", () => {
  it.each<[EditAction["op"], string]>([
    ["append", "Agregar al final"],
    ["insert_after_block", "Insertar contenido"],
    ["insert_at_selection", "Insertar contenido"],
    ["replace_block", "Reemplazar bloque"],
    ["replace_range", "Reemplazar sección"],
    ["replace_selection", "Reemplazar selección"],
  ])("names %s", (op, label) => {
    expect(defaultActionLabel(op)).toBe(label);
  });
});
