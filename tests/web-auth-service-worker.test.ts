import { MessageChannel, type MessagePort } from "node:worker_threads";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withDeadline } from "@/lib/async/deadline";
import {
  AUTH_REQUEST_DEADLINE_MS,
  WEB_AUTH_SERVICE_WORKER_CONTROLLER_TIMEOUT_MS,
  WEB_AUTH_SERVICE_WORKER_RESULT_TIMEOUT_MS,
} from "@/lib/auth/request-budget";

vi.mock("@/lib/platform/target", () => ({ isNativeTarget: () => false }));

const ORIGIN = "https://biblequest.test";
const VERSION = "biblequest-v28";
const ATTEST = "BIBLEQUEST_WEB_AUTH_ATTEST_V2";
const AUDIT = "BIBLEQUEST_WEB_AUTH_AUDIT_V2";
const CHALLENGE = "BIBLEQUEST_WEB_AUTH_CLIENT_CHALLENGE_V2";
const RESPONSE = "BIBLEQUEST_WEB_AUTH_CLIENT_RESPONSE_V2";
const RESULT = "BIBLEQUEST_WEB_AUTH_RESULT_V2";

type WorkerMessage = {
  type?: unknown;
  version?: unknown;
  nonce?: unknown;
};

/** Controls one browser registration promise across timeout and retry steps. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Simulates only the bounded worker protocol used by the browser helper. */
class FakeWorker {
  readonly scriptURL = `${ORIGIN}/sw.js`;
  readonly messages: unknown[] = [];

  constructor(private readonly auditPasses: boolean | "silent" = true) {}

  postMessage(message: unknown, transfer?: Transferable[]) {
    this.messages.push(message);
    const port = transfer?.[0] as unknown as MessagePort | undefined;
    if (!port) return;
    const value = message as WorkerMessage;
    if (value.type === AUDIT && this.auditPasses === "silent") {
      port.close();
      return;
    }
    port.postMessage({
      type: RESULT,
      version: VERSION,
      ok:
        value.type === ATTEST ||
        (value.type === AUDIT && this.auditPasses === true),
    });
    port.close();
  }
}

/** Provides the event and registration surface needed by the helper. */
class FakeServiceWorkerContainer {
  readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  readonly update = vi.fn(async () => undefined);
  readonly registration = {
    update: this.update,
  };
  readonly register = vi.fn(async () => this.registration);
  readonly ready = Promise.resolve(this.registration);

  constructor(readonly controller: FakeWorker) {}

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ) {
    this.listeners.get(type)?.delete(listener);
  }

  /** Delivers one worker message to every active page listener. */
  emitMessage(event: MessageEvent<unknown>) {
    for (const listener of this.listeners.get("message") ?? []) {
      if (typeof listener === "function") listener(event);
      else listener.handleEvent(event);
    }
  }
}

