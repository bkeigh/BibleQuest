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

export interface OperatorPlusGrantRow {
  id: string;
  user_id: string;
  starts_at: string;
  expires_at: string | null;
  revoked_at: string | null;
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

/** Proves that manual Plus access is private and mutation-gated. */
export async function operatorPlusGrantContractReady(
  client: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await client.rpc("operator_plus_grant_contract");
  return (
    !error &&
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Object.keys(data).sort().join(",") === "contract,ok" &&
    (data as { contract?: unknown }).contract ===
      "biblequest_operator_plus_grant_v1" &&
    (data as { ok?: unknown }).ok === true
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
    // Recorded so a test-mode row can never be mistaken for a live one.
    livemode: subscription.livemode,
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
  operatorGrants: OperatorPlusGrantRow[] = [],
  now = Date.now(),
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
  const operatorGrant = operatorGrants.find((grant) => {
    const startsAt = Date.parse(grant.starts_at);
    const expiresAt = grant.expires_at ? Date.parse(grant.expires_at) : null;
    return (
      grant.revoked_at === null &&
      Number.isFinite(startsAt) &&
      startsAt <= now &&
      (expiresAt === null || (Number.isFinite(expiresAt) && expiresAt > now))
    );
  });
  const current = entitled ?? ordered[0] ?? null;
  const isPlus = Boolean(entitled || operatorGrant);
  return {
    plan: isPlus ? ("plus" as const) : ("free" as const),
    isPlus,
    status: entitled
      ? current?.status ?? "active"
      : operatorGrant
        ? "active"
        : current?.status ?? "none",
    entitlementSource: entitled
      ? ("stripe" as const)
      : operatorGrant
        ? ("operator" as const)
        : null,
    interval: entitled ? current?.billing_interval ?? null : null,
    currentPeriodEnd: entitled
      ? current?.current_period_end ?? null
      : operatorGrant?.expires_at ?? null,
    cancelAtPeriodEnd: entitled
      ? current?.cancel_at_period_end ?? false
      : false,
    hasCustomer,
    synchronizedAt: entitled ? current?.synchronized_at ?? null : null,
  };
}
