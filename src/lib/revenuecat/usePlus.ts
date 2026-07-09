"use client";

import { useCallback, useEffect, useState } from "react";
import type { Offering, Package } from "@revenuecat/purchases-js";
import { useSession } from "@/lib/supabase/useSession";
import { planFromActiveEntitlements } from "@/lib/questos/subscription-engine";
import type { PlanKey } from "@/lib/questos/types";
import { getPurchases, isRevenueCatConfigured } from "./client";

/** ErrorCode.UserCancelledError — closing the paywall/checkout is not an error. */
const USER_CANCELLED = 1;

interface PlusSnapshot {
  offering: Offering | null;
  hasPaywall: boolean;
  plan: PlanKey;
  managementURL: string | null;
}

/**
 * Fetch offerings + entitlement state from RevenueCat. Returns null when the
 * SDK isn't configured. Kept outside the component (and free of setState) so
 * the effect can drive it via .then/.catch — the same shape as useSession,
 * which keeps react-hooks/set-state-in-effect happy.
 */
async function fetchPlusSnapshot(
  supabaseUserId: string | null,
): Promise<PlusSnapshot | null> {
  const purchases = await getPurchases(supabaseUserId);
  if (!purchases) return null;
  const [offerings, info] = await Promise.all([
    purchases.getOfferings(),
    purchases.getCustomerInfo(),
  ]);
  const offering = offerings.current ?? null;
  return {
    offering,
    hasPaywall: offering?.hasPaywall ?? false,
    plan: planFromActiveEntitlements(Object.keys(info.entitlements.active)),
    managementURL: info.managementURL,
  };
}

export interface PlusState {
  /** RevenueCat is wired (public key present). False = today's guest mode. */
  configured: boolean;
  loading: boolean;
  plan: PlanKey;
  isPlus: boolean;
  offering: Offering | null;
  packages: Package[];
  /** True once a paywall is attached + published to the current offering. */
  hasPaywall: boolean;
  /** RevenueCat-hosted management page — the web "Customer Center". */
  managementURL: string | null;
  error: string | null;
  /** Preferred: present the RevenueCat-designed paywall (needs hasPaywall). */
  presentPaywall: () => Promise<void>;
  /** Fallback: buy a single package directly (works before a paywall exists). */
  purchase: (pkg: Package) => Promise<void>;
  /** Open the RevenueCat management page (cancel / update payment). */
  openCustomerCenter: () => void;
  refresh: () => Promise<void>;
}

/**
 * Live Plus status via RevenueCat. When RevenueCat isn't configured this
 * settles immediately to a stable free/unconfigured state, so the Plus
 * surfaces render their "coming soon" copy with no network calls.
 */
export function usePlus(): PlusState {
  const configured = isRevenueCatConfigured();
  const { user } = useSession();
  const supabaseUserId = user?.id ?? null;

  const [loading, setLoading] = useState(configured);
  const [plan, setPlan] = useState<PlanKey>("free");
  const [offering, setOffering] = useState<Offering | null>(null);
  const [hasPaywall, setHasPaywall] = useState(false);
  const [managementURL, setManagementURL] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    fetchPlusSnapshot(supabaseUserId)
      .then((snapshot) => {
        if (cancelled) return;
        if (snapshot) {
          setOffering(snapshot.offering);
          setHasPaywall(snapshot.hasPaywall);
          setPlan(snapshot.plan);
          setManagementURL(snapshot.managementURL);
          setError(null);
        }
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Couldn’t load membership options.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, supabaseUserId]);

  const refresh = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    try {
      const snapshot = await fetchPlusSnapshot(supabaseUserId);
      if (snapshot) {
        setOffering(snapshot.offering);
        setHasPaywall(snapshot.hasPaywall);
        setPlan(snapshot.plan);
        setManagementURL(snapshot.managementURL);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t load membership options.");
    } finally {
      setLoading(false);
    }
  }, [configured, supabaseUserId]);

  const openCustomerCenter = useCallback(() => {
    if (managementURL) {
      window.open(managementURL, "_blank", "noopener,noreferrer");
    }
  }, [managementURL]);

  // Preferred, modern path: RevenueCat renders the dashboard-designed paywall
  // as a full-screen overlay and runs the whole checkout; we just react to the
  // result. Web has no native Customer Center, so its link routes to the
  // hosted management page.
  const presentPaywall = useCallback(async () => {
    const purchases = await getPurchases(supabaseUserId);
    if (!purchases) return;
    setError(null);
    try {
      const result = await purchases.presentPaywall({
        ...(offering ? { offering } : {}),
        onVisitCustomerCenter: () => {
          if (managementURL) {
            window.open(managementURL, "_blank", "noopener,noreferrer");
          }
        },
      });
      setPlan(
        planFromActiveEntitlements(
          Object.keys(result.customerInfo.entitlements.active),
        ),
      );
      setManagementURL(result.customerInfo.managementURL);
    } catch (e) {
      if ((e as { errorCode?: number })?.errorCode === USER_CANCELLED) return;
      setError(e instanceof Error ? e.message : "The paywall couldn’t be opened.");
    }
  }, [supabaseUserId, offering, managementURL]);

  const purchase = useCallback(
    async (pkg: Package) => {
      const purchases = await getPurchases(supabaseUserId);
      if (!purchases) return;
      setError(null);
      try {
        const { customerInfo } = await purchases.purchase({ rcPackage: pkg });
        setPlan(
          planFromActiveEntitlements(Object.keys(customerInfo.entitlements.active)),
        );
        setManagementURL(customerInfo.managementURL);
      } catch (e) {
        if ((e as { errorCode?: number })?.errorCode === USER_CANCELLED) return;
        setError(e instanceof Error ? e.message : "Purchase couldn’t be completed.");
        throw e;
      }
    },
    [supabaseUserId],
  );

  return {
    configured,
    loading,
    plan,
    isPlus: plan === "plus",
    offering,
    packages: offering?.availablePackages ?? [],
    hasPaywall,
    managementURL,
    error,
    presentPaywall,
    purchase,
    openCustomerCenter,
    refresh,
  };
}
