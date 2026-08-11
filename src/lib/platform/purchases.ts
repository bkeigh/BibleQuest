import { BILLING_INTERVALS } from "@/lib/billing/validation";
import { apiFetch, nativeSessionMatches } from "./api";
import {
  nativeAppToWebBridge,
  type NativeAppToWebBridge,
  type NativeStorefrontSnapshot,
  type StripeExternalPurpose,
} from "./native-app-to-web";
import {
  platformRuntime,
  type PlatformRuntime,
} from "./runtime";

export type PurchaseProduct = "monthly" | "annual" | "lifetime";
export type PurchaseAction =
  | "redirected"
  | "restored"
  | "deferred"
  | "unavailable"
  | "failed";

export interface PurchaseAccountBoundary {
  expectedUserId: string;
  signal?: AbortSignal;
}

export interface PurchaseAdapter {
  channel: "web-stripe" | "native";
  available: boolean;
  acquisitionAvailable: () => Promise<boolean>;
  observeAcquisitionChanges: (
    listener: () => void,
  ) => Promise<() => void>;
  purchase: (
    product: PurchaseProduct,
    account: PurchaseAccountBoundary,
  ) => Promise<PurchaseAction>;
  restore: (account: PurchaseAccountBoundary) => Promise<PurchaseAction>;
  manage: (account: PurchaseAccountBoundary) => Promise<PurchaseAction>;
}

export interface NativePurchaseAdapter extends PurchaseAdapter {
  channel: "native";
}

export interface PurchaseDependencies {
  runtime?: PlatformRuntime;
  native?: NativePurchaseAdapter;
  fetcher?: typeof apiFetch;
  navigate?: (url: string) => void;
  nativeBridge?: NativeAppToWebBridge;
  nativeIdentityMatches?: (expectedUserId: string) => Promise<boolean>;
  nativeCheckoutEnabled?: boolean;
  now?: () => number;
}

const CHECKOUT_ORIGIN = "https://checkout.stripe.com";
const BILLING_ORIGIN = "https://billing.stripe.com";
const MAX_PROVIDER_RESPONSE_BYTES = 12 * 1024;
const MAX_PROVIDER_URL_BYTES = 8 * 1024;
const STOREFRONT_LOOKUP_DEADLINE_MS = 4_000;
const STOREFRONT_SNAPSHOT_MAX_AGE_MS = 5_000;
const NATIVE_REQUEST_DEADLINE_MS = 12_000;
const NATIVE_ACTION_DEADLINE_MS = 20_000;
const NATIVE_BROWSER_OPEN_DEADLINE_MS = 4_000;
const CONTROL_OR_WHITESPACE = /[\u0000-\u0020\u007f]/;
const SUPABASE_USER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface NativeActionScope {
  signal: AbortSignal;
  active: () => boolean;
}

/** Limits how long native acquisition UI may trust one ephemeral StoreKit read. */
export const NATIVE_STOREFRONT_UI_TTL_MS = 5_000;

/** Keeps every web-only Stripe entry point hidden on a native target. */
export function webCommerceAvailable(
  runtime: PlatformRuntime = platformRuntime(),
): boolean {
  return runtime.target === "web";
}

/** Requires an explicit account-beta build opt-in; every other spelling is off. */
export function nativeAppToWebCheckoutEnabled(
  value = process.env.NEXT_PUBLIC_NATIVE_US_STRIPE_CHECKOUT_ENABLED,
): boolean {
  return value === "true";
}

/** Selects web Stripe behavior or the separately latched native app-to-web seam. */
export function purchaseAdapter(
  dependencies: PurchaseDependencies = {},
): PurchaseAdapter {
  const runtime = dependencies.runtime ?? platformRuntime();
  if (runtime.target === "native") {
    return dependencies.native ?? nativeStripePurchaseAdapter(dependencies);
  }
  return webStripePurchaseAdapter(dependencies);
}

