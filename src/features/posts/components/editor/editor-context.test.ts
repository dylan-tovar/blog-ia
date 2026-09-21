import { describe, expect, it } from "vitest";
import {
  blockFingerprint,
  buildLiveDoc,
  buildSnapshot,
  docFingerprint,
  docToBlocks,
  fitBlocks,
  outline,
  selectionToBlockIds,
  toRequestContext,
  type Block,
  type DocNode,
} from "./editor-context";

// Stand-in for the Tiptap markdown serializer: plain text of the node with a heading prefix.
function serialize(node: DocNode): string {
  const text = (node.content ?? []).map((child) => child.text ?? "").join("");
  return node.type === "heading" ? `${"#".repeat(Number(node.attrs?.level ?? 2))} ${text}` : text;
}

const paragraph = (text: string): DocNode => ({ type: "paragraph", content: text ? [{ type: "text", text }] : undefined });
const heading = (level: number, text: string): DocNode => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });

const block = (id: string, markdown: string, extra: Partial<Block> = {}): Block => ({ id, type: "paragraph", markdown, ...extra });

describe("docToBlocks", () => {
  it("numbers top-level nodes and keeps their type, heading level and markdown", () => {
    const blocks = docToBlocks([heading(2, "Intro"), paragraph("Hola")], serialize);

    expect(blocks).toEqual([
      { id: "b0", type: "heading", level: 2, markdown: "## Intro" },
      { id: "b1", type: "paragraph", markdown: "Hola" },
    ]);
  });

  it("accepts a ProseMirror doc as well as a plain node list", () => {
    const nodes = [paragraph("uno")];

    expect(docToBlocks({ type: "doc", content: nodes }, serialize)).toEqual(docToBlocks(nodes, serialize));
  });

  it("skips empty blocks without shifting the ids of the ones after them", () => {
    const blocks = docToBlocks([paragraph("uno"), paragraph(""), paragraph("tres")], serialize);

    expect(blocks.map((item) => item.id)).toEqual(["b0", "b2"]);
  });

  it("returns no blocks for an empty document", () => {
    expect(docToBlocks({ type: "doc" }, serialize)).toEqual([]);
  });

  it("ignores a heading level that is not a number", () => {
    const [item] = docToBlocks([{ type: "heading", attrs: { level: "x" }, content: [{ type: "text", text: "A" }] }], serialize);

    expect(item).not.toHaveProperty("level");
  });
});

describe("outline", () => {
  it("lists only headings with their level and clean text", () => {
    const blocks = [block("b0", "## Intro", { type: "heading", level: 2 }), block("b1", "texto"), block("b2", "### Detalle", { type: "heading", level: 3 })];

    expect(outline(blocks)).toEqual([
      { blockId: "b0", level: 2, text: "Intro" },
      { blockId: "b2", level: 3, text: "Detalle" },
    ]);
  });

  it("returns an empty outline when there are no headings", () => {
    expect(outline([block("b0", "texto")])).toEqual([]);
  });
});

describe("blockFingerprint", () => {
  it("is stable for the same block and changes when the markdown or type changes", () => {
    const base = block("b0", "hola");

    expect(blockFingerprint(base)).toBe(blockFingerprint({ ...base }));
    expect(blockFingerprint(base)).not.toBe(blockFingerprint(block("b0", "hola!")));
    expect(blockFingerprint(base)).not.toBe(blockFingerprint({ ...base, type: "heading", level: 2 }));
  });

  it("does not depend on the block id, so a moved block keeps its fingerprint", () => {
    expect(blockFingerprint(block("b0", "hola"))).toBe(blockFingerprint(block("b7", "hola")));
  });
});

