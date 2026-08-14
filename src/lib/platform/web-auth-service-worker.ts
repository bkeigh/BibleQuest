"use client";

import { isNativeTarget } from "./target";

export const WEB_AUTH_SERVICE_WORKER_VERSION = "biblequest-v28";
export const WEB_AUTH_SW_ATTEST_REQUEST =
  "BIBLEQUEST_WEB_AUTH_ATTEST_V2";
export const WEB_AUTH_SW_AUDIT_REQUEST =
  "BIBLEQUEST_WEB_AUTH_AUDIT_V2";
export const WEB_AUTH_SW_CLIENT_CHALLENGE =
  "BIBLEQUEST_WEB_AUTH_CLIENT_CHALLENGE_V2";
export const WEB_AUTH_SW_CLIENT_RESPONSE =
  "BIBLEQUEST_WEB_AUTH_CLIENT_RESPONSE_V2";
export const WEB_AUTH_SW_RESULT = "BIBLEQUEST_WEB_AUTH_RESULT_V2";

const RESULT_TIMEOUT_MS = 6_000;
const CONTROLLER_TIMEOUT_MS = 15_000;
const NONCE = /^[A-Za-z0-9_-]{16,128}$/;

let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;
let responderReferences = 0;

/** Reports one fail-closed browser-auth boundary without exposing detail. */
export class WebAuthServiceWorkerUnavailableError extends Error {
  readonly code = "web_auth_service_worker_unavailable";

  constructor() {
    super("Browser account access is unavailable.");
    this.name = "WebAuthServiceWorkerUnavailableError";
  }
}

/** Accepts only the routes allowed to participate in customer browser auth. */
export function isWebAuthCustomerPath(pathname: string): boolean {
  return (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/onboarding" ||
    pathname === "/auth/customer-callback"
  );
}

/** Registers the root worker without permitting an HTTP-cache-stale script. */
export function prepareWebAuthServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(async (registration) => {
        await registration.update();
        return registration;
      })
      .catch((error) => {
        registrationPromise = null;
        throw error;
      });
  }
  return registrationPromise;
}

/** Returns only an exact, content-free result from the controlling worker. */
function workerResult(
  worker: ServiceWorker,
  type: typeof WEB_AUTH_SW_ATTEST_REQUEST | typeof WEB_AUTH_SW_AUDIT_REQUEST,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => {
      channel.port1.close();
      reject(new WebAuthServiceWorkerUnavailableError());
    }, RESULT_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      window.clearTimeout(timer);
      channel.port1.close();
      const value = event.data;
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).sort().join(",") !== "ok,type,version" ||
        (value as { type?: unknown }).type !== WEB_AUTH_SW_RESULT ||
        (value as { version?: unknown }).version !==
          WEB_AUTH_SERVICE_WORKER_VERSION ||
        typeof (value as { ok?: unknown }).ok !== "boolean"
      ) {
        reject(new WebAuthServiceWorkerUnavailableError());
        return;
      }
      resolve((value as { ok: boolean }).ok);
    };
    try {
      worker.postMessage(
        { type, version: WEB_AUTH_SERVICE_WORKER_VERSION },
        [channel.port2],
      );
    } catch {
      window.clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      reject(new WebAuthServiceWorkerUnavailableError());
    }
  });
}

/** Waits for one controller transition without revealing its prior version. */
function nextControllerChange(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let timer = 0;
    const changed = () => {
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        changed,
      );
      resolve();
    };
    timer = window.setTimeout(changed, Math.max(1, timeoutMs));
    navigator.serviceWorker.addEventListener("controllerchange", changed, {
      once: true,
    });
  });
}

/** Confirms the controller script and its private v28 protocol response. */
async function exactActiveController(): Promise<ServiceWorker> {
  await prepareWebAuthServiceWorker();
  const deadline = Date.now() + CONTROLLER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const controller = navigator.serviceWorker.controller;
    if (controller) {
      try {
        const script = new URL(controller.scriptURL);
        if (
          script.origin === window.location.origin &&
          script.pathname === "/sw.js" &&
          !script.search &&
          !script.hash &&
          (await workerResult(controller, WEB_AUTH_SW_ATTEST_REQUEST))
        ) {
          return controller;
        }
      } catch {
        // A stale or malformed controller remains unavailable until replaced.
      }
    }
    await nextControllerChange(Math.min(1_000, deadline - Date.now()));
  }
  throw new WebAuthServiceWorkerUnavailableError();
}

/** Responds only to an exact challenge from the current controlling worker. */
function onWorkerChallenge(event: MessageEvent<unknown>) {
  if (event.source !== navigator.serviceWorker.controller) return;
  if (event.ports.length !== 1) return;
  const value = event.data;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "nonce,type,version" ||
    (value as { type?: unknown }).type !== WEB_AUTH_SW_CLIENT_CHALLENGE ||
    (value as { version?: unknown }).version !==
      WEB_AUTH_SERVICE_WORKER_VERSION ||
    typeof (value as { nonce?: unknown }).nonce !== "string" ||
    !NONCE.test((value as { nonce: string }).nonce)
  ) {
    return;
  }
  const nonce = (value as { nonce: string }).nonce;
  event.ports[0].postMessage({
    type: WEB_AUTH_SW_CLIENT_RESPONSE,
    version: WEB_AUTH_SERVICE_WORKER_VERSION,
    nonce,
  });
  event.ports[0].close();
}

/** Keeps one content-free challenge responder alive for this v28 document. */
export function installWebAuthServiceWorkerResponder(): () => void {
  responderReferences += 1;
  if (responderReferences === 1) {
    navigator.serviceWorker.addEventListener("message", onWorkerChallenge);
  }
  return () => {
    responderReferences = Math.max(0, responderReferences - 1);
    if (responderReferences === 0) {
      navigator.serviceWorker.removeEventListener(
        "message",
        onWorkerChallenge,
      );
    }
  };
}

/** Installs the responder once for account code that runs outside the shell. */
function ensureWebAuthServiceWorkerResponder() {
  if (responderReferences === 0) installWebAuthServiceWorkerResponder();
}

/**
 * Requires this v28 page and every live customer page to attest before auth.
 * Callers perform the audit while holding the browser account-operation lock.
 */
export async function requireWebAuthServiceWorkerAttestation(): Promise<void> {
  if (
    process.env.NODE_ENV !== "production" ||
    isNativeTarget() ||
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    !isWebAuthCustomerPath(window.location.pathname)
  ) {
    throw new WebAuthServiceWorkerUnavailableError();
  }
  ensureWebAuthServiceWorkerResponder();
  try {
    const controller = await exactActiveController();
    if (!(await workerResult(controller, WEB_AUTH_SW_AUDIT_REQUEST))) {
      throw new WebAuthServiceWorkerUnavailableError();
    }
  } catch {
    throw new WebAuthServiceWorkerUnavailableError();
  }
}
