"use client";

/**
 * React coordinator for BibleQuest Plus. It binds RevenueCat to the current
 * Supabase identity, suppresses stale async responses during account changes,
 * and exposes a provider-neutral state/actions API to membership screens.
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
import type { Offering } from "@revenuecat/purchases-js";
import { useSession } from "@/lib/supabase/useSession";
import type { PlanKey } from "@/lib/questos/types";
import {
  getRevenueCatAvailability,
  runRevenueCatOperation,
} from "./client";
import {
  presentCurrentPaywall,
  snapshotFromCustomer,
  snapshotFromRevenueCat,
  statusFromSnapshot,
  type PlusSnapshot,
  type PlusStatus,
} from "./model";

const LOAD_ERROR =
  "Membership status couldn’t be refreshed. Your free experience is unaffected.";
const PURCHASE_ERROR =
  "The purchase couldn’t be completed. No charge was confirmed; please try again.";

interface StoredPlusState extends PlusSnapshot {
  subjectKey: string;
  status: PlusStatus;
  error: string | null;
}

function emptySnapshot(): PlusSnapshot {
  return {
    offering: null,
    canPurchase: false,
    plan: "free",
    managementURL: null,
  };
}

function initialState(
  subjectKey: string,
  status: PlusStatus,
): StoredPlusState {
  return { subjectKey, status, error: null, ...emptySnapshot() };
}

function stateFromSnapshot(
  subjectKey: string,
  snapshot: PlusSnapshot,
): StoredPlusState {
  return {
    subjectKey,
    status: statusFromSnapshot(snapshot),
    error: null,
    ...snapshot,
  };
}

async function fetchPlusSnapshot(
  signedInUserId: string | null,
): Promise<PlusSnapshot | null> {
  return runRevenueCatOperation(signedInUserId, async (purchases) => {
    // The identity controller holds this entire operation in one serialized
    // lane, so an account change cannot split these two reads across users.
    const [offerings, customerInfo] = await Promise.all([
      purchases.getOfferings(),
      purchases.getCustomerInfo(),
    ]);
    return snapshotFromRevenueCat(offerings, customerInfo);
  });
}

export interface PlusState {
  configured: boolean;
  status: PlusStatus;
  loading: boolean;
  plan: PlanKey;
  isPlus: boolean;
  offering: Offering | null;
  /** True only for a non-empty current offering with a published paywall. */
  canPurchase: boolean;
  managementURL: string | null;
  error: string | null;
  presentPaywall: () => Promise<"completed" | "cancelled" | "failed" | "unavailable">;
  openCustomerCenter: () => boolean;
  refresh: () => Promise<void>;
}

/**
 * RevenueCat state for the active Supabase identity (or a persisted guest).
 * Until auth has settled, and during every identity change, the visible state
 * is loading + free so a prior user's entitlement can never flash or leak.
 */
