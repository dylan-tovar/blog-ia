import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapGeminiError } from "./errors";
import { withFirstChunkDeadline } from "./first-chunk-deadline";

async function collect<T>(source: AsyncIterable<T>) {
  const items: T[] = [];
  for await (const item of source) items.push(item);
  return items;
}

// Never yields; only settles when the abort callback rejects it, like an aborted fetch.
function stalledSource(onReturn = vi.fn()) {
  let rejectPending: (reason: Error) => void = () => undefined;
  const source: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => ({
      next: () => new Promise((_, reject) => (rejectPending = reject)),
      return: async () => {
        onReturn();
        return { done: true, value: undefined };
      },
    }),
  };
  return { source, onReturn, abortUpstream: () => rejectPending(new Error("aborted")) };
}

async function* chunks(...values: string[]) {
  for (const value of values) yield value;
}

describe("withFirstChunkDeadline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes every chunk through untouched", async () => {
    await expect(collect(withFirstChunkDeadline(chunks("a", "b", "c"), 1_000))).resolves.toEqual(["a", "b", "c"]);
  });

  it("throws an error mapped to timeout when no chunk arrives in time", async () => {
    const { source } = stalledSource();
    const result = collect(withFirstChunkDeadline(source, 1_000));
    const assertion = expect(result).rejects.toSatisfy((error) => mapGeminiError(error).kind === "timeout");

    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it("does not fire before the deadline", async () => {
    const { source } = stalledSource();
    const iterator = withFirstChunkDeadline(source, 1_000)[Symbol.asyncIterator]();
    const settled = vi.fn();
    void iterator.next().then(settled, settled);

    await vi.advanceTimersByTimeAsync(999);

    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("calls onTimeout when the deadline fires so the caller can abort the upstream request", async () => {
    const { source } = stalledSource();
    const onTimeout = vi.fn();
    const result = collect(withFirstChunkDeadline(source, 1_000, onTimeout));
    const assertion = expect(result).rejects.toBeDefined();

    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("releases the source when it times out", async () => {
    const { source, onReturn, abortUpstream } = stalledSource();
    const result = collect(withFirstChunkDeadline(source, 1_000, abortUpstream));
    const assertion = expect(result).rejects.toBeDefined();

    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;

    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it("does not time out slow chunks after the first one", async () => {
    const onTimeout = vi.fn();
    async function* slowAfterFirst() {
      yield "first";
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      yield "second";
    }

    const result = collect(withFirstChunkDeadline(slowAfterFirst(), 1_000, onTimeout));
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(result).resolves.toEqual(["first", "second"]);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its timer once the first chunk arrives", async () => {
    const iterator = withFirstChunkDeadline(chunks("a", "b"), 1_000)[Symbol.asyncIterator]();

    await iterator.next();

    expect(vi.getTimerCount()).toBe(0);
    await iterator.return?.(undefined);
  });

  it("propagates errors thrown by the source before the first chunk", async () => {
    const failure = new Error("boom");
    async function* failing(): AsyncGenerator<string> {
      throw failure;
    }

    await expect(collect(withFirstChunkDeadline(failing(), 1_000))).rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates errors thrown by the source after the first chunk", async () => {
    const failure = new Error("boom");
    async function* failingLate() {
      yield "first";
      throw failure;
    }

    await expect(collect(withFirstChunkDeadline(failingLate(), 1_000))).rejects.toBe(failure);
  });

  it("releases the source and the timer when the consumer stops early", async () => {
    const closed = vi.fn();
    async function* endless() {
      try {
        yield "a";
        yield "b";
      } finally {
        closed();
      }
    }

    for await (const chunk of withFirstChunkDeadline(endless(), 1_000)) {
      expect(chunk).toBe("a");
      break;
    }

    expect(closed).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases the source and the timer when the request is aborted before the first chunk", async () => {
    const { source, onReturn, abortUpstream } = stalledSource();
    const iterator = withFirstChunkDeadline(source, 1_000)[Symbol.asyncIterator]();
    const pending = iterator.next().catch(() => undefined);
    const returned = iterator.return?.(undefined);

    abortUpstream();
    await pending;
    await returned;

    expect(onReturn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
