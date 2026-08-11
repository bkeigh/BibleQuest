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
import { purchaseAdapter } from "@/lib/platform/purchases";
import { NATIVE_COMMERCE_CONTAINED } from "./containment";
import type { BillingInterval, BillingPlan } from "./validation";

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

async function billingFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return apiFetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
}

// Native billing remains unavailable until a separately audited adapter is supplied.
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
  plans: BillingPlan[];
  interval: BillingInterval | "unknown" | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  synchronizedAt: string | null;
  error: string | null;
  returnNotice: StoredPlusState["returnNotice"];
  startCheckout: (interval: BillingInterval) => Promise<boolean>;
  openCustomerPortal: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

/** Coordinates one account-bound, server-authoritative Plus projection. */
function usePlusCoordinator(): PlusState {
  const session = useSession();
  const subjectKey = session.loading
    ? "session:pending"
    : session.user
      ? `user:${session.user.id}`
      : "guest";
  const [stored, setStored] = useState<StoredPlusState>(() =>
    NATIVE_COMMERCE_CONTAINED
      ? containedNativeState(subjectKey)
      : initialState(subjectKey),
  );
  const sequence = useRef(0);
  const currentSubject = useRef(subjectKey);
  const reconciledReturn = useRef(false);
  const portalReconciliationPending = useRef(false);
  const portalActionInFlight = useRef(false);

  useEffect(() => {
    currentSubject.current = subjectKey;
    reconciledReturn.current = false;
    portalReconciliationPending.current = false;
    portalActionInFlight.current = false;
    return () => {
      sequence.current += 1;
    };
  }, [subjectKey]);

  const visible =
    stored.subjectKey === subjectKey
      ? stored
      : NATIVE_COMMERCE_CONTAINED
        ? containedNativeState(subjectKey)
        : initialState(subjectKey);

  const load = useCallback(async () => {
    if (session.loading) return;
    if (NATIVE_COMMERCE_CONTAINED) {
      setStored(containedNativeState(subjectKey));
      return;
    }
    const request = ++sequence.current;
    try {
      // Guests need public plan copy but must not probe the protected account
      // projection, which would create a noisy expected 401 on every app load.
      if (subjectKey === "guest") {
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
  }, [session.loading, subjectKey]);

  // Start after the effect commits so async state never cascades in its body.
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const refresh = useCallback(async () => {
    if (NATIVE_COMMERCE_CONTAINED) {
      await load();
      return;
    }
    if (session.user) {
      const outcome = await purchases.restore();
      if (outcome === "failed" || outcome === "unavailable") {
        throw new Error("refresh failed");
      }
      if (outcome === "restored") track("plus_billing_refreshed");
    }
    await load();
  }, [load, session.user]);

  // Returning focus after an external Portal visit reconciles current Stripe
  // objects once; ordinary lifecycle events keep using the cheaper status load.
  useEffect(() => {
    if (NATIVE_COMMERCE_CONTAINED) return;
    if (session.loading) return;
    const refreshOnReturn = () => {
      if (!portalReconciliationPending.current) {
        void load();
        return;
      }
      portalReconciliationPending.current = false;
      void refresh().catch(() => void load());
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshOnReturn();
    };
    window.addEventListener("focus", refreshOnReturn);
    window.addEventListener("pageshow", refreshOnReturn);
    window.addEventListener("online", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      window.removeEventListener("pageshow", refreshOnReturn);
      window.removeEventListener("online", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load, refresh, session.loading]);

  // Checkout and Portal redirects are display hints only. Reconcile against
  // current Stripe objects once, then let the server projection decide access.
  useEffect(() => {
    if (NATIVE_COMMERCE_CONTAINED) return;
    if (session.loading || !session.user) return;
    if (reconciledReturn.current) return;
    const notice = safeReturnNotice();
    if (notice !== "checkout-returned" && notice !== "portal-returned") return;
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
  }, [load, refresh, session.loading, session.user]);

  const startCheckout = useCallback(
    async (interval: BillingInterval) => {
      if (
        !session.user ||
        !visible.purchasesEnabled ||
        !visible.plans.some((plan) => plan.interval === interval)
      ) {
        return false;
      }
      const outcome = await purchases.purchase(interval);
      if (outcome !== "redirected") return false;
      track("plus_checkout_opened", { interval });
      return true;
    },
    [session.user, visible.plans, visible.purchasesEnabled],
  );

  const openCustomerPortal = useCallback(async () => {
    if (
      !session.user ||
      !visible.hasCustomer ||
      !purchases.available ||
      portalActionInFlight.current
    ) {
      return false;
    }
    portalActionInFlight.current = true;
    portalReconciliationPending.current = true;
    try {
      const outcome = await purchases.manage();
      if (outcome !== "redirected") {
        portalReconciliationPending.current = false;
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
  }, [session.user, visible.hasCustomer]);

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
      visible.purchasesEnabled &&
      visible.plans.length === 3 &&
      !visible.isPlus,
    canManage:
      Boolean(session.user) && purchases.available && visible.hasCustomer,
    plans: visible.plans,
    interval: visible.interval,
    currentPeriodEnd: visible.currentPeriodEnd,
    cancelAtPeriodEnd: visible.cancelAtPeriodEnd,
    hasCustomer: visible.hasCustomer,
    synchronizedAt: visible.synchronizedAt,
    error: visible.error,
    returnNotice: visible.returnNotice,
    startCheckout,
    openCustomerPortal,
    refresh,
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