/** Uses only server-created, exactly allowlisted Stripe redirects on the web. */
function webStripePurchaseAdapter(
  dependencies: PurchaseDependencies,
): PurchaseAdapter {
  const fetcher = dependencies.fetcher ?? apiFetch;
  const navigate =
    dependencies.navigate ??
    ((url: string) => {
      window.location.assign(url);
    });

  return {
    channel: "web-stripe",
    available: true,
    acquisitionAvailable: async () => true,
    observeAcquisitionChanges: async () => () => undefined,
    purchase: async (product, account) => {
      if (!validAccountBoundary(account)) return "unavailable";
      try {
        const response = await fetcher("/api/billing/checkout", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          signal: account.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interval: product }),
        });
        const destination = response.ok
          ? await exactRedirect(response, "checkout")
          : null;
        if (!destination || account.signal?.aborted) return "failed";
        navigate(destination);
        return "redirected";
      } catch {
        return "failed";
      }
    },
    restore: async (account) => {
      if (!validAccountBoundary(account)) return "unavailable";
      try {
        const response = await fetcher("/api/billing/refresh", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          signal: account.signal,
        });
        if (response.ok) return "restored";
        return response.status === 429 ? "deferred" : "failed";
      } catch {
        return "failed";
      }
    },
    manage: async (account) => {
      if (!validAccountBoundary(account)) return "unavailable";
      try {
        const response = await fetcher("/api/billing/portal", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          signal: account.signal,
        });
        const destination = response.ok
          ? await exactRedirect(response, "billing")
          : null;
        if (!destination || account.signal?.aborted) return "failed";
        navigate(destination);
        return "redirected";
      } catch {
        return "failed";
      }
    },
  };
}

/** Runs native Checkout, restore, and portal actions below the React tap guard. */
function nativeStripePurchaseAdapter(
  dependencies: PurchaseDependencies,
): NativePurchaseAdapter {
  const enabled =
    dependencies.nativeCheckoutEnabled ?? nativeAppToWebCheckoutEnabled();
  const fetcher = dependencies.fetcher ?? apiFetch;
  const bridge = dependencies.nativeBridge ?? nativeAppToWebBridge;
  const identityMatches =
    dependencies.nativeIdentityMatches ?? nativeSessionMatches;
  const now = dependencies.now ?? Date.now;
  let nativeActionInFlight = false;

  const acquisitionAvailable = async () => {
    if (!enabled) return false;
    try {
      const snapshot = await beforeDeadline(
        bridge.currentStorefront(),
        STOREFRONT_LOOKUP_DEADLINE_MS,
      );
      return validUnitedStatesStorefront(snapshot, now());
    } catch {
      return false;
    }
  };

  const accountStillCurrent = async (
    account: PurchaseAccountBoundary,
    scope: NativeActionScope,
  ) => {
    if (!scope.active()) return false;
    try {
      const matches = await beforeSignalOrDeadline(
        identityMatches(account.expectedUserId),
        scope.signal,
        STOREFRONT_LOOKUP_DEADLINE_MS,
      );
      return scope.active() && matches;
    } catch {
      return false;
    }
  };

  const singleFlight = async (
    account: PurchaseAccountBoundary,
    operation: (scope: NativeActionScope) => Promise<PurchaseAction>,
  ): Promise<PurchaseAction> => {
    if (!validAccountBoundary(account) || account.signal?.aborted) {
      return "unavailable";
    }
    if (nativeActionInFlight) return "deferred";
    nativeActionInFlight = true;
    const controller = new AbortController();
    let active = true;
    let stopAction: (outcome: PurchaseAction) => void = () => undefined;
    const stopped = new Promise<PurchaseAction>((resolve) => {
      stopAction = (outcome) => {
        if (!active) return;
        active = false;
        controller.abort();
        resolve(outcome);
      };
    });
    const abortForAccountChange = () => stopAction("unavailable");
    account.signal?.addEventListener("abort", abortForAccountChange, {
      once: true,
    });
    const deadline = setTimeout(
      () => stopAction("failed"),
      NATIVE_ACTION_DEADLINE_MS,
    );
    if (account.signal?.aborted) abortForAccountChange();
    try {
      return await Promise.race([
        operation({ signal: controller.signal, active: () => active }),
        stopped,
      ]);
    } catch {
      return "failed";
    } finally {
      active = false;
      controller.abort();
      clearTimeout(deadline);
      account.signal?.removeEventListener("abort", abortForAccountChange);
      nativeActionInFlight = false;
    }
  };

  return {
    channel: "native",
    available: enabled,
    acquisitionAvailable,
    observeAcquisitionChanges: async (listener) => {
      if (!enabled) return () => undefined;
      try {
        return await bridge.observeStorefrontChanges(listener);
      } catch {
        return () => undefined;
      }
    },
    purchase: (product, account) =>
      singleFlight(account, async (scope) => {
        if (!isPurchaseProduct(product)) return "failed";
        if (!(await accountStillCurrent(account, scope))) return "unavailable";
        if (!(await acquisitionAvailable())) return "unavailable";
        if (!scope.active()) return "unavailable";
        const response = await nativeRequest(
          fetcher,
          "/api/billing/checkout",
          {
            method: "POST",
            credentials: "omit",
            cache: "no-store",
            redirect: "error",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ interval: product }),
          },
          account.expectedUserId,
          scope.signal,
        );
        if (response.status === 429) return "deferred";
        if (!response.ok) return "failed";
        const destination = await exactRedirect(
          response,
          "checkout",
          scope.signal,
        );
        if (!destination || !scope.active()) return "failed";
        // A storefront or account can change while the server creates the Session.
        if (!(await acquisitionAvailable())) return "unavailable";
        if (!(await accountStillCurrent(account, scope))) return "unavailable";
        if (!scope.active()) return "unavailable";
        return (await openExternally(
          bridge,
          destination,
          "checkout",
          scope.signal,
        ))
          ? "redirected"
          : "failed";
      }),
    restore: (account) =>
      singleFlight(account, async (scope) => {
        if (!enabled) return "unavailable";
        if (!(await accountStillCurrent(account, scope))) return "unavailable";
        const response = await nativeRequest(
          fetcher,
          "/api/billing/refresh",
          {
            method: "POST",
            credentials: "omit",
            cache: "no-store",
            redirect: "error",
          },
          account.expectedUserId,
          scope.signal,
        );
        if (!(await accountStillCurrent(account, scope))) return "unavailable";
        if (response.ok) return "restored";
        return response.status === 429 ? "deferred" : "failed";
      }),
    manage: (account) =>
      singleFlight(account, async (scope) => {
        if (!(await accountStillCurrent(account, scope))) return "unavailable";
        if (!(await acquisitionAvailable())) return "unavailable";
        if (!scope.active()) return "unavailable";
        const response = await nativeRequest(
          fetcher,
          "/api/billing/portal",
          {
            method: "POST",
            credentials: "omit",
            cache: "no-store",
            redirect: "error",
          },
          account.expectedUserId,
          scope.signal,
        );
        if (response.status === 429) return "deferred";
        if (!response.ok) return "failed";
        const destination = await exactRedirect(
          response,
          "billing",
          scope.signal,
        );
        if (!destination || !scope.active()) return "failed";
        if (!(await acquisitionAvailable())) return "unavailable";
        if (!(await accountStillCurrent(account, scope))) return "unavailable";
        if (!scope.active()) return "unavailable";
        return (await openExternally(
          bridge,
          destination,
          "billing",
          scope.signal,
        ))
          ? "redirected"
          : "failed";
      }),
  };
}

