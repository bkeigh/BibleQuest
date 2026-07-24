export const STRIPE_BILLING_CONTRACT = "biblequest_stripe_test_billing_v1";
export const MAX_BILLING_REQUEST_BYTES = 8 * 1024;

export const BILLING_INTERVALS = ["monthly", "annual"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export interface BillingPlan {
  interval: BillingInterval;
  unitAmount: number;
  currency: string;
}

/** Accepts only the two server-allowlisted Plus billing intervals. */
export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "monthly" || value === "annual";
}

/** Formats Stripe minor units without inventing price or renewal terms. */
export function formatBillingAmount(plan: BillingPlan): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: plan.currency.toUpperCase(),
  }).format(plan.unitAmount / 100);
}
