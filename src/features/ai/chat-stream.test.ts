import { describe, expect, it } from "vitest";
import { CHAT_MAX_ACTIONS } from "./constants";
import { isAiError } from "./errors";
import { runChatStream, validateAction, type ChatStreamContext, type DropInfo } from "./chat-stream";
import type { EditAction } from "./schemas";
import type { ChatStreamPart } from "./types";

const blocks = [
  { id: "b0", type: "heading", level: 2, markdown: "## Intro" },
  { id: "b1", type: "paragraph", markdown: "uno" },
  { id: "b3", type: "paragraph", markdown: "tres" },
];

const context = (overrides: Partial<ChatStreamContext> = {}): ChatStreamContext => ({
  blocks,
  totalBlocks: 3,
  hasSelection: false,
  ...overrides,
});

const append: EditAction = { op: "append", markdown: "Fin" };

describe("validateAction", () => {
  it.each<[string, EditAction]>([
    ["append", append],
    ["insert_after_block on a known block", { op: "insert_after_block", blockId: "b1", markdown: "x" }],
    ["replace_block on a known block", { op: "replace_block", blockId: "b3", markdown: "x" }],
    ["replace_range over known blocks", { op: "replace_range", fromBlockId: "b0", toBlockId: "b1", markdown: "x" }],
    ["replace_range over a single block", { op: "replace_range", fromBlockId: "b1", toBlockId: "b1", markdown: "x" }],
  ])("accepts %s", (_label, action) => {
    expect(validateAction(action, context())).toBeNull();
  });

  it.each<[string, EditAction, string]>([
    ["insert_after_block on an unknown block", { op: "insert_after_block", blockId: "b9", markdown: "x" }, "unknown_block"],
    ["replace_block on an unknown block", { op: "replace_block", blockId: "b2", markdown: "x" }, "unknown_block"],
    ["replace_range with an unknown start", { op: "replace_range", fromBlockId: "b9", toBlockId: "b3", markdown: "x" }, "unknown_block"],
    ["replace_range with an unknown end", { op: "replace_range", fromBlockId: "b0", toBlockId: "b9", markdown: "x" }, "unknown_block"],
    ["replace_range in reverse order", { op: "replace_range", fromBlockId: "b3", toBlockId: "b0", markdown: "x" }, "bad_range"],
  ])("drops %s", (_label, action, reason) => {
    expect(validateAction(action, context())).toBe(reason);
  });

  it.each<EditAction>([
    { op: "replace_selection", markdown: "x" },
    { op: "insert_at_selection", markdown: "x" },
  ])("needs a selection for $op", (action) => {
    expect(validateAction(action, context())).toBe("no_selection");
    expect(validateAction(action, context({ hasSelection: true }))).toBeNull();
  });

  it("refuses a range over blocks the model never saw when the article was cut", () => {
    const cut = context({ totalBlocks: 10 });
    const acrossGap: EditAction = { op: "replace_range", fromBlockId: "b1", toBlockId: "b3", markdown: "x" };

    expect(validateAction(acrossGap, cut)).toBe("bad_range");
    expect(validateAction({ op: "replace_range", fromBlockId: "b0", toBlockId: "b1", markdown: "x" }, cut)).toBeNull();
  });

  it("allows the same range when nothing was cut (the gap is an empty node)", () => {
    expect(validateAction({ op: "replace_range", fromBlockId: "b1", toBlockId: "b3", markdown: "x" }, context())).toBeNull();
  });
});

async function* from(...parts: ChatStreamPart[]) {
  for (const part of parts) yield part;
}

async function collect(source: AsyncIterable<ChatStreamPart>, ctx = context()) {
  const drops: DropInfo[] = [];
  const parts: ChatStreamPart[] = [];
  for await (const part of runChatStream(source, { ...ctx, onDrop: (info) => drops.push(info) })) parts.push(part);
  return { parts, drops };
}

const text = (value: string): ChatStreamPart => ({ kind: "text", text: value });
const action = (value: EditAction): ChatStreamPart => ({ kind: "action", action: value });
const stepOf = (parts: ChatStreamPart[]) =>
  parts.flatMap((part) => (part.kind === "step" ? [`${part.step.id}:${part.step.status}`] : []));

