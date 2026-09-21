import { describe, expect, it } from "vitest";
import { CHAT_HISTORY_MAX_TURNS } from "@/features/ai/constants";
import type { EditAction } from "@/features/ai/schemas";
import type { EditorSnapshot } from "@/features/posts/components/editor/editor-context";
import {
  addAction,
  advancePlan,
  appendDelta,
  applicableActions,
  applyFailureNotice,
  dropFailedReply,
  finishPlan,
  formatMessageTime,
  isNearBottom,
  markApplied,
  markDiscarded,
  markError,
  markStale,
  markUndoFailed,
  markUndone,
  settleReply,
  shouldShowSteps,
  startPlan,
  shouldSubmitOnEnter,
  toRequestMessages,
  upsertStep,
  type ChatEntry,
} from "./chat-state";

const user = (id: string, content: string): ChatEntry => ({ id, role: "user", content, createdAt: 1 });
const reply = (id: string, content: string, extra: Partial<ChatEntry> = {}): ChatEntry => ({
  id,
  role: "assistant",
  content,
  createdAt: 2,
  ...extra,
});

describe("appendDelta", () => {
  it("grows only the targeted assistant entry", () => {
    const entries = [user("u1", "hola"), reply("a1", "Ho", { streaming: true })];

    const next = appendDelta(entries, "a1", "la");

    expect(next[1].content).toBe("Hola");
    expect(next[0]).toBe(entries[0]);
    expect(entries[1].content).toBe("Ho");
  });
});

describe("settleReply", () => {
  const streaming = [user("u1", "hola"), reply("a1", "Hola", { streaming: true })];

  it("marks the reply as finished on success", () => {
    expect(settleReply(streaming, "a1", { ok: true, data: null })[1]).toEqual(reply("a1", "Hola", { streaming: false }));
  });

  it("keeps the partial text when the user stops the stream", () => {
    const next = settleReply(streaming, "a1", { ok: false, error: { kind: "aborted", message: "x" } });

    expect(next[1]).toMatchObject({ content: "Hola", streaming: false });
    expect(next[1].error).toBeUndefined();
  });

  it("removes a reply that is empty when the user stops the stream", () => {
    const empty = [user("u1", "hola"), reply("a1", "", { streaming: true })];

    expect(settleReply(empty, "a1", { ok: false, error: { kind: "aborted", message: "x" } })).toEqual([user("u1", "hola")]);
  });

  it("attaches the error to the reply and keeps what was streamed", () => {
    const error = { kind: "timeout" as const, message: "Tardó demasiado" };

    const next = settleReply(streaming, "a1", { ok: false, error });

    expect(next[1]).toMatchObject({ content: "Hola", streaming: false, error });
  });
});

describe("dropFailedReply", () => {
  it("removes a trailing assistant entry that failed so the last user message can be resent", () => {
    const failed = [user("u1", "hola"), reply("a1", "", { error: { kind: "timeout", message: "t" } })];

    expect(dropFailedReply(failed)).toEqual([user("u1", "hola")]);
  });

  it("leaves a healthy conversation alone", () => {
    const entries = [user("u1", "hola"), reply("a1", "ok")];

    expect(dropFailedReply(entries)).toBe(entries);
  });
});

describe("toRequestMessages", () => {
  it("maps entries to request messages and skips empty replies", () => {
    const entries = [user("u1", "hola"), reply("a1", ""), user("u2", "¿estás?")];

    expect(toRequestMessages(entries)).toEqual([
      { role: "user", content: "hola" },
      { role: "user", content: "¿estás?" },
    ]);
  });

  it("caps the history and always ends with the newest message", () => {
    const entries = Array.from({ length: 60 }, (_, index) =>
      index % 2 === 0 ? user(`u${index}`, `p${index}`) : reply(`a${index}`, `r${index}`),
    );
    entries.push(user("last", "final"));

    const messages = toRequestMessages(entries);

    expect(messages.length).toBeLessThanOrEqual(CHAT_HISTORY_MAX_TURNS);
    expect(messages.at(-1)).toEqual({ role: "user", content: "final" });
  });
});

describe("isNearBottom", () => {
  it("is true at the bottom and within the threshold", () => {
    expect(isNearBottom({ scrollTop: 500, clientHeight: 300, scrollHeight: 800 })).toBe(true);
    expect(isNearBottom({ scrollTop: 470, clientHeight: 300, scrollHeight: 800 })).toBe(true);
  });

  it("is false once the user scrolled up", () => {
    expect(isNearBottom({ scrollTop: 100, clientHeight: 300, scrollHeight: 800 })).toBe(false);
  });

  it("is true when there is nothing to scroll", () => {
    expect(isNearBottom({ scrollTop: 0, clientHeight: 300, scrollHeight: 300 })).toBe(true);
  });
});