/** Accepts only a fresh StoreKit alpha-3 United States storefront snapshot. */
function validUnitedStatesStorefront(
  value: unknown,
  now: number,
): value is NativeStorefrontSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as NativeStorefrontSnapshot;
  if (
    snapshot.countryCode !== "USA" ||
    typeof snapshot.checkedAtEpochMilliseconds !== "number" ||
    !Number.isSafeInteger(snapshot.checkedAtEpochMilliseconds) ||
    !Number.isFinite(now)
  ) {
    return false;
  }
  const age = now - snapshot.checkedAtEpochMilliseconds;
  return age >= 0 && age <= STOREFRONT_SNAPSHOT_MAX_AGE_MS;
}

/** Aborts native API work on a fixed deadline without exposing request details. */
async function nativeRequest(
  fetcher: typeof apiFetch,
  path: string,
  init: RequestInit,
  expectedUserId: string,
  actionSignal: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  actionSignal.addEventListener("abort", abort, { once: true });
  try {
    return await beforeSignalOrDeadline(
      fetcher(
        path,
        { ...init, signal: controller.signal },
        expectedUserId,
      ),
      actionSignal,
      NATIVE_REQUEST_DEADLINE_MS,
      controller,
    );
  } finally {
    actionSignal.removeEventListener("abort", abort);
  }
}