/** Installs a minimal production customer-page browser environment. */
function installBrowser(
  pathname = "/app",
  auditPasses: boolean | "silent" = true,
) {
  const worker = new FakeWorker(auditPasses);
  const serviceWorker = new FakeServiceWorkerContainer(worker);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubGlobal("MessageChannel", MessageChannel);
  vi.stubGlobal("window", {
    location: new URL(pathname, ORIGIN),
    setTimeout,
    clearTimeout,
  });
  vi.stubGlobal("navigator", { serviceWorker });
  return { serviceWorker, worker };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("web auth service-worker boundary", () => {
  it("registers without HTTP script caching and requires both exact proofs", async () => {
    const { serviceWorker, worker } = installBrowser();
    const webAuthWorker = await import(
      "@/lib/platform/web-auth-service-worker"
    );

    await webAuthWorker.requireWebAuthServiceWorkerAttestation();

    expect(serviceWorker.register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    expect(serviceWorker.update).toHaveBeenCalledOnce();
    expect(worker.messages).toEqual([
      { type: ATTEST, version: VERSION },
      { type: AUDIT, version: VERSION },
    ]);
  });

  it("fails closed when the all-customer-window audit fails", async () => {
    installBrowser("/app", false);
    const webAuthWorker = await import(
      "@/lib/platform/web-auth-service-worker"
    );

    await expect(
      webAuthWorker.requireWebAuthServiceWorkerAttestation(),
    ).rejects.toMatchObject({
      code: "web_auth_service_worker_unavailable",
    });
  });

  it("surfaces a typed worker timeout before the outer sign-in deadline", async () => {
    installBrowser("/app", "silent");
    const webAuthWorker = await import(
      "@/lib/platform/web-auth-service-worker"
    );
    const startedAt = Date.now();
    const guarded = withDeadline(
      webAuthWorker.requireWebAuthServiceWorkerAttestation(),
      AUTH_REQUEST_DEADLINE_MS,
      "Fixture sign-in",
    );

    await expect(guarded).rejects.toMatchObject({
      code: "web_auth_service_worker_unavailable",
    });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(
      WEB_AUTH_SERVICE_WORKER_RESULT_TIMEOUT_MS,
    );
    expect(Date.now() - startedAt).toBeLessThan(AUTH_REQUEST_DEADLINE_MS);
  }, 8_000);

  it("bounds a browser registration that never settles", async () => {
    vi.useFakeTimers();
    const { serviceWorker } = installBrowser();
    // A browser API can go silent instead of rejecting, so the inner gate owns
    // a timer that settles before the larger sign-in request deadline.
    serviceWorker.register.mockImplementation(
      () => new Promise(() => undefined),
    );
    const webAuthWorker = await import(
      "@/lib/platform/web-auth-service-worker"
    );
    let failure: unknown = null;
    const result = webAuthWorker
      .requireWebAuthServiceWorkerAttestation()
      .catch((error: unknown) => {
        failure = error;
      });

    await vi.advanceTimersByTimeAsync(
      WEB_AUTH_SERVICE_WORKER_CONTROLLER_TIMEOUT_MS,
    );
    await result;

    expect(failure).toMatchObject({
      code: "web_auth_service_worker_unavailable",
    });
  });

  it("does not let a late failed registration erase a healthy retry", async () => {
    vi.useFakeTimers();
    const { serviceWorker } = installBrowser();
    const firstRegistration = deferred<
      typeof serviceWorker.registration
    >();
    serviceWorker.register
      .mockImplementationOnce(() => firstRegistration.promise)
      .mockResolvedValueOnce(serviceWorker.registration);
    const webAuthWorker = await import(
      "@/lib/platform/web-auth-service-worker"
    );

    const firstAttempt = webAuthWorker.requireWebAuthServiceWorkerAttestation();
    const firstFailure = expect(firstAttempt).rejects.toMatchObject({
      code: "web_auth_service_worker_unavailable",
    });
    await vi.advanceTimersByTimeAsync(
      WEB_AUTH_SERVICE_WORKER_CONTROLLER_TIMEOUT_MS,
    );
    await firstFailure;

    await expect(
      webAuthWorker.requireWebAuthServiceWorkerAttestation(),
    ).resolves.toBeUndefined();
    firstRegistration.reject(new Error("late fixture failure"));
    await Promise.resolve();
    await Promise.resolve();

    await expect(
      webAuthWorker.prepareWebAuthServiceWorker(),
    ).resolves.toBe(serviceWorker.registration);
    expect(serviceWorker.register).toHaveBeenCalledTimes(2);
  });

  it("never permits auth setup from console, marketing, or generic callbacks", async () => {
    const webAuthWorker = await import(
      "@/lib/platform/web-auth-service-worker"
    );
    expect(webAuthWorker.isWebAuthCustomerPath("/app")).toBe(true);
    expect(webAuthWorker.isWebAuthCustomerPath("/app/settings")).toBe(true);
    expect(webAuthWorker.isWebAuthCustomerPath("/onboarding")).toBe(true);
    expect(
      webAuthWorker.isWebAuthCustomerPath("/auth/customer-callback"),
    ).toBe(true);
    expect(webAuthWorker.isWebAuthCustomerPath("/console")).toBe(false);
    expect(webAuthWorker.isWebAuthCustomerPath("/auth/callback")).toBe(false);
    expect(webAuthWorker.isWebAuthCustomerPath("/")).toBe(false);
  });

  it("responds only to an exact challenge from the active controller", async () => {
    const { serviceWorker, worker } = installBrowser();
    const webAuthWorker = await import(
      "@/lib/platform/web-auth-service-worker"
    );
    const remove = webAuthWorker.installWebAuthServiceWorkerResponder();
    const channel = new MessageChannel();
    const result = new Promise<unknown>((resolve) => {
      channel.port1.once("message", resolve);
    });
    serviceWorker.emitMessage(
      {
        data: { type: CHALLENGE, version: VERSION, nonce: "a".repeat(32) },
        ports: [channel.port2 as unknown as MessagePort],
        source: worker as unknown as MessageEventSource,
      } as unknown as MessageEvent<unknown>,
    );

    await expect(result).resolves.toEqual({
      type: RESPONSE,
      version: VERSION,
      nonce: "a".repeat(32),
    });
    remove();
    expect(serviceWorker.listeners.get("message")?.size ?? 0).toBe(0);
    channel.port1.close();
  });
});