describe("shouldSubmitOnEnter", () => {
  const enter = { key: "Enter", shiftKey: false, isComposing: false, keyCode: 13 };

  it("submits on a plain Enter", () => {
    expect(shouldSubmitOnEnter(enter)).toBe(true);
  });

  it("keeps Shift+Enter for a newline", () => {
    expect(shouldSubmitOnEnter({ ...enter, shiftKey: true })).toBe(false);
  });

  it("does not submit while an IME composition is active", () => {
    expect(shouldSubmitOnEnter({ ...enter, isComposing: true })).toBe(false);
    expect(shouldSubmitOnEnter({ ...enter, keyCode: 229 })).toBe(false);
  });

  it("ignores other keys", () => {
    expect(shouldSubmitOnEnter({ ...enter, key: "a" })).toBe(false);
  });
});

describe("formatMessageTime", () => {
  const at = Date.UTC(2026, 0, 5, 17, 5);
  const buenosAires = "America/Argentina/Buenos_Aires";

  it("renders a zero-padded 24-hour hh:mm in the given time zone", () => {
    expect(formatMessageTime(at, "es-AR", buenosAires)).toBe("14:05");
    expect(formatMessageTime(Date.UTC(2026, 0, 5, 3, 9), "es-AR", "UTC")).toBe("03:09");
  });

  it("follows the time zone instead of the machine", () => {
    expect(formatMessageTime(at, "es-AR", "UTC")).toBe("17:05");
  });
});

const snapshot: EditorSnapshot = { title: "T", blocks: [], selection: null, fingerprint: "00000000" };
const append: EditAction = { op: "append", markdown: "Fin" };
const step = (id: string, status: "pending" | "running" | "done", label = id) => ({ id, label, status });

describe("addAction", () => {
  const entries = [user("u1", "hola"), reply("a1", "", { streaming: true })];

  it("adds a pending action with the snapshot it was proposed against, to the targeted reply only", () => {
    const next = addAction(entries, "a1", append, snapshot);

    expect(next[1].actions).toEqual([{ id: "a1-a1", action: append, snapshot, status: "pending" }]);
    expect(next[0]).toBe(entries[0]);
    expect(entries[1].actions).toBeUndefined();
  });

  it("gives every action of a reply its own id", () => {
    const next = addAction(addAction(entries, "a1", append, snapshot), "a1", { op: "append", markdown: "Otro" }, snapshot);

    expect(next[1].actions?.map((item) => item.id)).toEqual(["a1-a1", "a1-a2"]);
  });
});

describe("upsertStep", () => {
  const entries = [reply("a1", "", { streaming: true })];

  it("appends new steps in arrival order", () => {
    const next = upsertStep(upsertStep(entries, "a1", step("read", "done")), "a1", step("analyze", "done"));

    expect(next[0].steps?.map((item) => item.id)).toEqual(["read", "analyze"]);
  });

  it("updates an existing step in place instead of duplicating it", () => {
    const first = upsertStep(upsertStep(entries, "a1", step("propose", "running")), "a1", step("read", "done"));

    const next = upsertStep(first, "a1", step("propose", "done"));

    expect(next[0].steps).toEqual([step("propose", "done"), step("read", "done")]);
  });

  it("ignores an unknown reply", () => {
    expect(upsertStep(entries, "zzz", step("read", "done"))).toEqual(entries);
  });
});

