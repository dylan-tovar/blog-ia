import { describe, expect, it } from "vitest";
import type { EditAction } from "@/features/ai/schemas";
import { findOverlap } from "./action-overlap";
import { docFingerprint, type Block, type EditorSnapshot } from "./editor-context";

const blocks: Block[] = Array.from({ length: 6 }, (_, index) => ({ id: `b${index}`, type: "paragraph", markdown: `párrafo ${index}` }));

const snapshotOf = (selection: EditorSnapshot["selection"] = null): EditorSnapshot => ({
  title: "T",
  blocks,
  selection,
  fingerprint: docFingerprint(blocks),
});

const replace = (blockId: string): EditAction => ({ op: "replace_block", blockId, markdown: "x" });
const range = (fromBlockId: string, toBlockId: string): EditAction => ({ op: "replace_range", fromBlockId, toBlockId, markdown: "x" });
const insertAfter = (blockId: string): EditAction => ({ op: "insert_after_block", blockId, markdown: "x" });
const entry = (id: string, action: EditAction) => ({ id, action });

describe("findOverlap", () => {
  it("returns null when there is nothing earlier", () => {
    expect(findOverlap(replace("b1"), [], snapshotOf())).toBeNull();
  });

  it.each<[string, EditAction, EditAction]>([
    ["two replacements of the same block", replace("b2"), replace("b2")],
    ["a replacement inside a replaced range", range("b1", "b4"), replace("b3")],
    ["a range that contains an earlier replaced block", replace("b3"), range("b1", "b4")],
    ["two ranges that share a block", range("b0", "b2"), range("b2", "b4")],
    ["an insertion after a block that is replaced", replace("b2"), insertAfter("b2")],
    ["an insertion anchored inside a replaced range", range("b1", "b3"), insertAfter("b2")],
    ["a replacement of a block that already has an insertion after it", insertAfter("b2"), replace("b2")],
  ])("detects %s", (_label, earlier, later) => {
    expect(findOverlap(later, [entry("a1", earlier)], snapshotOf())).toBe("a1");
  });

  it.each<[string, EditAction, EditAction]>([
    ["replacements of different blocks", replace("b1"), replace("b3")],
    ["adjacent ranges", range("b0", "b1"), range("b2", "b3")],
    ["insertions after the same block", insertAfter("b2"), insertAfter("b2")],
    ["insertions after different blocks", insertAfter("b1"), insertAfter("b4")],
    ["an insertion after a block outside a replaced range", range("b1", "b2"), insertAfter("b4")],
    ["an append and a replacement", { op: "append", markdown: "x" }, replace("b5")],
    ["two appends", { op: "append", markdown: "x" }, { op: "append", markdown: "y" }],
  ])("does not flag %s", (_label, earlier, later) => {
    expect(findOverlap(later, [entry("a1", earlier)], snapshotOf())).toBeNull();
  });

  it("treats a replaced selection as the blocks it covers", () => {
    const selected = snapshotOf({ blockIds: ["b2", "b3"], text: "x" });
    const replaceSelection: EditAction = { op: "replace_selection", markdown: "x" };

    expect(findOverlap(replace("b3"), [entry("a1", replaceSelection)], selected)).toBe("a1");
    expect(findOverlap(replaceSelection, [entry("a1", replaceSelection)], selected)).toBe("a1");
    expect(findOverlap(replace("b5"), [entry("a1", replaceSelection)], selected)).toBeNull();
    expect(findOverlap({ op: "insert_at_selection", markdown: "x" }, [entry("a1", replace("b2"))], selected)).toBe("a1");
  });

  it("cannot compare selection actions when the request had no selection", () => {
    const replaceSelection: EditAction = { op: "replace_selection", markdown: "x" };

    expect(findOverlap(replace("b2"), [entry("a1", replaceSelection)], snapshotOf())).toBeNull();
  });

  it("ignores blocks that are not in the snapshot", () => {
    expect(findOverlap(replace("b9"), [entry("a1", replace("b9"))], snapshotOf())).toBeNull();
  });

  it("reports the first earlier action it collides with", () => {
    const earlier = [entry("a1", replace("b0")), entry("a2", replace("b3")), entry("a3", replace("b3"))];

    expect(findOverlap(replace("b3"), earlier, snapshotOf())).toBe("a2");
  });
});
