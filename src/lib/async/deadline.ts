/**
 * Bounds browser operations whose underlying SDK may wait forever on a lost
 * network request. The original promise may still settle later, so callers
 * must also ignore stale results after a timeout.
 */
export class DeadlineError extends Error {
  readonly code = "request_timeout";

  constructor(operation: string) {
    super(`${operation} timed out.`);
    this.name = "DeadlineError";
  }
}

/** Rejects with a content-free timeout error after the supplied deadline. */
export function withDeadline<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new DeadlineError(operation)),
      timeoutMs,
    );

    void Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
