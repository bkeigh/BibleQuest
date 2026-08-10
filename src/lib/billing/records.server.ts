import "server-only";

import type Stripe from "stripe";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { StripeBillingConfiguration } from "./config.server";
import { stripeObjectId } from "./stripe-object.server";
import {
  subscriptionProjection,
  type StripeCustomerRow,
} from "./server";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ActionClaim {
  claimed: boolean;
  claimToken?: string;
}

function parseActionClaim(value: unknown): ActionClaim {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Stripe action claim unavailable.");
  }
  const result = value as { claimed?: unknown; claim_token?: unknown };
  if (result.claimed === false) return { claimed: false };
  if (result.claimed !== true || !UUID.test(String(result.claim_token))) {
    throw new Error("Stripe action claim unavailable.");
  }
  return { claimed: true, claimToken: String(result.claim_token) };
}

/** Claims one bounded checkout, portal, or refresh action for an account. */
export async function claimStripeAction(
  admin: SupabaseClient,
  userId: string,
  action: "checkout" | "portal" | "refresh",
  minimumSeconds: number,
): Promise<ActionClaim> {
  const { data, error } = await admin.rpc("claim_stripe_action", {
    p_user_id: userId,
    p_action: action,
    p_minimum_seconds: minimumSeconds,
  });
  if (error) throw new Error("Stripe action claim unavailable.");
  return parseActionClaim(data);
}

/** The private 429 response returned when a Stripe action claim is throttled. */
export function stripeActionRateLimited(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "rate_limited" },
    {
      status: 429,
      headers: {
        "Cache-Control": "private, no-store",
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

/** Finds or idempotently creates the one Stripe Customer for an account. */
export async function customerForUser(
  admin: SupabaseClient,
  stripe: Stripe,
  user: User,
  configuration: StripeBillingConfiguration,
): Promise<string> {
  const { data: existing, error: lookupError } = await admin
    .from("stripe_customers")
    .select("user_id,stripe_customer_id,livemode")
    .eq("user_id", user.id)
    .maybeSingle();
  if (lookupError) throw new Error("Stripe customer unavailable.");
  if (existing) {
    const row = existing as StripeCustomerRow;
    if (row.livemode !== configuration.livemode) {
      throw new Error("Stripe customer unavailable.");
    }
    return row.stripe_customer_id;
  }

  const customer = await stripe.customers.create(
    {
      ...(user.email ? { email: user.email } : {}),
      metadata: {
        biblequest_user_id: user.id,
        purpose: "biblequest_plus",
      },
    },
    { idempotencyKey: `biblequest-customer-${user.id}` },
  );
  if (customer.livemode !== configuration.livemode) {
    throw new Error("Stripe customer unavailable.");
  }
  const { error } = await admin.from("stripe_customers").upsert(
    {
      user_id: user.id,
      stripe_customer_id: customer.id,
      livemode: customer.livemode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_customer_id" },
  );
  if (error) throw new Error("Stripe customer unavailable.");
  return customer.id;
}

/** Resolves the application owner from the sealed Customer mapping. */
export async function userForStripeCustomer(
  admin: SupabaseClient,
  customerId: string,
  livemode: boolean,
): Promise<string | null> {
  const { data, error } = await admin
    .from("stripe_customers")
    .select("user_id,livemode")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error("Stripe customer mapping unavailable.");
  if (!data) return null;
  if (data.livemode !== livemode) {
    throw new Error("Stripe customer mapping unavailable.");
  }
  return typeof data.user_id === "string" ? data.user_id : null;
}

/** Upserts the current authoritative subscription by Stripe object ID. */
export async function synchronizeSubscription(
  admin: SupabaseClient,
  subscription: Stripe.Subscription,
  configuration: StripeBillingConfiguration,
  event?: Pick<Stripe.Event, "id" | "created">,
): Promise<void> {
  if (subscription.livemode !== configuration.livemode) {
    throw new Error("Stripe subscription mode mismatch.");
  }
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const userId = await userForStripeCustomer(
    admin,
    customerId,
    subscription.livemode,
  );
  const projection = subscriptionProjection(
    subscription,
    userId,
    configuration,
    event,
  );
  const { error } = await admin.from("subscriptions").upsert(projection, {
    onConflict: "external_subscription_id",
  });
  if (error) throw new Error("Stripe subscription projection unavailable.");
}

/** Reconciles every current Stripe subscription for one mapped customer. */
export async function refreshUserSubscriptions(
  admin: SupabaseClient,
  stripe: Stripe,
  customerId: string,
  configuration: StripeBillingConfiguration,
): Promise<number> {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  for (const subscription of subscriptions.data) {
    await synchronizeSubscription(
      admin,
      subscription,
      configuration,
    );
  }
  return subscriptions.data.length;
}

export class StripeLifetimeProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeLifetimeProjectionError";
  }
}

interface LifetimeProjectionRow {
  id: string;
  livemode: boolean;
  amount_total: number;
  amount_refunded: number;
  currency: string;
  outcome_status: string;
}

/** Projects a paid lifetime Checkout from current Stripe objects only. */
export async function synchronizeLifetimeSession(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
  paymentIntent: Stripe.PaymentIntent,
  configuration: StripeBillingConfiguration,
  event: Pick<Stripe.Event, "id" | "created">,
): Promise<boolean> {
  const customerId = stripeObjectId(session.customer);
  const paymentIntentId = stripeObjectId(session.payment_intent);
  const lineItem = session.line_items?.data[0];
  const price =
    lineItem?.price && typeof lineItem.price !== "string"
      ? lineItem.price
      : null;
  const product = price ? stripeObjectId(price.product) : null;
  const charge =
    paymentIntent.latest_charge &&
    typeof paymentIntent.latest_charge !== "string"
      ? paymentIntent.latest_charge
      : null;
  const userId = customerId
    ? await userForStripeCustomer(
        admin,
        customerId,
        configuration.livemode,
      )
    : null;
  if (
    session.mode !== "payment" ||
    session.livemode !== configuration.livemode ||
    session.status !== "complete" ||
    session.payment_status !== "paid" ||
    session.metadata?.purpose !== "biblequest_plus" ||
    session.metadata?.billing_interval !== "lifetime" ||
    session.metadata?.biblequest_user_id !== userId ||
    session.client_reference_id !== userId ||
    !userId ||
    !customerId ||
    !paymentIntentId ||
    paymentIntent.id !== paymentIntentId ||
    stripeObjectId(paymentIntent.customer) !== customerId ||
    paymentIntent.status !== "succeeded" ||
    !charge ||
    !charge.paid ||
    stripeObjectId(charge.payment_intent) !== paymentIntent.id ||
    lineItem?.quantity !== 1 ||
    session.line_items?.data.length !== 1 ||
    !price ||
    price.id !== configuration.priceIds.lifetime ||
    price.type !== "one_time" ||
    price.recurring !== null ||
    !Number.isSafeInteger(price.unit_amount) ||
    (price.unit_amount ?? 0) <= 0 ||
    product === null ||
    session.amount_total !== price.unit_amount ||
    paymentIntent.amount_received !== price.unit_amount ||
    charge.amount !== price.unit_amount ||
    session.currency !== price.currency ||
    paymentIntent.currency !== price.currency ||
    charge.currency !== price.currency ||
    charge.amount_refunded < 0 ||
    charge.amount_refunded > charge.amount
  ) {
    throw new StripeLifetimeProjectionError(
      "Stripe lifetime Checkout mismatch.",
    );
  }

  const refunded = charge.amount_refunded === charge.amount;
  const disputed = charge.disputed;
  const entitled = !refunded && !disputed;
  const now = new Date().toISOString();
  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      provider: "stripe",
      status: entitled ? "active" : "canceled",
      plan_key: entitled ? "plus" : "free",
      current_period_start: null,
      current_period_end: null,
      external_customer_id: customerId,
      external_subscription_id: null,
      stripe_price_id: price.id,
      stripe_product_id: product,
      billing_interval: "lifetime",
      currency: price.currency,
      livemode: session.livemode,
      cancel_at_period_end: false,
      canceled_at: entitled
        ? null
        : new Date(event.created * 1000).toISOString(),
      trial_end: null,
      latest_invoice_id: null,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntent.id,
      amount_total: charge.amount,
      amount_refunded: charge.amount_refunded,
      outcome_status: refunded
        ? "refunded"
        : disputed
          ? "disputed"
          : charge.amount_refunded > 0
            ? "partially_refunded"
            : "completed",
      last_stripe_event_created: event.created,
      last_stripe_event_id: event.id,
      synchronized_at: now,
      updated_at: now,
    },
    { onConflict: "stripe_checkout_session_id" },
  );
  if (error) {
    throw new Error("Stripe lifetime projection unavailable.");
  }
  return true;
}

