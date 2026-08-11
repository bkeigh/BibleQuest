/** Fixed, identifier-free destinations shared by Checkout and native return handling. */
export const CHECKOUT_RETURN_URLS = {
  returned: "https://www.biblequest.co/checkout/plus/returned",
  cancelled: "https://www.biblequest.co/checkout/plus/cancelled",
} as const;

/** Custom-scheme fallbacks are useful when a universal link remains in Safari. */
export const CHECKOUT_APP_LINKS = {
  returned: "biblequest://billing/checkout/returned",
  cancelled: "biblequest://billing/checkout/cancelled",
} as const;

export type CheckoutReturnHint = keyof typeof CHECKOUT_RETURN_URLS;
export type CheckoutReturnPhase =
  | "idle"
  | "checking"
  | "waiting"
  | "confirmed"
  | "cancelled"
  | "offline"
  | "paused"
  | "timed-out"
  | "failed";

export interface CheckoutReturnState {
  hint: CheckoutReturnHint | null;
  phase: CheckoutReturnPhase;
  attempt: number;
}

export const INITIAL_CHECKOUT_RETURN_STATE: CheckoutReturnState = {
  hint: null,
  phase: "idle",
  attempt: 0,
};

export type BillingRefreshResult = "completed" | "deferred" | "failed";
export type BillingProjectionResult = "plus" | "free" | "failed";

interface CheckoutReturnSignal {
  hint: CheckoutReturnHint;
}

interface CheckoutReturnRefreshDependencies {
  refresh: (signal: AbortSignal) => Promise<BillingRefreshResult>;
  status: (signal: AbortSignal) => Promise<BillingProjectionResult>;
  isOnline: () => boolean;
  onState: (state: CheckoutReturnState) => void;
  retryDelaysMs?: readonly number[];
  timeoutMs?: number;
  wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}

export interface CheckoutReturnRefreshController {
  begin: (hint: CheckoutReturnHint, subjectKey: string | null) => boolean;
  retry: (subjectKey: string | null) => boolean;
  resume: (subjectKey: string | null) => boolean;
  pause: () => void;
  reset: () => void;
  dispose: () => void;
  settled: () => Promise<void>;
}

const DEFAULT_RETRY_DELAYS_MS = [0, 1_200, 2_500, 4_500] as const;
const DEFAULT_TIMEOUT_MS = 15_000;
const listeners = new Set<(signal: CheckoutReturnSignal) => void>();
let pendingSignal: CheckoutReturnSignal | null = null;

/** Accepts only fixed production universal links or fixed native app links. */
export function checkoutReturnHintFromUrl(
  value: string,
): CheckoutReturnHint | null {
  for (const hint of ["returned", "cancelled"] as const) {
    if (
      value === CHECKOUT_RETURN_URLS[hint] ||
      value === CHECKOUT_APP_LINKS[hint]
    ) {
      return hint;
    }
  }
  return null;
}

/** Preserves the existing web return until Checkout adopts the fixed paths. */
export function legacyWebCheckoutReturnHint(
  value: string,
): CheckoutReturnHint | null {
  for (const hint of ["returned", "cancelled"] as const) {
    if (
      value ===
      `https://www.biblequest.co/app/plus?checkout=${hint}`
    ) {
      return hint;
    }
  }
  return null;
}

/**
 * Task 2's external-navigation bridge calls this with Capacitor's launch or
 * appUrlOpen URL. Invalid URLs are discarded before any coordinator sees them.
 */
export function publishCheckoutReturnUrl(value: string): boolean {
  const hint = checkoutReturnHintFromUrl(value);
  if (!hint) return false;
  const signal = { hint } satisfies CheckoutReturnSignal;
  if (listeners.size === 0) {
    pendingSignal = signal;
    return true;
  }
  for (const listener of listeners) listener(signal);
  return true;
}

/** Delivers one cold-launch signal and all later validated URL-open signals. */
export function subscribeToCheckoutReturns(
  listener: (signal: CheckoutReturnSignal) => void,
): () => void {
  listeners.add(listener);
  if (pendingSignal) {
    const signal = pendingSignal;
    pendingSignal = null;
    listener(signal);
  }
  return () => listeners.delete(listener);
}