describe("docFingerprint", () => {
  it("is stable for the same blocks and reacts to edits, reordering and removals", () => {
    const a = block("b0", "uno");
    const b = block("b1", "dos");

    expect(docFingerprint([a, b])).toBe(docFingerprint([{ ...a }, { ...b }]));
    expect(docFingerprint([a, b])).not.toBe(docFingerprint([a, block("b1", "dos!")]));
    expect(docFingerprint([a, b])).not.toBe(docFingerprint([block("b0", "dos"), block("b1", "uno")]));
    expect(docFingerprint([a, b])).not.toBe(docFingerprint([a]));
  });

  it("is an 8-character hex string", () => {
    expect(docFingerprint([])).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("selectionToBlockIds", () => {
  const ranges = [
    { id: "b0", from: 0, to: 10 },
    { id: "b1", from: 10, to: 30 },
    { id: "b2", from: 30, to: 40 },
  ];

  it("returns every block a range selection touches", () => {
    expect(selectionToBlockIds(ranges, { from: 5, to: 35 })).toEqual(["b0", "b1", "b2"]);
  });

  it("does not include a block that the selection only borders", () => {
    expect(selectionToBlockIds(ranges, { from: 10, to: 30 })).toEqual(["b1"]);
  });

  it("returns the block that contains a collapsed cursor", () => {
    expect(selectionToBlockIds(ranges, { from: 15, to: 15 })).toEqual(["b1"]);
  });

  it("returns nothing when the selection is outside every block", () => {
    expect(selectionToBlockIds(ranges, { from: 50, to: 60 })).toEqual([]);
  });
});

describe("buildSnapshot", () => {
  const nodes = [
    { node: heading(2, "Intro"), from: 0, to: 8 },
    { node: paragraph("uno"), from: 8, to: 13 },
    { node: paragraph("dos"), from: 13, to: 18 },
  ];

  it("builds title, blocks and fingerprint", () => {
    const snapshot = buildSnapshot({ title: "Mi artículo", nodes, selection: null, serialize });

    expect(snapshot.title).toBe("Mi artículo");
    expect(snapshot.blocks.map((item) => item.id)).toEqual(["b0", "b1", "b2"]);
    expect(snapshot.selection).toBeNull();
    expect(snapshot.fingerprint).toBe(docFingerprint(snapshot.blocks));
  });

  it("maps a text selection to the blocks it touches", () => {
    const snapshot = buildSnapshot({ title: "", nodes, selection: { from: 9, to: 16, text: "no\ndo" }, serialize });

    expect(snapshot.selection).toEqual({ blockIds: ["b1", "b2"], text: "no\ndo" });
  });

  it("treats a collapsed cursor as no selection", () => {
    const snapshot = buildSnapshot({ title: "", nodes, selection: { from: 10, to: 10, text: "" }, serialize });

    expect(snapshot.selection).toBeNull();
  });

  it("drops a selection that touches no known block", () => {
    const snapshot = buildSnapshot({ title: "", nodes, selection: { from: 100, to: 120, text: "x" }, serialize });

    expect(snapshot.selection).toBeNull();
  });
});

describe("fitBlocks", () => {
  const blocks = [block("b0", "a".repeat(10)), block("b1", "b".repeat(10)), block("b2", "c".repeat(10)), block("b3", "d".repeat(10))];

  it("keeps everything that fits", () => {
    expect(fitBlocks(blocks, { maxChars: 100, maxBlocks: 10 })).toEqual({ blocks, omitted: 0 });
  });

  it("drops the tail by whole blocks and reports how many were left out", () => {
    const result = fitBlocks(blocks, { maxChars: 25, maxBlocks: 10 });

    expect(result.blocks.map((item) => item.id)).toEqual(["b0", "b1"]);
    expect(result.omitted).toBe(2);
  });

  it("respects the block count limit", () => {
    const result = fitBlocks(blocks, { maxChars: 1000, maxBlocks: 3 });

    expect(result.blocks.map((item) => item.id)).toEqual(["b0", "b1", "b2"]);
    expect(result.omitted).toBe(1);
  });

  it("keeps pinned blocks even when they sit past the budget, in document order", () => {
    const result = fitBlocks(blocks, { maxChars: 25, maxBlocks: 10, pinnedIds: ["b3"] });

    expect(result.blocks.map((item) => item.id)).toEqual(["b0", "b3"]);
    expect(result.omitted).toBe(2);
  });

  it("omits a single block bigger than the whole budget", () => {
    const result = fitBlocks([block("b0", "x".repeat(50)), block("b1", "corto")], { maxChars: 20, maxBlocks: 10 });

    expect(result.blocks.map((item) => item.id)).toEqual(["b1"]);
    expect(result.omitted).toBe(1);
  });
});

describe("toRequestContext", () => {
  const snapshot = {
    title: "Título",
    blocks: [block("b0", "uno"), block("b1", "dos"), block("b2", "x".repeat(40))],
    selection: { blockIds: ["b2"], text: "y".repeat(30) },
    fingerprint: "deadbeef",
  };

  it("passes the snapshot through when it fits the limits", () => {
    const context = toRequestContext(snapshot, { maxChars: 1000, maxBlocks: 10, maxSelectionChars: 100 });

    expect(context).toEqual({ ...snapshot, totalBlocks: 3 });
  });

  it("fits the blocks, pins the selected ones and reports the real block count", () => {
    const context = toRequestContext(snapshot, { maxChars: 40, maxBlocks: 10, maxSelectionChars: 100 });

    expect(context.blocks.map((item) => item.id)).toEqual(["b2"]);
    expect(context.totalBlocks).toBe(3);
  });

  it("caps the selection text", () => {
    const context = toRequestContext(snapshot, { maxChars: 1000, maxBlocks: 10, maxSelectionChars: 10 });

    expect(context.selection?.text).toBe("y".repeat(10));
  });

  it("keeps a missing selection as null", () => {
    expect(toRequestContext({ ...snapshot, selection: null }, { maxChars: 1000, maxBlocks: 10, maxSelectionChars: 10 }).selection).toBeNull();
  });
});

describe("buildLiveDoc", () => {
  const nodes = [
    { node: heading(2, "Intro"), from: 0, to: 8 },
    { node: paragraph(""), from: 8, to: 10 },
    { node: paragraph("uno"), from: 10, to: 15 },
  ];
  const cursor = { from: 12, to: 12, head: 12, text: "" };

  it("keeps the extent of every non-empty block, with ids aligned to the document", () => {
    const live = buildLiveDoc({ nodes, selection: cursor, endPos: 15, markdownLength: 42, serialize });

    expect(live.blocks).toEqual([
      { id: "b0", type: "heading", level: 2, markdown: "## Intro", from: 0, to: 8 },
      { id: "b2", type: "paragraph", markdown: "uno", from: 10, to: 15 },
    ]);
  });

  it("carries the live selection (collapsed or not), the end position and the markdown length", () => {
    const selection = { from: 3, to: 6, head: 6, text: "ntr" };

    expect(buildLiveDoc({ nodes, selection, endPos: 15, markdownLength: 42, serialize })).toMatchObject({
      selection,
      endPos: 15,
      markdownLength: 42,
    });
  });

  it("agrees with the snapshot on block ids and fingerprints", () => {
    const live = buildLiveDoc({ nodes, selection: cursor, endPos: 15, markdownLength: 0, serialize });
    const snapshot = buildSnapshot({ title: "", nodes, selection: null, serialize });

    expect(live.blocks.map(blockFingerprint)).toEqual(snapshot.blocks.map(blockFingerprint));
    expect(live.blocks.map((item) => item.id)).toEqual(snapshot.blocks.map((item) => item.id));
  });
});
