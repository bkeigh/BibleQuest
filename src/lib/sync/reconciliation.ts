"use client";

export interface ReconciliationEventTarget {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface ReconciliationDependencies {
  window: ReconciliationEventTarget;
  document: ReconciliationEventTarget & {
    readonly visibilityState: DocumentVisibilityState;
  };
  navigator: {
    readonly onLine: boolean;
  };
  defer(task: () => void): () => void;
}

export interface ReconciliationTriggerOptions {
  reconcile: () => void | Promise<void>;
  dependencies?: ReconciliationDependencies;
  onError?: (error: unknown) => void;
}

export interface ReconciliationTriggerController {
  request(): void;
  stop(): void;
}

// Resolve browser globals only when a caller registers the triggers.
function browserDependencies(): ReconciliationDependencies {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof navigator === "undefined"
  ) {
    throw new Error("Reconciliation triggers require a browser environment.");
  }

  return {
    window,
    document,
    navigator,
    defer(task) {
      const handle = window.setTimeout(task, 0);
      return () => window.clearTimeout(handle);
    },
  };
}

// Register browser recovery signals while keeping reconciliation single-flight.
export function registerReconciliationTriggers({
  reconcile,
  dependencies = browserDependencies(),
  onError,
}: ReconciliationTriggerOptions): ReconciliationTriggerController {
  let stopped = false;
  let running = false;
  let rerunRequested = false;
  let cancelPending: (() => void) | null = null;

  // Sync is eligible only while this tab can safely reach the account copy.
  const isEligible = () =>
    dependencies.navigator.onLine &&
    dependencies.document.visibilityState === "visible";

  // Finish one run before scheduling the single coalesced follow-up.
  const execute = async () => {
    running = true;
    try {
      await reconcile();
    } catch (error) {
      try {
        onError?.(error);
      } catch {
        // A reporting hook must not break trigger lifecycle state.
      }
    } finally {
      running = false;
      if (stopped || !rerunRequested) return;
      rerunRequested = false;
      request();
    }
  };

  // Coalesce event bursts and re-check browser state immediately before work.
  const request = () => {
    if (stopped || !isEligible()) return;
    if (running) {
      rerunRequested = true;
      return;
    }
    if (cancelPending) return;

    cancelPending = dependencies.defer(() => {
      cancelPending = null;
      if (stopped || !isEligible()) return;
      void execute();
    });
  };

  // Visibility events reconcile only when the document returns to foreground.
  const onVisibilityChange: EventListener = () => {
    if (dependencies.document.visibilityState === "visible") request();
  };
  const onRecoverySignal: EventListener = () => request();

  dependencies.window.addEventListener("online", onRecoverySignal);
  dependencies.window.addEventListener("focus", onRecoverySignal);
  dependencies.document.addEventListener(
    "visibilitychange",
    onVisibilityChange,
  );

  // Cleanup is idempotent and prevents pending or post-flight reruns.
  const stop = () => {
    if (stopped) return;
    stopped = true;
    rerunRequested = false;
    cancelPending?.();
    cancelPending = null;
    dependencies.window.removeEventListener("online", onRecoverySignal);
    dependencies.window.removeEventListener("focus", onRecoverySignal);
    dependencies.document.removeEventListener(
      "visibilitychange",
      onVisibilityChange,
    );
  };

  return { request, stop };
}