describe("action status reducers", () => {
  const base = addAction(addAction([reply("a1", "ok")], "a1", append, snapshot), "a1", { op: "append", markdown: "Otro" }, snapshot);
  const statusOf = (entries: ChatEntry[]) => entries[0].actions?.map((item) => item.status);

  it("markApplied stores the undo token and clears any earlier notice", () => {
    const failed = markError(base, "a1", "a1-a1", "Falló");

    const next = markApplied(failed, "a1", "a1-a1", { id: "undo-1" });

    expect(next[0].actions?.[0]).toMatchObject({ status: "applied", undo: { id: "undo-1" } });
    expect(next[0].actions?.[0].notice).toBeUndefined();
    expect(statusOf(next)).toEqual(["applied", "pending"]);
  });

  it("markDiscarded, markStale and markError only touch the targeted action", () => {
    expect(statusOf(markDiscarded(base, "a1", "a1-a2"))).toEqual(["pending", "discarded"]);
    expect(statusOf(markStale(base, "a1", "a1-a1", "Cambió"))).toEqual(["stale", "pending"]);
    expect(statusOf(markError(base, "a1", "a1-a2", "Falló"))).toEqual(["pending", "error"]);
  });

  it("markStale and markError keep the message for the card", () => {
    expect(markStale(base, "a1", "a1-a1", "Cambió")[0].actions?.[0].notice).toBe("Cambió");
    expect(markError(base, "a1", "a1-a1", "Falló")[0].actions?.[0].notice).toBe("Falló");
  });

  it("markUndone puts an applied action back to pending and drops the undo token", () => {
    const applied = markApplied(base, "a1", "a1-a1", { id: "undo-1" });

    const next = markUndone(applied, "a1", "a1-a1");

    expect(next[0].actions?.[0]).toMatchObject({ status: "pending" });
    expect(next[0].actions?.[0].undo).toBeUndefined();
  });

  it("markUndoFailed keeps the action applied and explains why", () => {
    const applied = markApplied(base, "a1", "a1-a1", { id: "undo-1" });

    const next = markUndoFailed(applied, "a1", "a1-a1", "Editaste el artículo");

    expect(next[0].actions?.[0]).toMatchObject({ status: "applied", undo: { id: "undo-1" }, notice: "Editaste el artículo" });
  });

  it("does not mutate the previous state and ignores unknown ids", () => {
    const next = markDiscarded(base, "a1", "a1-a1");

    expect(base[0].actions?.[0].status).toBe("pending");
    expect(markDiscarded(base, "a1", "nope")).toEqual(base);
    expect(markDiscarded(base, "zzz", "a1-a1")).toEqual(base);
    expect(next).not.toBe(base);
  });
});

describe("applicableActions", () => {
  const withStatuses = (streaming: boolean) => {
    let entries: ChatEntry[] = [reply("a1", "ok", { streaming })];
    for (const markdown of ["1", "2", "3", "4", "5"]) entries = addAction(entries, "a1", { op: "append", markdown }, snapshot);
    entries = markApplied(entries, "a1", "a1-a1", { id: "u" });
    entries = markDiscarded(entries, "a1", "a1-a2");
    entries = markStale(entries, "a1", "a1-a3", "x");
    entries = markError(entries, "a1", "a1-a4", "x");
    return entries[0];
  };

  it("lists the pending and failed ones once the reply finished streaming", () => {
    expect(applicableActions(withStatuses(false)).map((item) => item.id)).toEqual(["a1-a4", "a1-a5"]);
  });

  it("lists nothing while the reply is still streaming", () => {
    expect(applicableActions(withStatuses(true))).toEqual([]);
  });

  it("returns an empty list for a reply without actions", () => {
    expect(applicableActions(reply("a1", "ok"))).toEqual([]);
  });
});

describe("shouldShowSteps", () => {
  const steps = [step("read", "done"), step("analyze", "done")];
  const action = { id: "a1-a1", action: append, snapshot, status: "pending" as const };

  it("shows the steps while the answer is streaming", () => {
    expect(shouldShowSteps(reply("a1", "", { streaming: true, steps }))).toBe(true);
  });

  it("hides them for a finished text-only answer", () => {
    expect(shouldShowSteps(reply("a1", "ok", { steps }))).toBe(false);
  });

  it("keeps them for a finished answer that carries proposals", () => {
    expect(shouldShowSteps(reply("a1", "ok", { steps, actions: [action] }))).toBe(true);
  });

  it("has nothing to show without steps", () => {
    expect(shouldShowSteps(reply("a1", "ok", { streaming: true }))).toBe(false);
  });
});

