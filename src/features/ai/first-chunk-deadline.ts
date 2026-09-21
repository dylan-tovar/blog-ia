import { AiError } from "./errors";

// Fails fast when the upstream stalls before its first chunk; later chunks are not time-limited.
// `onTimeout` lets the caller abort the underlying request so it is cancelled, not just ignored.
export async function* withFirstChunkDeadline<T>(
  source: AsyncIterable<T>,
  ms: number,
  onTimeout?: () => void,
): AsyncGenerator<T> {
  const iterator = source[Symbol.asyncIterator]();
  let completed = false;

  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        onTimeout?.();
        reject(new AiError("timeout"));
      }, ms);
    });

    let result: IteratorResult<T>;
    try {
      result = await Promise.race([iterator.next(), deadline]);
    } finally {
      clearTimeout(timer);
    }

    while (!result.done) {
      yield result.value;
      result = await iterator.next();
    }
    completed = true;
  } finally {
    if (!completed) void iterator.return?.().catch(() => undefined);
  }
}