/** Stops waiting for a side-effect-free StoreKit lookup after a short deadline. */
async function beforeDeadline<T>(
  operation: Promise<T>,
  deadlineMilliseconds: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Native storefront is unavailable.")),
          deadlineMilliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Stops ignored abort signals as well as real network and bridge operations. */
async function beforeSignalOrDeadline<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  deadlineMilliseconds: number,
  controller?: AbortController,
): Promise<T> {
  if (signal.aborted) throw new Error("Native action is unavailable.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectForAbort: () => void = () => undefined;
  const interrupted = new Promise<never>((_, reject) => {
    rejectForAbort = () => reject(new Error("Native action is unavailable."));
    signal.addEventListener("abort", rejectForAbort, { once: true });
    timer = setTimeout(() => {
      controller?.abort();
      reject(new Error("Native action deadline exceeded."));
    }, deadlineMilliseconds);
  });
  try {
    return await Promise.race([operation, interrupted]);
  } finally {
    signal.removeEventListener("abort", rejectForAbort);
    if (timer) clearTimeout(timer);
  }
}

/** Validates the native result shape without trusting a truthy bridge payload. */
async function openExternally(
  bridge: NativeAppToWebBridge,
  url: string,
  purpose: StripeExternalPurpose,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) return false;
  const requestId = nativeOpenRequestId();
  let completed = false;
  const cancel = () => {
    void bridge.cancelExternalStripeOpen({ requestId }).catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const result = await beforeSignalOrDeadline(
      bridge.openExternalStripeUrl({ purpose, requestId, url }),
      signal,
      NATIVE_BROWSER_OPEN_DEADLINE_MS,
    );
    completed = true;
    return Boolean(
      result &&
        typeof result === "object" &&
        !Array.isArray(result) &&
        (result as { opened?: unknown }).opened === true,
    );
  } finally {
    signal.removeEventListener("abort", cancel);
    if (!completed) cancel();
  }
}

/** Generates one reload-safe opaque handle without retaining account data. */
function nativeOpenRequestId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `bq-open-${Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("")}`;
}

/** Rejects malformed, oversized, credentialed, or lookalike provider URLs. */
async function exactRedirect(
  response: Response,
  purpose: StripeExternalPurpose,
  signal?: AbortSignal,
): Promise<string | null> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength &&
    (!/^\d+$/.test(declaredLength) ||
      Number(declaredLength) > MAX_PROVIDER_RESPONSE_BYTES)
  ) {
    return null;
  }
  const body = await boundedResponseText(response, signal);
  if (body === null) return null;
  try {
    const payload = JSON.parse(body) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }
    if (Object.keys(payload).join(",") !== "url") return null;
    return exactStripeHostedUrl(
      (payload as { url?: unknown }).url,
      purpose,
    );
  } catch {
    return null;
  }
}

/** Shares one exact-origin validator between Checkout and future portal work. */
export function exactStripeHostedUrl(
  value: unknown,
  purpose: StripeExternalPurpose,
): string | null {
  if (purpose !== "checkout" && purpose !== "billing") return null;
  if (typeof value !== "string") return null;
  const byteLength = new TextEncoder().encode(value).byteLength;
  const allowedOrigin =
    purpose === "checkout" ? CHECKOUT_ORIGIN : BILLING_ORIGIN;
  if (
    byteLength === 0 ||
    byteLength > MAX_PROVIDER_URL_BYTES ||
    CONTROL_OR_WHITESPACE.test(value) ||
    value.includes("\\") ||
    !value.startsWith(`${allowedOrigin}/`)
  ) {
    return null;
  }
  try {
    const destination = new URL(value);
    if (
      destination.protocol !== "https:" ||
      destination.origin !== allowedOrigin ||
      destination.hostname !== new URL(allowedOrigin).hostname ||
      destination.port ||
      destination.username ||
      destination.password
    ) {
      return null;
    }
    return destination.toString();
  } catch {
    return null;
  }
}

/** Reads at most the small JSON contract and cancels an oversized body stream. */
async function boundedResponseText(
  response: Response,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!response.body) {
    const value = await response.text();
    return new TextEncoder().encode(value).byteLength <=
      MAX_PROVIDER_RESPONSE_BYTES
      ? value
      : null;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const read = reader.read();
      const { done, value } = signal
        ? await beforeAbort(read, signal)
        : await read;
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Interrupts one streaming read when its account-bound action is canceled. */
async function beforeAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw new Error("Native action is unavailable.");
  let rejectForAbort: () => void = () => undefined;
  const interrupted = new Promise<never>((_, reject) => {
    rejectForAbort = () => reject(new Error("Native action is unavailable."));
    signal.addEventListener("abort", rejectForAbort, { once: true });
  });
  try {
    return await Promise.race([operation, interrupted]);
  } finally {
    signal.removeEventListener("abort", rejectForAbort);
  }
}

/** Requires every billing side effect to name one verified Supabase subject. */
function validAccountBoundary(
  value: PurchaseAccountBoundary,
): value is PurchaseAccountBoundary {
  return Boolean(
    value &&
      typeof value === "object" &&
      SUPABASE_USER_ID.test(value.expectedUserId) &&
      (value.signal === undefined || value.signal instanceof AbortSignal),
  );
}

/** Defends the runtime boundary even when JavaScript bypasses TypeScript. */
function isPurchaseProduct(value: unknown): value is PurchaseProduct {
  return (BILLING_INTERVALS as readonly unknown[]).includes(value);
}
