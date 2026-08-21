"use client";

import { createContext, createElement, useContext } from "react";
import type { PlanKey } from "@/lib/questos/types";
import type { BillingInterval, BillingPlan } from "@/lib/billing/validation";

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

export interface PlusState {
  configured: boolean;
  mode: "test" | "live" | null;
  status: PlusStatus;
  loading: boolean;
  plan: PlanKey;
  isPlus: boolean;
  entitlementSource: "stripe" | "operator" | null;
  canPurchase: boolean;
  plans: BillingPlan[];
  interval: BillingInterval | "unknown" | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  synchronizedAt: string | null;
  error: string | null;
  returnNotice: "checkout-returned" | "checkout-cancelled" | null;
  startCheckout: (interval: BillingInterval) => Promise<boolean>;
  openCustomerPortal: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

/** Keeps membership free and every purchase path closed in the guest build. */
const GUEST_PLUS_STATE: PlusState = Object.freeze({
  configured: false,
  mode: null,
  status: "free",
  loading: false,
  plan: "free",
  isPlus: false,
  entitlementSource: null,
  canPurchase: false,
  plans: [],
  interval: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  hasCustomer: false,
  synchronizedAt: null,
  error: null,
  returnNotice: null,
  startCheckout: async () => false,
  openCustomerPortal: async () => false,
  refresh: async () => undefined,
});

const PlusContext = createContext<PlusState>(GUEST_PLUS_STATE);

/** Provides one immutable free state without starting a remote coordinator. */
export function PlusProvider({ children }: { children: React.ReactNode }) {
  return createElement(
    PlusContext.Provider,
    { value: GUEST_PLUS_STATE },
    children,
  );
}

/** Reads the immutable device-only membership state. */
export function usePlus(): PlusState {
  return useContext(PlusContext);
}
