import { describe, expect, it, vi } from "vitest";
import {
  registerReconciliationTriggers,
  type ReconciliationDependencies,
} from "@/lib/sync/reconciliation";

// Provide observable event targets without relying on a DOM test environment.
class FakeEventTarget {
  private listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new Event(type));
    }
  }

  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

// Make deferred coalescing explicit and synchronous in each test.
class ManualScheduler {
  private jobs: Array<{ cancelled: boolean; task: () => void }> = [];

  defer(task: () => void) {
    const job = { cancelled: false, task };
    this.jobs.push(job);
    return () => {
      job.cancelled = true;
    };
  }

  get pending() {
    return this.jobs.filter((job) => !job.cancelled).length;
  }

  flushNext() {
    const job = this.jobs.shift();
    if (job && !job.cancelled) job.task();
  }
}

// Assemble mutable browser state behind the production dependency contract.
function fixture() {
  const window = new FakeEventTarget();
  const document = Object.assign(new FakeEventTarget(), {
    visibilityState: "visible" as DocumentVisibilityState,
  });
  const navigator = { onLine: true };
  const scheduler = new ManualScheduler();
  const dependencies: ReconciliationDependencies = {
    window,
    document,
    navigator,
    defer: (task) => scheduler.defer(task),
  };

  return { dependencies, document, navigator, scheduler, window };
}

// Let async reconciliation finally blocks schedule any follow-up work.
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("browser reconciliation triggers", () => {
  it("registers all recovery listeners and removes them on cleanup", () => {
    const { dependencies, document, scheduler, window } = fixture();
    const controller = registerReconciliationTriggers({
      dependencies,
      reconcile: vi.fn(),
    });

    expect(window.listenerCount("online")).toBe(1);
    expect(window.listenerCount("focus")).toBe(1);
    expect(document.listenerCount("visibilitychange")).toBe(1);

    controller.request();
    expect(scheduler.pending).toBe(1);
    controller.stop();

    expect(scheduler.pending).toBe(0);
    expect(window.listenerCount("online")).toBe(0);
    expect(window.listenerCount("focus")).toBe(0);
    expect(document.listenerCount("visibilitychange")).toBe(0);
    expect(() => controller.stop()).not.toThrow();
  });

  it("coalesces online, focus, and visible events into one run", async () => {
    const { dependencies, document, scheduler, window } = fixture();
    const reconcile = vi.fn();
    registerReconciliationTriggers({ dependencies, reconcile });

    window.dispatch("online");
    window.dispatch("focus");
    document.dispatch("visibilitychange");

    expect(scheduler.pending).toBe(1);
    scheduler.flushNext();
    await settle();
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("never starts reconciliation while offline or hidden", async () => {
    const { dependencies, document, navigator, scheduler, window } = fixture();
    const reconcile = vi.fn();
    registerReconciliationTriggers({ dependencies, reconcile });

    navigator.onLine = false;
    window.dispatch("focus");
    window.dispatch("online");
    expect(scheduler.pending).toBe(0);

    navigator.onLine = true;
    document.visibilityState = "hidden";
    window.dispatch("focus");
    document.dispatch("visibilitychange");
    expect(scheduler.pending).toBe(0);

    document.visibilityState = "visible";
    document.dispatch("visibilitychange");
    navigator.onLine = false;
    scheduler.flushNext();
    await settle();
    expect(reconcile).not.toHaveBeenCalled();

    navigator.onLine = true;
    window.dispatch("online");
    scheduler.flushNext();
    await settle();
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("runs at most once concurrently and coalesces an in-flight burst", async () => {
    const { dependencies, scheduler, window } = fixture();
    let releaseFirst!: () => void;
    let active = 0;
    let maximumActive = 0;
    const reconcile = vi.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (reconcile.mock.calls.length === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      active -= 1;
    });
    registerReconciliationTriggers({ dependencies, reconcile });

    window.dispatch("focus");
    scheduler.flushNext();
    window.dispatch("focus");
    window.dispatch("online");

    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(scheduler.pending).toBe(0);
    releaseFirst();
    await settle();
    expect(scheduler.pending).toBe(1);

    scheduler.flushNext();
    await settle();
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(maximumActive).toBe(1);
  });

  it("reports failures and does not rerun after cleanup", async () => {
    const { dependencies, scheduler, window } = fixture();
    let release!: () => void;
    const failure = new Error("network unavailable");
    const onError = vi.fn();
    const reconcile = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          release = () => reject(failure);
        }),
    );
    const controller = registerReconciliationTriggers({
      dependencies,
      onError,
      reconcile,
    });

    window.dispatch("focus");
    scheduler.flushNext();
    window.dispatch("online");
    controller.stop();
    release();
    await settle();

    expect(onError).toHaveBeenCalledWith(failure);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(scheduler.pending).toBe(0);
  });
});