function usePlusCoordinator(): PlusState {
  const availability = getRevenueCatAvailability();
  const session = useSession();
  const sessionPending = session.configured && session.loading;
  const signedInUserId = session.user?.id ?? null;
  const subjectKey = sessionPending
    ? "session:pending"
    : signedInUserId
      ? `user:${signedInUserId}`
      : "guest";
  const inactiveStatus: PlusStatus =
    availability.status === "coming-soon" ? "coming-soon" : "unconfigured";
  const fallbackStatus: PlusStatus = availability.configured
    ? "loading"
    : inactiveStatus;

  const [stored, setStored] = useState<StoredPlusState>(() =>
    initialState(subjectKey, fallbackStatus),
  );
  const requestSequence = useRef(0);
  const currentSubject = useRef(subjectKey);

  useEffect(() => {
    currentSubject.current = subjectKey;
    return () => {
      requestSequence.current += 1;
    };
  }, [subjectKey]);

  const visible =
    stored.subjectKey === subjectKey
      ? stored
      : initialState(subjectKey, fallbackStatus);

  const loadSnapshot = useCallback(
    async (showLoading: boolean) => {
      if (!availability.configured || sessionPending) return;
      const request = ++requestSequence.current;

      if (showLoading) {
        setStored(initialState(subjectKey, "loading"));
      }

      try {
        const snapshot = await fetchPlusSnapshot(signedInUserId);
        if (
          !snapshot ||
          request !== requestSequence.current ||
          currentSubject.current !== subjectKey
        ) {
          return;
        }
        setStored(stateFromSnapshot(subjectKey, snapshot));
      } catch {
        if (
          request !== requestSequence.current ||
          currentSubject.current !== subjectKey
        ) {
          return;
        }
        setStored({
          ...initialState(subjectKey, "error"),
          error: LOAD_ERROR,
        });
      }
    }, [
      availability.configured,
      sessionPending,
      signedInUserId,
      subjectKey,
    ]);

  useEffect(() => {
    if (!availability.configured || sessionPending) return;
    const request = ++requestSequence.current;
    fetchPlusSnapshot(signedInUserId)
      .then((snapshot) => {
        if (
          !snapshot ||
          request !== requestSequence.current ||
          currentSubject.current !== subjectKey
        ) {
          return;
        }
        setStored(stateFromSnapshot(subjectKey, snapshot));
      })
      .catch(() => {
        if (
          request !== requestSequence.current ||
          currentSubject.current !== subjectKey
        ) {
          return;
        }
        setStored({
          ...initialState(subjectKey, "error"),
          error: LOAD_ERROR,
        });
      });
    return () => {
      requestSequence.current += 1;
    };
  }, [
    availability.configured,
    sessionPending,
    signedInUserId,
    subjectKey,
  ]);

  // presentPaywall resolves when control returns. These browser lifecycle
  // events cover tab-based checkout, bfcache restores, reconnects, and customer
  // portal returns so entitlement/management state is fetched again.
  useEffect(() => {
    if (!availability.configured || sessionPending) return;
    const refreshOnReturn = () => void loadSnapshot(false);
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
  }, [availability.configured, sessionPending, loadSnapshot]);

  const refresh = useCallback(
    async () => loadSnapshot(true),
    [loadSnapshot],
  );

  const openCustomerCenter = useCallback(() => {
    if (!visible.managementURL) return false;
    window.open(visible.managementURL, "_blank", "noopener,noreferrer");
    return true;
  }, [visible.managementURL]);

  const presentPaywall = useCallback(async () => {
    if (
      !availability.configured ||
      sessionPending ||
      !visible.canPurchase ||
      !visible.offering
    ) {
      return "unavailable" as const;
    }

    const capturedSubject = subjectKey;
    setStored({ ...visible, error: null });
    const outcome = await runRevenueCatOperation(
      signedInUserId,
      (purchases) => presentCurrentPaywall(purchases, visible.offering),
    );

    if (!outcome || currentSubject.current !== capturedSubject) {
      return "unavailable" as const;
    }

    if (outcome.kind === "cancelled") {
      setStored({
        ...visible,
        subjectKey: capturedSubject,
        status: "purchase-cancelled",
        error: null,
      });
      return "cancelled" as const;
    }

    if (outcome.kind === "failed") {
      setStored({
        ...visible,
        subjectKey: capturedSubject,
        status: "purchase-failed",
        error: PURCHASE_ERROR,
      });
      return "failed" as const;
    }

    if (outcome.kind === "unavailable") {
      return "unavailable" as const;
    }

    const snapshot = snapshotFromCustomer(
      visible.offering,
      outcome.customerInfo,
    );
    setStored(stateFromSnapshot(capturedSubject, snapshot));
    await loadSnapshot(false);
    return "completed" as const;
  }, [
    availability.configured,
    loadSnapshot,
    sessionPending,
    signedInUserId,
    subjectKey,
    visible,
  ]);

  return {
    configured: availability.configured,
    status: visible.status,
    loading: visible.status === "loading",
    plan: visible.plan,
    isPlus: visible.plan === "plus",
    offering: visible.offering,
    canPurchase: visible.canPurchase,
    managementURL: visible.managementURL,
    error: visible.error,
    presentPaywall,
    openCustomerCenter,
    refresh,
  };
}

const PlusContext = createContext<PlusState | null>(null);

/** Runs one entitlement coordinator for the persistent private app shell. */
export function PlusProvider({ children }: { children: React.ReactNode }) {
  const state = usePlusCoordinator();
  return createElement(PlusContext.Provider, { value: state }, children);
}

/** Reads the shared entitlement state without duplicating RevenueCat requests. */
export function usePlus(): PlusState {
  const state = useContext(PlusContext);
  if (!state) {
    throw new Error("usePlus must be rendered inside PlusProvider.");
  }
  return state;
}