describe("runChatStream", () => {
  it("opens with the deterministic reading and analysing steps, before any model output", async () => {
    const { parts } = await collect(from(text("Hola")));

    expect(parts.slice(0, 2)).toEqual([
      { kind: "step", step: { id: "read", label: "Leyendo el artículo", status: "done" } },
      { kind: "step", step: { id: "analyze", label: "Analizando estructura", status: "done" } },
    ]);
    expect(parts[2]).toEqual(text("Hola"));
  });

  it("does not announce a proposal for a text-only answer", async () => {
    const { parts } = await collect(from(text("Respuesta")));

    expect(stepOf(parts)).toEqual(["read:done", "analyze:done"]);
  });

  it("marks the proposal running at the first action and done when the answer ends", async () => {
    const { parts } = await collect(from(text("Te propongo"), action(append), action({ op: "append", markdown: "Otro" })));

    expect(stepOf(parts)).toEqual(["read:done", "analyze:done", "propose:running", "propose:done"]);
    expect(parts.filter((part) => part.kind === "action")).toHaveLength(2);
    expect(parts.at(-1)).toMatchObject({ kind: "step", step: { id: "propose", status: "done" } });
    expect(parts.findIndex((part) => part.kind === "step" && part.step.status === "running")).toBeLessThan(
      parts.findIndex((part) => part.kind === "action"),
    );
  });

  it("passes model plan steps through and starts the proposal step with them", async () => {
    const plan: ChatStreamPart = { kind: "step", step: { id: "plan-1", label: "Redactar", status: "pending" } };

    const { parts } = await collect(from(plan, action(append)));

    expect(parts).toContainEqual(plan);
    expect(stepOf(parts)).toContain("propose:running");
  });

  it("drops actions that do not match the article, reports metadata only and keeps the rest", async () => {
    const bad: EditAction = { op: "replace_block", blockId: "b42", markdown: "SECRETO" };

    const { parts, drops } = await collect(from(action(bad), text("sigue"), action(append)));

    expect(parts.filter((part) => part.kind === "action")).toEqual([action(append)]);
    expect(parts).toContainEqual(text("sigue"));
    expect(drops).toEqual([{ op: "replace_block", reason: "unknown_block" }]);
    expect(JSON.stringify(drops)).not.toContain("SECRETO");
  });

  it("does not start the proposal step when every action was dropped", async () => {
    const { parts } = await collect(from(action({ op: "replace_selection", markdown: "x" }), text("Listo")));

    expect(stepOf(parts)).toEqual(["read:done", "analyze:done"]);
  });

  it("accepts selection actions when the request has a selection", async () => {
    const { parts, drops } = await collect(from(action({ op: "replace_selection", markdown: "x" })), context({ hasSelection: true }));

    expect(parts.filter((part) => part.kind === "action")).toHaveLength(1);
    expect(drops).toEqual([]);
  });

  it("caps the number of actions per answer", async () => {
    const many = Array.from({ length: CHAT_MAX_ACTIONS + 2 }, (_, index) => action({ op: "append", markdown: `n${index}` }));

    const { parts, drops } = await collect(from(...many));

    expect(parts.filter((part) => part.kind === "action")).toHaveLength(CHAT_MAX_ACTIONS);
    expect(drops).toEqual([
      { op: "append", reason: "too_many_actions" },
      { op: "append", reason: "too_many_actions" },
    ]);
  });

  it.each([
    ["nothing at all", []],
    ["only a dropped action", [action({ op: "replace_selection", markdown: "x" })]],
    ["only a plan", [{ kind: "step", step: { id: "plan-1", label: "Redactar", status: "pending" } } as ChatStreamPart]],
  ])("fails with invalid_response when the answer has no text and no valid action (%s)", async (_label, parts) => {
    let thrown: unknown;
    try {
      await collect(from(...parts));
    } catch (error) {
      thrown = error;
    }

    expect(isAiError(thrown) && thrown.kind).toBe("invalid_response");
  });

  it("does not finish the proposal step when the source fails", async () => {
    async function* failing(): AsyncGenerator<ChatStreamPart> {
      yield action(append);
      throw new Error("boom");
    }
    const seen: ChatStreamPart[] = [];

    await expect(
      (async () => {
        for await (const part of runChatStream(failing(), context())) seen.push(part);
      })(),
    ).rejects.toThrow("boom");

    expect(stepOf(seen)).toEqual(["read:done", "analyze:done", "propose:running"]);
  });
});
