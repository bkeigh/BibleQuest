"use client";

/**
 * Projects account-bound billing state into React without treating the client
 * as an entitlement authority. Requests are keyed to the active identity so a
 * late response from a prior account cannot leak Plus access across sessions.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { track } from "@/lib/analytics/events";
import { useSession } from "@/lib/supabase/useSession";
import type { PlanKey } from "@/lib/questos/types";
import { apiFetch } from "@/lib/platform/api";
import { observeNativeCheckoutReturns } from "@/lib/platform/native-app-to-web";
import {
  NATIVE_STOREFRONT_UI_TTL_MS,
  purchaseAdapter,
} from "@/lib/platform/purchases";
import { isNativeTarget } from "@/lib/platform/target";
import { ACCOUNT_SYNC_CONTAINED } from "@/lib/sync/containment";
import { NATIVE_COMMERCE_CONTAINED } from "./containment";
import {
  createCheckoutReturnRefreshController,
  INITIAL_CHECKOUT_RETURN_STATE,
  legacyWebCheckoutReturnHint,
  publishCheckoutReturnUrl,
  subscribeToCheckoutReturns,
  type BillingProjectionResult,
  type BillingRefreshResult,
  type CheckoutReturnRefreshController,
  type CheckoutReturnState,
} from "./checkout-return";
import {
  BILLING_INTERVALS,
  type BillingInterval,
  type BillingPlan,
} from "./validation";

export type PlusStatus =
  | "coming-soon"
  | "sign-in-required"
  | "loading"
  | "error"
  | "free"
  | "plus"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

interface BillingStatusResponse {
  availability: "coming-soon" | "configured";
  mode?: "test" | "live";
  purchasesEnabled: boolean;
  plan: PlanKey;
  isPlus: boolean;
  entitlementSource?: "stripe" | "operator" | null;
  status: string;
  interval?: BillingInterval | "unknown" | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  hasCustomer?: boolean;
  synchronizedAt?: string | null;
}

interface BillingPlansResponse {
  availability: "coming-soon" | "configured";
  mode?: "test" | "live";
  purchasesEnabled: boolean;
  plans: BillingPlan[];
}

interface StoredPlusState {
  subjectKey: string;
  availability: "coming-soon" | "configured" | "unavailable";
  mode: "test" | "live" | null;
  status: PlusStatus;
  plan: PlanKey;
  isPlus: boolean;
  entitlementSource: "stripe" | "operator" | null;
  purchasesEnabled: boolean;
  plans: BillingPlan[];
  interval: BillingInterval | "unknown" | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  synchronizedAt: string | null;
  error: string | null;
  returnNotice:
    | "checkout-returned"
    | "checkout-cancelled"
    | "portal-returned"
    | null;
}

const LOAD_ERROR =
  "Membership status couldn’t be refreshed. Your free experience is unaffected.";

function initialState(subjectKey: string): StoredPlusState {
  return {
    subjectKey,
    availability: "unavailable",
    mode: null,
    status: "loading",
    plan: "free",
    isPlus: false,
    entitlementSource: null,
    purchasesEnabled: false,
    plans: [],
    interval: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    hasCustomer: false,
    synchronizedAt: null,
    error: null,
    returnNotice: null,
  };
}

/** Keeps a guest-only native build free without probing web billing routes. */
function containedNativeState(subjectKey: string): StoredPlusState {
  return {
    ...initialState(subjectKey),
    status: "free",
  };
}

function safePlusStatus(value: BillingStatusResponse): PlusStatus {
  if (value.isPlus) return "plus";
  if (value.availability === "coming-soon") return "coming-soon";
  return [
    "past_due",
    "unpaid",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "paused",
  ].includes(value.status)
    ? (value.status as PlusStatus)
    : "free";
}