/** Runs one bounded, account-keyed refresh followed by status-only retries. */
export function createCheckoutReturnRefreshController(
  dependencies: CheckoutReturnRefreshDependencies,
): CheckoutReturnRefreshController {
  const retryDelays =
    dependencies.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const wait = dependencies.wait ?? abortableWait;
  let state = INITIAL_CHECKOUT_RETURN_STATE;
  let generation = 0;
  let activeSubject: string | null = null;
  let controller: AbortController | null = null;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  let task: Promise<void> | null = null;
  let disposed = false;

  /** Emits only state from the currently active controller generation. */
  const update = (next: CheckoutReturnState) => {
    if (disposed) return;
    state = next;
    dependencies.onState(next);
  };

  /** Stops network work before changing account-bound display state. */
  const stopActive = () => {
    generation += 1;
    controller?.abort();
    controller = null;
    if (deadline) clearTimeout(deadline);
    deadline = null;
    task = null;
  };

  /** Starts a fresh bounded run for exactly one verified account key. */
  const start = (subjectKey: string): boolean => {
    if (disposed || !subjectKey.startsWith("user:")) return false;
    if (
      activeSubject === subjectKey &&
      state.hint === "returned" &&
      state.phase !== "idle"
    ) {
      return false;
    }

    stopActive();
    activeSubject = subjectKey;
    const run = generation;
    controller = new AbortController();
    const signal = controller.signal;
    update({ hint: "returned", phase: "checking", attempt: 0 });

    // The overall deadline also bounds a provider or fetch that never settles.
    deadline = setTimeout(() => {
      if (disposed || run !== generation) return;
      generation += 1;
      controller?.abort();
      controller = null;
      deadline = null;
      update({ hint: "returned", phase: "timed-out", attempt: state.attempt });
    }, timeoutMs);

    task = (async () => {
      if (!dependencies.isOnline()) {
        if (run === generation) {
          update({ hint: "returned", phase: "offline", attempt: 0 });
        }
        return;
      }

      let sawFreeProjection = false;
      let sawFailedProjection = false;
      try {
        const refreshResult = await dependencies.refresh(signal);
        if (run !== generation || signal.aborted) return;
        sawFailedProjection = refreshResult === "failed";

        for (let index = 0; index < retryDelays.length; index += 1) {
          const delay = retryDelays[index] ?? 0;
          if (delay > 0) await wait(delay, signal);
          if (run !== generation || signal.aborted) return;
          if (!dependencies.isOnline()) {
            update({ hint: "returned", phase: "offline", attempt: index });
            return;
          }

          const attempt = index + 1;
          const projection = await dependencies.status(signal);
          if (run !== generation || signal.aborted) return;
          if (projection === "plus") {
            update({ hint: "returned", phase: "confirmed", attempt });
            return;
          }
          if (projection === "free") sawFreeProjection = true;
          else sawFailedProjection = true;

          if (index < retryDelays.length - 1) {
            update({ hint: "returned", phase: "waiting", attempt });
          }
        }

        update({
          hint: "returned",
          phase: sawFreeProjection ? "timed-out" : "failed",
          attempt: retryDelays.length,
        });
      } catch {
        if (run !== generation || signal.aborted) return;
        update({
          hint: "returned",
          phase: dependencies.isOnline()
            ? sawFailedProjection
              ? "failed"
              : "timed-out"
            : "offline",
          attempt: state.attempt,
        });
      } finally {
        if (run === generation) {
          if (deadline) clearTimeout(deadline);
          deadline = null;
          controller = null;
        }
      }
    })();
    return true;
  };

  return {
    begin: (hint, subjectKey) => {
      if (disposed) return false;
      if (hint === "cancelled") {
        stopActive();
        activeSubject = subjectKey;
        update({ hint, phase: "cancelled", attempt: 0 });
        return true;
      }
      if (!subjectKey?.startsWith("user:")) {
        stopActive();
        activeSubject = null;
        update({ hint, phase: "idle", attempt: 0 });
        return false;
      }
      return start(subjectKey);
    },
    retry: (subjectKey) => {
      if (
        state.hint !== "returned" ||
        !subjectKey ||
        subjectKey !== activeSubject ||
        !["offline", "paused", "timed-out", "failed"].includes(state.phase)
      ) {
        return false;
      }
      // Manual and lifecycle retries intentionally reopen a terminal run.
      stopActive();
      state = { hint: "returned", phase: "idle", attempt: 0 };
      return start(subjectKey);
    },
    resume: (subjectKey) => {
      if (
        state.hint === "returned" &&
        subjectKey === activeSubject &&
        ["offline", "paused"].includes(state.phase)
      ) {
        stopActive();
        state = { hint: "returned", phase: "idle", attempt: 0 };
        return start(subjectKey ?? "");
      }
      return state.hint === "returned" &&
        ["checking", "waiting"].includes(state.phase);
    },
    pause: () => {
      if (!["checking", "waiting"].includes(state.phase)) return;
      const attempt = state.attempt;
      stopActive();
      update({ hint: "returned", phase: "paused", attempt });
    },
    reset: () => {
      stopActive();
      activeSubject = null;
      update(INITIAL_CHECKOUT_RETURN_STATE);
    },
    dispose: () => {
      if (disposed) return;
      stopActive();
      disposed = true;
      activeSubject = null;
    },
    settled: () => task ?? Promise.resolve(),
  };
}

/** Waits without leaving a timer alive after account change or disposal. */
function abortableWait(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, delayMs);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