describe("plan step progress", () => {
  const plan = (...statuses: ("pending" | "running" | "done")[]) => statuses.map((status, index) => step(`plan-${index + 1}`, status));
  const system = [step("read", "done"), step("analyze", "done")];
  const withSteps = (steps: ReturnType<typeof step>[], extra: Partial<ChatEntry> = {}): ChatEntry[] => [
    reply("a1", "ok", { streaming: true, steps, ...extra }),
  ];
  const statuses = (entries: ChatEntry[]) => entries[0].steps?.filter((item) => item.id.startsWith("plan-")).map((item) => item.status);

  describe("startPlan", () => {
    it("marks the first plan step as running once the plan is known", () => {
      expect(statuses(startPlan(withSteps([...system, ...plan("pending", "pending")]), "a1"))).toEqual(["running", "pending"]);
    });

    it("does nothing when a plan step is already running or done", () => {
      expect(statuses(startPlan(withSteps(plan("running", "pending")), "a1"))).toEqual(["running", "pending"]);
      expect(statuses(startPlan(withSteps(plan("done", "pending")), "a1"))).toEqual(["done", "pending"]);
    });

    it("does nothing without plan steps and leaves system steps alone", () => {
      const entries = withSteps(system);

      expect(startPlan(entries, "a1")).toEqual(entries);
    });
  });

  describe("advancePlan", () => {
    it("finishes the running step and starts the next one", () => {
      expect(statuses(advancePlan(withSteps(plan("running", "pending", "pending")), "a1"))).toEqual(["done", "running", "pending"]);
    });

    it("finishes the first pending step when none was started yet", () => {
      expect(statuses(advancePlan(withSteps(plan("pending", "pending")), "a1"))).toEqual(["done", "running"]);
    });

    it("leaves nothing running after the last step", () => {
      expect(statuses(advancePlan(withSteps(plan("done", "running")), "a1"))).toEqual(["done", "done"]);
    });

    it("does nothing when every plan step is done or there is no plan", () => {
      const done = withSteps(plan("done", "done"));
      const none = withSteps(system);

      expect(advancePlan(done, "a1")).toEqual(done);
      expect(advancePlan(none, "a1")).toEqual(none);
    });

    it("never touches the deterministic steps", () => {
      const next = advancePlan(withSteps([...system, step("propose", "running"), ...plan("pending")]), "a1");

      expect(next[0].steps?.filter((item) => !item.id.startsWith("plan-"))).toEqual([...system, step("propose", "running")]);
    });
  });

  describe("finishPlan", () => {
    const action = { id: "a1-a1", action: append, snapshot, status: "applied" as const };

    it("completes pending steps that had an action even if the plan arrived after the proposals", () => {
      const entries = withSteps(plan("pending", "pending", "pending"), { actions: [action, { ...action, id: "a1-a2" }] });

      expect(statuses(finishPlan(entries, "a1"))).toEqual(["done", "done", "pending"]);
    });

    it("counts the steps already done against the actions", () => {
      const entries = withSteps(plan("done", "running", "pending"), { actions: [action, { ...action, id: "a1-a2" }] });

      expect(statuses(finishPlan(entries, "a1"))).toEqual(["done", "done", "pending"]);
    });

    it("stops a step that never got an action from spinning, without pretending it was done", () => {
      const entries = withSteps(plan("done", "running", "pending"), { actions: [action] });

      expect(statuses(finishPlan(entries, "a1"))).toEqual(["done", "pending", "pending"]);
    });

    it("leaves a plan without any action as it was, minus the spinner", () => {
      expect(statuses(finishPlan(withSteps(plan("running", "pending")), "a1"))).toEqual(["pending", "pending"]);
    });

    it("ignores a reply without steps", () => {
      const entries = [reply("a1", "ok")];

      expect(finishPlan(entries, "a1")).toEqual(entries);
    });
  });
});

describe("overlapping proposals", () => {
  const blocks = [0, 1, 2].map((index) => ({ id: `b${index}`, type: "paragraph", markdown: `p${index}` }));
  const overlapSnapshot: EditorSnapshot = { title: "T", blocks, selection: null, fingerprint: "00000000" };
  const replaceBlock = (blockId: string): EditAction => ({ op: "replace_block", blockId, markdown: "x" });
  const build = (...actions: EditAction[]) =>
    actions.reduce((entries, action) => addAction(entries, "a1", action, overlapSnapshot), [reply("a1", "ok")]);

  it("flags a later proposal that collides with an earlier one and keeps the earlier one clean", () => {
    const [entry] = build(replaceBlock("b1"), replaceBlock("b1"), replaceBlock("b2"));

    expect(entry.actions?.map((item) => item.overlapsWith)).toEqual([undefined, "a1-a1", undefined]);
  });

  it("keeps the flagged proposal pending so it can still be applied on its own", () => {
    const [entry] = build(replaceBlock("b1"), replaceBlock("b1"));

    expect(entry.actions?.[1].status).toBe("pending");
  });

  it("leaves flagged proposals out of the apply-all list", () => {
    const [entry] = build(replaceBlock("b1"), replaceBlock("b1"), replaceBlock("b2"));

    expect(applicableActions(entry).map((item) => item.id)).toEqual(["a1-a1", "a1-a3"]);
  });

  it("releases the flagged proposal when the one it collided with is discarded", () => {
    const discarded = markDiscarded(build(replaceBlock("b1"), replaceBlock("b1")), "a1", "a1-a1");

    expect(discarded[0].actions?.[1].overlapsWith).toBeUndefined();
    expect(applicableActions(discarded[0]).map((item) => item.id)).toEqual(["a1-a2"]);
  });

  it("explains an overlap instead of the generic stale message", () => {
    const [entry] = build(replaceBlock("b1"), replaceBlock("b1"));
    const [first, second] = entry.actions ?? [];

    expect(applyFailureNotice(second, "El artículo cambió")).toContain("se superpone con otro cambio");
    expect(applyFailureNotice(first, "El artículo cambió")).toBe("El artículo cambió");
  });
});
