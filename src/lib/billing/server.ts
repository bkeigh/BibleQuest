import "server-only";

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STRIPE_BILLING_CONTRACT,
  type BillingInterval,
} from "./validation";
import type { StripeBillingConfiguration } from "./config.server";

export interface StripeCustomerRow {
  user_id: string | null;
  stripe_customer_id: string;
  livemode: boolean;
}

export interface SubscriptionProjectionRow {
  id: string;
  user_id: string | null;
  status: Stripe.Subscription.Status | "none";
  plan_key: "free" | "plus";
  current_period_start: string | null;
  current_period_end: string | null;
  billing_interval: BillingInterval | "unknown" | null;
  currency: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  trial_end: string | null;
  synchronized_at: string | null;
}

function isBillingContract(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === "contract,ok" &&
    (value as { contract?: unknown }).contract === STRIPE_BILLING_CONTRACT &&
    (value as { ok?: unknown }).ok === true
  );
}

/** Proves the live billing migration and sealed RLS posture. */
export async function stripeBillingContractReady(
  client: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await client.rpc("stripe_billing_contract");
  return !error && isBillingContract(data);
}

function id(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function instant(value: number | null | undefined): string | null {
  return typeof value === "number"
    ? new Date(value * 1000).toISOString()
    : null;
}

/** Builds one order-tolerant projection from the current Stripe subscription. */
export function subscriptionProjection(
  subscription: Stripe.Subscription,
  userId: string | null,
  configuration: StripeBillingConfiguration,
  event?: Pick<Stripe.Event, "id" | "created">,
) {
  const item = subscription.items.data[0];
  if (!item || subscription.items.data.length !== 1) {
    throw new Error("Stripe subscription shape unavailable.");
  }
  const priceId = item.price.id;
  const recognizedInterval: BillingInterval | null =
    priceId === configuration.priceIds.monthly
      ? "monthly"
      : priceId === configuration.priceIds.annual
        ? "annual"
        : null;
  const product = id(item.price.product);
  const customer = id(subscription.customer);
  if (!customer || !product) {
    throw new Error("Stripe subscription shape unavailable.");
  }
  const entitled =
    recognizedInterval !== null &&
    (subscription.status === "trialing" ||
      subscription.status === "active");

  return {
    user_id: userId,
    provider: "stripe",
    status: subscription.status,
    plan_key: entitled ? "plus" : "free",
    current_period_start: instant(item.current_period_start),
    current_period_end: instant(item.current_period_end),
    external_customer_id: customer,
    external_subscription_id: subscription.id,
    stripe_price_id: priceId,
    stripe_product_id: product,
    billing_interval: recognizedInterval ?? "unknown",
    currency: subscription.currency,
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: instant(subscription.canceled_at),
    trial_end: instant(subscription.trial_end),
    latest_invoice_id: id(subscription.latest_invoice),
    ...(event
      ? {
          last_stripe_event_created: event.created,
          last_stripe_event_id: event.id,
        }
      : {}),
    synchronized_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Returns the safe owner status used by all client entitlement checks. */
export function billingStatusFromRows(
  rows: SubscriptionProjectionRow[],
  hasCustomer: boolean,
) {
  const ordered = [...rows].sort((left, right) => {
    const leftEnd = Date.parse(left.current_period_end ?? "") || 0;
    const rightEnd = Date.parse(right.current_period_end ?? "") || 0;
    return rightEnd - leftEnd;
  });
  const entitled = ordered.find(
    (row) =>
      row.plan_key === "plus" &&
      (row.status === "trialing" || row.status === "active"),
  );
  const current = entitled ?? ordered[0] ?? null;
  return {
    plan: entitled ? ("plus" as const) : ("free" as const),
    isPlus: Boolean(entitled),
    status: current?.status ?? "none",
    interval: current?.billing_interval ?? null,
    currentPeriodEnd: current?.current_period_end ?? null,
    cancelAtPeriodEnd: current?.cancel_at_period_end ?? false,
    hasCustomer,
    synchronizedAt: current?.synchronized_at ?? null,
  };
}
