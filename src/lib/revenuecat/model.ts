import type {
  CustomerInfo,
  Offering,
  Offerings,
  Purchases,
} from "@revenuecat/purchases-js";
import { planFromActiveEntitlements } from "@/lib/questos/subscription-engine";
import type { PlanKey } from "@/lib/questos/types";

const USER_CANCELLED_ERROR_CODE = 1;

export type PlusStatus =
  | "coming-soon"
  | "unconfigured"
  | "loading"
  | "error"
  | "free"
  | "plus"
  | "purchase-cancelled"
  | "purchase-failed"
  | "management-unavailable";

export interface PlusSnapshot {
  offering: Offering | null;
  canPurchase: boolean;
  plan: PlanKey;
  managementURL: string | null;
}
type CustomerSummary = Pick<CustomerInfo, "entitlements" | "managementURL">;

function safeManagementURL(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function snapshotFromCustomer(
  offering: Offering | null,
  customerInfo: CustomerSummary,
): PlusSnapshot {
  return {
    offering,
    canPurchase: Boolean(
      offering?.hasPaywall && offering.availablePackages.length > 0,
    ),
    plan: planFromActiveEntitlements(
      Object.keys(customerInfo.entitlements.active),
    ),
    managementURL: safeManagementURL(customerInfo.managementURL),
  };
}

/** Only the dashboard-selected current offering may drive the purchase UI. */
export function snapshotFromRevenueCat(
  offerings: Pick<Offerings, "current">,
  customerInfo: CustomerSummary,
): PlusSnapshot {
  return snapshotFromCustomer(offerings.current ?? null, customerInfo);
}

export function statusFromSnapshot(snapshot: PlusSnapshot): PlusStatus {
  if (snapshot.plan === "plus") {
    return snapshot.managementURL ? "plus" : "management-unavailable";
  }
  return "free";
}

export type PaywallOutcome =
  | { kind: "completed"; customerInfo: CustomerInfo }
  | { kind: "cancelled" }
  | { kind: "failed" }
  | { kind: "unavailable" };

type PaywallPurchases = Pick<Purchases, "presentPaywall">;

/**
 * Present only a complete current paywall. Direct package purchase is
 * intentionally unsupported so incomplete dashboard state cannot sell.
 */
export async function presentCurrentPaywall(
  purchases: PaywallPurchases,
  offering: Offering | null,
): Promise<PaywallOutcome> {
  if (!offering?.hasPaywall || offering.availablePackages.length === 0) {
    return { kind: "unavailable" };
  }

  try {
    const result = await purchases.presentPaywall({ offering });
    return { kind: "completed", customerInfo: result.customerInfo };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "errorCode" in error &&
      error.errorCode === USER_CANCELLED_ERROR_CODE
    ) {
      return { kind: "cancelled" };
    }
    return { kind: "failed" };
  }
}
