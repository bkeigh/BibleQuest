"use client";

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
  purchasesEnabled: boolean;
  plans: BillingPlan[];
  interval: BillingInterval | "unknown" | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  synchronizedAt: string | null;
  error: string | null;
  returnNotice: "checkout-returned" | "checkout-cancelled" | null;
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

function safePlusStatus(value: BillingStatusResponse): PlusStatus {
  if (value.availability === "coming-soon") return "coming-soon";
  if (value.isPlus) return "plus";
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
  return fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
}

function safeReturnNotice(): StoredPlusState["returnNotice"] {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("checkout");
  return value === "returned"
    ? "checkout-returned"
    : value === "cancelled"
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
  canPurchase: boolean;
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
    initialState(subjectKey),
  );
  const sequence = useRef(0);
  const currentSubject = useRef(subjectKey);

  useEffect(() => {
    currentSubject.current = subjectKey;
    return () => {
      sequence.current += 1;
    };
  }, [subjectKey]);

  const visible =
    stored.subjectKey === subjectKey ? stored : initialState(subjectKey);

  const load = useCallback(async () => {
    if (session.loading) return;
    const request = ++sequence.current;
    try {
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

  useEffect(() => {
    if (session.loading) return;
    const refreshOnReturn = () => void load();
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
  }, [load, session.loading]);

  const refresh = useCallback(async () => {
    if (session.user) {
      const response = await billingFetch("/api/billing/refresh", {
        method: "POST",
      });
      if (!response.ok && response.status !== 429) {
        throw new Error("refresh failed");
      }
      if (response.ok) track("plus_billing_refreshed");
    }
    await load();
  }, [load, session.user]);

  const startCheckout = useCallback(
    async (interval: BillingInterval) => {
      if (
        !session.user ||
        !visible.purchasesEnabled ||
        !visible.plans.some((plan) => plan.interval === interval)
      ) {
        return false;
      }
      const response = await billingFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      if (!response.ok) return false;
      const payload = (await response.json()) as { url?: unknown };
      if (typeof payload.url !== "string") return false;
      const destination = new URL(payload.url);
      if (destination.origin !== "https://checkout.stripe.com") return false;
      track("plus_checkout_opened", { interval });
      window.location.assign(destination.toString());
      return true;
    },
    [session.user, visible.plans, visible.purchasesEnabled],
  );

  const openCustomerPortal = useCallback(async () => {
    if (!session.user || !visible.hasCustomer) return false;
    const response = await billingFetch("/api/billing/portal", {
      method: "POST",
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { url?: unknown };
    if (typeof payload.url !== "string") return false;
    const destination = new URL(payload.url);
    if (destination.origin !== "https://billing.stripe.com") return false;
    track("plus_billing_portal_opened");
    window.location.assign(destination.toString());
    return true;
  }, [session.user, visible.hasCustomer]);

  return {
    configured: visible.availability === "configured",
    mode: visible.mode,
    status: visible.status,
    loading: visible.status === "loading",
    plan: visible.plan,
    isPlus: visible.isPlus,
    canPurchase:
      Boolean(session.user) &&
      visible.purchasesEnabled &&
      visible.plans.length === 2 &&
      !visible.isPlus,
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