/** Projects one authenticated status payload without inventing native prices. */
function statusProjectionState(
  subjectKey: string,
  payload: BillingStatusResponse,
): StoredPlusState {
  return {
    subjectKey,
    availability: payload.availability,
    mode: payload.mode ?? null,
    status: safePlusStatus(payload),
    plan: payload.plan,
    isPlus: payload.isPlus,
    entitlementSource: payload.entitlementSource ?? null,
    purchasesEnabled: payload.purchasesEnabled,
    plans: [],
    interval: payload.interval ?? null,
    currentPeriodEnd: payload.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: payload.cancelAtPeriodEnd ?? false,
    hasCustomer: payload.hasCustomer ?? false,
    synchronizedAt: payload.synchronizedAt ?? null,
    error: null,
    returnNotice: safeReturnNotice(),
  };
}

async function billingFetch(
  path: string,
  init?: RequestInit,
  expectedNativeUserId?: string,
): Promise<Response> {
  return apiFetch(
    path,
    {
      credentials: isNativeTarget() ? "omit" : "same-origin",
      cache: "no-store",
      ...init,
    },
    expectedNativeUserId,
  );
}

// The native adapter remains inert unless the account-beta checkout flag is exact.
const purchases = purchaseAdapter();

function safeReturnNotice(): StoredPlusState["returnNotice"] {
  if (typeof window === "undefined") return null;
  const parameters = new URLSearchParams(window.location.search);
  if (parameters.get("portal") === "returned") return "portal-returned";
  const checkout = parameters.get("checkout");
  return checkout === "returned"
    ? "checkout-returned"
    : checkout === "cancelled"
      ? "checkout-cancelled"
      : null;
}

export interface PlusState {
  configured: boolean;
  mode: "test" | "live" | null;
  status: PlusStatus;
  loading: boolean;
  plan: PlanKey;
  isPlus: boolean;
  entitlementSource: "stripe" | "operator" | null;
  canPurchase: boolean;
  canManage: boolean;
  purchaseChannel: "web-stripe" | "native";
  purchaseOptions: readonly BillingInterval[];
  plans: BillingPlan[];
  interval: BillingInterval | "unknown" | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  synchronizedAt: string | null;
  error: string | null;
  returnNotice: StoredPlusState["returnNotice"];
  returnState: CheckoutReturnState;
  startCheckout: (interval: BillingInterval) => Promise<boolean>;
  openCustomerPortal: () => Promise<boolean>;
  refresh: () => Promise<void>;
  retryReturnRefresh: () => void;
}