/** Reconciles refunds and disputes against one known lifetime PaymentIntent. */
export async function synchronizeLifetimeCharge(
  admin: SupabaseClient,
  charge: Stripe.Charge,
  event: Pick<Stripe.Event, "id" | "created">,
  dispute?: Stripe.Dispute,
): Promise<boolean> {
  const paymentIntentId = stripeObjectId(charge.payment_intent);
  if (!paymentIntentId) return false;
  const { data, error } = await admin
    .from("subscriptions")
    .select(
      "id,livemode,amount_total,amount_refunded,currency,outcome_status",
    )
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (error) throw new Error("Stripe lifetime projection unavailable.");
  if (!data) return false;
  const row = data as LifetimeProjectionRow;
  if (
    charge.livemode !== row.livemode ||
    charge.currency !== row.currency ||
    charge.amount !== row.amount_total ||
    charge.amount_refunded < 0 ||
    charge.amount_refunded > row.amount_total ||
    (dispute &&
      (dispute.livemode !== row.livemode ||
        dispute.currency !== row.currency ||
        dispute.amount <= 0 ||
        dispute.amount > row.amount_total ||
        stripeObjectId(dispute.charge) !== charge.id))
  ) {
    throw new StripeLifetimeProjectionError(
      "Stripe lifetime adjustment mismatch.",
    );
  }
  const refunded = charge.amount_refunded === row.amount_total;
  const disputeOutcome = dispute
    ? dispute.status === "won"
      ? "dispute_won"
      : dispute.status === "lost"
        ? "dispute_lost"
        : "disputed"
    : null;
  const entitled =
    !refunded &&
    (!disputeOutcome || disputeOutcome === "dispute_won");
  const outcome =
    disputeOutcome ??
    (refunded
      ? "refunded"
      : charge.amount_refunded > 0
        ? "partially_refunded"
        : "completed");
  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("subscriptions")
    .update({
      status: entitled ? "active" : "canceled",
      plan_key: entitled ? "plus" : "free",
      amount_refunded: charge.amount_refunded,
      outcome_status: outcome,
      canceled_at: entitled
        ? null
        : new Date(event.created * 1000).toISOString(),
      last_stripe_event_created: event.created,
      last_stripe_event_id: event.id,
      synchronized_at: now,
      updated_at: now,
    })
    .eq("id", row.id);
  if (updateError) {
    throw new Error("Stripe lifetime projection unavailable.");
  }
  return true;
}