/** Coordinates one account-bound, server-authoritative Plus projection. */
function usePlusCoordinator(): PlusState {
  const session = useSession();
  const nativeTarget = isNativeTarget();
  const nativeContained =
    nativeTarget && (ACCOUNT_SYNC_CONTAINED || NATIVE_COMMERCE_CONTAINED);
  const sessionUserId = session.user?.id ?? null;
  const subjectKey = session.loading
    ? "session:pending"
    : sessionUserId
      ? `user:${sessionUserId}`
      : "guest";
  const accountSubject = subjectKey.startsWith("user:") ? subjectKey : null;
  const [stored, setStored] = useState<StoredPlusState>(() =>
    nativeContained
      ? containedNativeState(subjectKey)
      : initialState(subjectKey),
  );
  const [storefrontAvailable, setStorefrontAvailable] = useState(
    purchases.channel === "web-stripe",
  );
  const [returnDisplay, setReturnDisplay] = useState<{
    subjectKey: string;
    state: CheckoutReturnState;
  }>(() => ({ subjectKey, state: INITIAL_CHECKOUT_RETURN_STATE }));
  const sequence = useRef(0);
  const storefrontSequence = useRef(0);
  const currentSubject = useRef(subjectKey);
  const accountActions = useRef(new AbortController());
  const reconciledReturn = useRef(false);
  const portalReconciliationPending = useRef(false);
  const portalActionInFlight = useRef(false);
  const returnController = useRef<CheckoutReturnRefreshController | null>(
    null,
  );

  // Abort every billing side effect when its verified account boundary moves.
  useEffect(() => {
    const controller = new AbortController();
    const previousController = accountActions.current;
    accountActions.current = controller;
    previousController.abort();
    currentSubject.current = subjectKey;
    reconciledReturn.current = false;
    portalReconciliationPending.current = false;
    portalActionInFlight.current = false;
    return () => {
      controller.abort();
      sequence.current += 1;
    };
  }, [subjectKey]);

  const visible =
    stored.subjectKey === subjectKey
      ? stored
      : nativeContained
        ? containedNativeState(subjectKey)
        : initialState(subjectKey);
  const visibleReturn =
    returnDisplay.subjectKey === subjectKey
      ? returnDisplay.state
      : INITIAL_CHECKOUT_RETURN_STATE;

  const load = useCallback(async () => {
    if (session.loading) return;
    if (nativeContained) {
      setStored(containedNativeState(subjectKey));
      return;
    }
    const request = ++sequence.current;
    try {
      // Guests need public plan copy but must not probe the protected account
      // projection, which would create a noisy expected 401 on every app load.
      if (subjectKey === "guest") {
        // Native never calls the shared-cacheable plans route: it is purposely
        // absent from the reviewed CORS allowlist.
        if (nativeTarget) {
          setStored({
            ...initialState(subjectKey),
            status: "sign-in-required",
            returnNotice: safeReturnNotice(),
          });
          return;
        }
        const plansResponse = await billingFetch("/api/billing/plans");
        if (
          request !== sequence.current ||
          currentSubject.current !== subjectKey
        ) {
          return;
        }
        if (!plansResponse.ok) throw new Error("failed");
        const planPayload =
          (await plansResponse.json()) as BillingPlansResponse;
        if (
          request !== sequence.current ||
          currentSubject.current !== subjectKey
        ) {
          return;
        }
        setStored({
          ...initialState(subjectKey),
          availability:
            planPayload.availability === "configured"
              ? "configured"
              : "unavailable",
          mode: planPayload.mode ?? null,
          purchasesEnabled: planPayload.purchasesEnabled,
          plans: planPayload.plans,
          status: "sign-in-required",
          returnNotice: safeReturnNotice(),
        });
        return;
      }

      // Native uses only the bearer-authenticated entitlement projection. The
      // server-selected Checkout page remains the authority for actual prices.
      if (nativeTarget) {
        const statusResponse = await billingFetch(
          "/api/billing/status",
          undefined,
          sessionUserId ?? undefined,
        );
        if (
          request !== sequence.current ||
          currentSubject.current !== subjectKey
        ) {
          return;
        }
        if (statusResponse.status === 401) {
          setStored({
            ...initialState(subjectKey),
            status: "sign-in-required",
            returnNotice: safeReturnNotice(),
          });
          return;
        }
        if (!statusResponse.ok) throw new Error("failed");
        const statusPayload =
          (await statusResponse.json()) as BillingStatusResponse;
        if (
          request !== sequence.current ||
          currentSubject.current !== subjectKey
        ) {
          return;
        }
        setStored(statusProjectionState(subjectKey, statusPayload));
        return;
      }

      const [statusResponse, plansResponse] = await Promise.all([
        billingFetch("/api/billing/status"),
        billingFetch("/api/billing/plans"),
      ]);
      if (
        request !== sequence.current ||
        currentSubject.current !== subjectKey
      ) {
        return;
      }
      if (statusResponse.status === 401) {
        const planPayload = plansResponse.ok
          ? ((await plansResponse.json()) as BillingPlansResponse)
          : null;
        if (
          request !== sequence.current ||
          currentSubject.current !== subjectKey
        ) {
          return;
        }
        setStored({
          ...initialState(subjectKey),
          availability:
            planPayload?.availability === "configured"
              ? "configured"
              : "unavailable",
          mode: planPayload?.mode ?? null,
          purchasesEnabled: planPayload?.purchasesEnabled ?? false,
          plans: planPayload?.plans ?? [],
          status: "sign-in-required",
          returnNotice: safeReturnNotice(),
        });
        return;
      }
      if (!statusResponse.ok || !plansResponse.ok) throw new Error("failed");
      const statusPayload =
        (await statusResponse.json()) as BillingStatusResponse;
      const plansPayload =
        (await plansResponse.json()) as BillingPlansResponse;
      if (
        request !== sequence.current ||
        currentSubject.current !== subjectKey
      ) {
        return;
      }
      setStored({
        subjectKey,
        availability: statusPayload.availability,
        mode: statusPayload.mode ?? plansPayload.mode ?? null,
        status: safePlusStatus(statusPayload),
        plan: statusPayload.plan,
        isPlus: statusPayload.isPlus,
        entitlementSource: statusPayload.entitlementSource ?? null,
        purchasesEnabled:
          statusPayload.purchasesEnabled && plansPayload.purchasesEnabled,
        plans: plansPayload.plans,
        interval: statusPayload.interval ?? null,
        currentPeriodEnd: statusPayload.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: statusPayload.cancelAtPeriodEnd ?? false,
        hasCustomer: statusPayload.hasCustomer ?? false,
        synchronizedAt: statusPayload.synchronizedAt ?? null,
        error: null,
        returnNotice: safeReturnNotice(),
      });
    } catch {
      if (
        request !== sequence.current ||
        currentSubject.current !== subjectKey
      ) {
        return;
      }
      setStored({
        ...initialState(subjectKey),
        status: "error",
        error: LOAD_ERROR,
        returnNotice: safeReturnNotice(),
      });
    }
  }, [
    nativeContained,
    nativeTarget,
    session.loading,
    sessionUserId,
    subjectKey,
  ]);

  // Start after the effect commits so async state never cascades in its body.
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  /** Reconciles Stripe for the captured account without trusting a return URL. */
  const requestBillingRefresh = useCallback(
    async (signal?: AbortSignal): Promise<BillingRefreshResult> => {
      if (!sessionUserId || nativeContained) return "failed";
      const outcome = await purchases.restore({
        expectedUserId: sessionUserId,
        signal: signal ?? accountActions.current.signal,
      });
      if (outcome === "restored") return "completed";
      return outcome === "deferred" ? "deferred" : "failed";
    },
    [nativeContained, sessionUserId],
  );

  /** Reads only the sealed entitlement projection during return polling. */
  const requestBillingStatus = useCallback(
    async (signal: AbortSignal): Promise<BillingProjectionResult> => {
      if (!sessionUserId || nativeContained) return "failed";
      try {
        const response = await billingFetch(
          "/api/billing/status",
          { signal },
          sessionUserId,
        );
        if (!response.ok) return "failed";
        const payload = (await response.json()) as BillingStatusResponse;
        return payload.isPlus ? "plus" : "free";
      } catch {
        return "failed";
      }
    },
    [nativeContained, sessionUserId],
  );

  const refresh = useCallback(async () => {
    if (nativeContained) {
      await load();
      return;
    }
    if (sessionUserId) {
      const outcome = await requestBillingRefresh();
      if (outcome === "failed") {
        throw new Error("refresh failed");
      }
      if (outcome === "completed") track("plus_billing_refreshed");
    }
    await load();
  }, [load, nativeContained, requestBillingRefresh, sessionUserId]);

  // One account-keyed controller handles universal-link and legacy web returns.
  useEffect(() => {
    if (nativeContained) return;
    if (session.loading) return;
    const controller = createCheckoutReturnRefreshController({
      refresh: requestBillingRefresh,
      status: requestBillingStatus,
      isOnline: () => navigator.onLine !== false,
      onState: (state) => {
        setReturnDisplay({ subjectKey, state });
        if (state.phase === "confirmed") void load();
      },
    });
    returnController.current = controller;
    const acceptReturn = ({ hint }: { hint: "returned" | "cancelled" }) => {
      controller.begin(hint, accountSubject);
    };
    const unsubscribe = subscribeToCheckoutReturns(acceptReturn);
    let returnObserverDisposed = false;
    let removeNativeReturnObserver: () => void = () => undefined;
    if (nativeTarget) {
      void observeNativeCheckoutReturns((url) => {
        publishCheckoutReturnUrl(url);
      })
        .then((remove) => {
          if (returnObserverDisposed) remove();
          else removeNativeReturnObserver = remove;
        })
        .catch(() => undefined);
    }
    const initialHint = legacyWebCheckoutReturnHint(window.location.href);
    const initialTimer = initialHint
      ? window.setTimeout(
          () => controller.begin(initialHint, accountSubject),
          0,
        )
      : null;

    const refreshOnReturn = () => {
      if (portalReconciliationPending.current) {
        portalReconciliationPending.current = false;
        void refresh().catch(() => void load());
        return;
      }
      if (!controller.resume(accountSubject)) void load();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshOnReturn();
      else controller.pause();
    };
    window.addEventListener("focus", refreshOnReturn);
    window.addEventListener("pageshow", refreshOnReturn);
    window.addEventListener("online", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      if (initialTimer !== null) window.clearTimeout(initialTimer);
      unsubscribe();
      returnObserverDisposed = true;
      removeNativeReturnObserver();
      controller.dispose();
      if (returnController.current === controller) {
        returnController.current = null;
      }
      window.removeEventListener("focus", refreshOnReturn);
      window.removeEventListener("pageshow", refreshOnReturn);
      window.removeEventListener("online", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [
    accountSubject,
    load,
    nativeContained,
    nativeTarget,
    refresh,
    requestBillingRefresh,
    requestBillingStatus,
    session.loading,
    subjectKey,
  ]);

  // StoreKit availability is transient policy state, not profile data. Keep it
  // only in memory, invalidate it on every lifecycle/update signal, and expire
  // it even if the native update stream is interrupted.
  useEffect(() => {
    let disposed = false;
    let expiryTimer: number | null = null;
    let removeNativeObserver: () => void = () => undefined;
    const shouldCheck =
      purchases.channel === "native" &&
      purchases.available &&
      !nativeContained &&
      !session.loading &&
      Boolean(sessionUserId) &&
      (visible.purchasesEnabled || visible.hasCustomer);

    const check = () => {
      const request = ++storefrontSequence.current;
      setStorefrontAvailable(false);
      if (expiryTimer !== null) window.clearTimeout(expiryTimer);
      void purchases.acquisitionAvailable().then((available) => {
        if (disposed || request !== storefrontSequence.current) return;
        setStorefrontAvailable(available);
        expiryTimer = window.setTimeout(check, NATIVE_STOREFRONT_UI_TTL_MS);
      });
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    if (purchases.channel === "web-stripe") {
      const timer = window.setTimeout(() => setStorefrontAvailable(true), 0);
      return () => window.clearTimeout(timer);
    }
    if (!shouldCheck) {
      const timer = window.setTimeout(() => setStorefrontAvailable(false), 0);
      return () => {
        disposed = true;
        storefrontSequence.current += 1;
        window.clearTimeout(timer);
      };
    }

    const initialCheck = window.setTimeout(check, 0);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", checkWhenVisible);
    void purchases.observeAcquisitionChanges(check).then((remove) => {
      if (disposed) remove();
      else removeNativeObserver = remove;
    });
    return () => {
      disposed = true;
      storefrontSequence.current += 1;
      window.clearTimeout(initialCheck);
      if (expiryTimer !== null) window.clearTimeout(expiryTimer);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", checkWhenVisible);
      removeNativeObserver();
    };
  }, [
    nativeContained,
    session.loading,
    sessionUserId,
    visible.hasCustomer,
    visible.purchasesEnabled,
  ]);

  // A Portal query is a display hint only; the server projection stays final.
  useEffect(() => {
    if (nativeContained) return;
    if (session.loading || !session.user) return;
    if (reconciledReturn.current) return;
    const notice = safeReturnNotice();
    if (notice !== "portal-returned") return;
    reconciledReturn.current = true;
    portalReconciliationPending.current = false;
    // Deferred like the initial load so no state cascades in the effect body.
    const timer = window.setTimeout(() => {
      void refresh().catch(() => {
        // A failed reconcile must not leave the returning member on the stale
        // pre-checkout status: fall back to the server projection, which
        // surfaces its own error state when it is unreachable too.
        void load();
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, nativeContained, refresh, session.loading, session.user]);

  const startCheckout = useCallback(
    async (interval: BillingInterval) => {
      returnController.current?.reset();
      if (
        !sessionUserId ||
        !storefrontAvailable ||
        !visible.purchasesEnabled ||
        (nativeTarget
          ? !BILLING_INTERVALS.includes(interval)
          : !visible.plans.some((plan) => plan.interval === interval))
      ) {
        return false;
      }
      const outcome = await purchases.purchase(interval, {
        expectedUserId: sessionUserId,
        signal: accountActions.current.signal,
      });
      if (outcome !== "redirected") {
        if (nativeTarget) setStorefrontAvailable(false);
        return false;
      }
      track("plus_checkout_opened", { interval });
      return true;
    },
    [
      nativeTarget,
      sessionUserId,
      storefrontAvailable,
      visible.plans,
      visible.purchasesEnabled,
    ],
  );

  const openCustomerPortal = useCallback(async () => {
    if (
      !sessionUserId ||
      !storefrontAvailable ||
      !visible.hasCustomer ||
      !purchases.available ||
      portalActionInFlight.current
    ) {
      return false;
    }
    portalActionInFlight.current = true;
    portalReconciliationPending.current = true;
    try {
      const outcome = await purchases.manage({
        expectedUserId: sessionUserId,
        signal: accountActions.current.signal,
      });
      if (outcome !== "redirected") {
        portalReconciliationPending.current = false;
        if (nativeTarget) setStorefrontAvailable(false);
        return false;
      }
      track("plus_billing_portal_opened");
      return true;
    } catch {
      portalReconciliationPending.current = false;
      return false;
    } finally {
      portalActionInFlight.current = false;
    }
  }, [nativeTarget, sessionUserId, storefrontAvailable, visible.hasCustomer]);

  const purchaseOptions = nativeTarget
    ? BILLING_INTERVALS
    : visible.plans.map(({ interval }) => interval);

  return {
    configured: visible.availability === "configured",
    mode: visible.mode,
    status: visible.status,
    loading: visible.status === "loading",
    plan: visible.plan,
    isPlus: visible.isPlus,
    entitlementSource: visible.entitlementSource,
    canPurchase:
      Boolean(session.user) &&
      purchases.available &&
      storefrontAvailable &&
      visible.purchasesEnabled &&
      (nativeTarget || visible.plans.length === BILLING_INTERVALS.length) &&
      !visible.isPlus,
    canManage:
      Boolean(session.user) &&
      purchases.available &&
      storefrontAvailable &&
      visible.hasCustomer,
    purchaseChannel: purchases.channel,
    purchaseOptions,
    plans: visible.plans,
    interval: visible.interval,
    currentPeriodEnd: visible.currentPeriodEnd,
    cancelAtPeriodEnd: visible.cancelAtPeriodEnd,
    hasCustomer: visible.hasCustomer,
    synchronizedAt: visible.synchronizedAt,
    error: visible.error,
    returnNotice:
      visible.returnNotice === "portal-returned"
        ? "portal-returned"
        : visibleReturn.hint === "returned"
          ? "checkout-returned"
          : visibleReturn.hint === "cancelled"
            ? "checkout-cancelled"
            : null,
    returnState: visibleReturn,
    startCheckout,
    openCustomerPortal,
    refresh,
    retryReturnRefresh: () => {
      returnController.current?.retry(accountSubject);
    },
  };
}

const PlusContext = createContext<PlusState | null>(null);

/** Runs one Stripe projection coordinator for the persistent app shell. */
export function PlusProvider({ children }: { children: React.ReactNode }) {
  const state = usePlusCoordinator();
  return createElement(PlusContext.Provider, { value: state }, children);
}

/** Reads Plus state that came only from the sealed server projection. */
export function usePlus(): PlusState {
  const state = useContext(PlusContext);
  if (!state) throw new Error("usePlus must be rendered inside PlusProvider.");
  return state;
}
