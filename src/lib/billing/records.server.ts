import "server-only";

import type Stripe from "stripe";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { StripeBillingConfiguration } from "./config.server";
import { stripeObjectId } from "./stripe-object.server";
import {
  StripeSubscriptionProjectionError,
  subscriptionProjection,
  type StripeCustomerRow,
} from "./server";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STRIPE_CUSTOMER_ID = /^cus_[A-Za-z0-9]+$/;

interface ActionClaim {
  claimed: boolean;
  claimToken?: string;
}

interface ProjectionClaim {
  claimed: boolean;
  claimToken?: string;
}

const STRIPE_PROJECTION_LEASE_SECONDS = 120;

interface StripeCustomerMappingRow {
  user_id: unknown;
  stripe_customer_id: unknown;
  livemode: unknown;
}

interface BillingPortalSessionShape {
  customer: unknown;
  livemode: unknown;
  return_url: unknown;
  url: unknown;
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

function parseProjectionClaim(value: unknown): ProjectionClaim {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Stripe projection lease unavailable.");
  }
  const result = value as { claimed?: unknown; claim_token?: unknown };
  if (result.claimed === false) return { claimed: false };
  if (result.claimed !== true || !UUID.test(String(result.claim_token))) {
    throw new Error("Stripe projection lease unavailable.");
  }
  return { claimed: true, claimToken: String(result.claim_token) };
}

/** Serializes one final provider rehydrate and projection across instances. */
export async function withStripeProjectionLease<T>(
  admin: SupabaseClient,
  projectionKey: `subscription:${string}` | `lifetime:${string}`,
  work: (claimToken: string) => Promise<T>,
): Promise<T> {
  const { data, error } = await admin.rpc("claim_stripe_projection", {
    p_projection_key: projectionKey,
    p_lease_seconds: STRIPE_PROJECTION_LEASE_SECONDS,
  });
  if (error) throw new Error("Stripe projection lease unavailable.");
  const claim = parseProjectionClaim(data);
  if (!claim.claimed || !claim.claimToken) {
    throw new Error("Stripe projection lease unavailable.");
  }

  try {
    return await work(claim.claimToken);
  } finally {
    const { data: released, error: releaseError } = await admin.rpc(
      "release_stripe_projection",
      {
        p_projection_key: projectionKey,
        p_claim_token: claim.claimToken,
      },
    );
    if (releaseError || released !== true) {
      throw new Error("Stripe projection lease unavailable.");
    }
  }
}

/** Commits only while the claim token still owns the provider-key lease. */
async function commitStripeProjection(
  admin: SupabaseClient,
  projectionKey: `subscription:${string}` | `lifetime:${string}`,
  claimToken: string,
  projection: Record<string, unknown>,
  identityError: () => Error,
): Promise<void> {
  const { data, error } = await admin.rpc("commit_stripe_projection", {
    p_projection_key: projectionKey,
    p_claim_token: claimToken,
    p_projection: projection,
  });
  if (error) throw new Error("Stripe projection commit unavailable.");
  if (data === "identity_mismatch") throw identityError();
  if (data !== "committed") {
    throw new Error("Stripe projection lease unavailable.");
  }
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

/** Proves that one sealed mapping still belongs to the verified account. */
function mappedCustomerId(
  value: unknown,
  userId: string,
  livemode: boolean,
  expectedCustomerId?: string,
): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Stripe customer unavailable.");
  }
  const row = value as StripeCustomerRow;
  if (
    row.user_id !== userId ||
    row.livemode !== livemode ||
    !STRIPE_CUSTOMER_ID.test(row.stripe_customer_id) ||
    (expectedCustomerId !== undefined &&
      row.stripe_customer_id !== expectedCustomerId)
  ) {
    throw new Error("Stripe customer unavailable.");
  }
  return row.stripe_customer_id;
}

/** Resolves only the current owner's sealed, mode-matched Customer mapping. */
export async function mappedStripeCustomerForUser(
  admin: SupabaseClient,
  userId: string,
  livemode: boolean,
): Promise<string | null> {
  const { data, error } = await admin
    .from("stripe_customers")
    .select("user_id,stripe_customer_id,livemode")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Stripe customer mapping unavailable.");
  if (!data) return null;

  const mapping = data as StripeCustomerMappingRow;
  if (
    mapping.user_id !== userId ||
    mapping.livemode !== livemode ||
    typeof mapping.stripe_customer_id !== "string" ||
    !/^cus_[A-Za-z0-9]+$/.test(mapping.stripe_customer_id)
  ) {
    throw new Error("Stripe customer mapping unavailable.");
  }
  return mapping.stripe_customer_id;
}

/** Accepts a Portal URL only when Stripe echoes the complete server contract. */
export function stripeBillingPortalUrl(
  session: BillingPortalSessionShape,
  expected: {
    customerId: string;
    livemode: boolean;
    returnUrl: string;
  },
): string | null {
  if (
    session.customer !== expected.customerId ||
    session.livemode !== expected.livemode ||
    session.return_url !== expected.returnUrl ||
    typeof session.url !== "string"
  ) {
    return null;
  }
  try {
    const destination = new URL(session.url);
    if (
      destination.origin !== "https://billing.stripe.com" ||
      destination.username ||
      destination.password
    ) {
      return null;
    }
    return destination.toString();
  } catch {
    return null;
  }
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
    return mappedCustomerId(
      existing,
      user.id,
      configuration.livemode,
    );
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
  if (
    customer.livemode !== configuration.livemode ||
    !STRIPE_CUSTOMER_ID.test(customer.id)
  ) {
    throw new Error("Stripe customer unavailable.");
  }
  // Insert-only ownership prevents an unexpected conflicting Customer ID from
  // reassigning another account through an upsert conflict update.
  const { error } = await admin.from("stripe_customers").insert(
    {
      user_id: user.id,
      stripe_customer_id: customer.id,
      livemode: customer.livemode,
      updated_at: new Date().toISOString(),
    },
  );
  if (error) {
    // An ambiguous insert or concurrent retry may already have committed the
    // same idempotent Customer; only that exact owner/mode/ID is reusable.
    const { data: concurrent, error: concurrentLookupError } = await admin
      .from("stripe_customers")
      .select("user_id,stripe_customer_id,livemode")
      .eq("user_id", user.id)
      .maybeSingle();
    if (concurrentLookupError) {
      throw new Error("Stripe customer unavailable.");
    }
    return mappedCustomerId(
      concurrent,
      user.id,
      configuration.livemode,
      customer.id,
    );
  }
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
  claimToken: string,
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
  const { data: existing, error: existingError } = await admin
    .from("subscriptions")
    .select("user_id,external_customer_id,livemode")
    .eq("external_subscription_id", subscription.id)
    .maybeSingle();
  if (existingError) {
    throw new Error("Stripe subscription projection unavailable.");
  }
  if (
    existing &&
    (existing.user_id !== userId ||
      existing.external_customer_id !== customerId ||
      existing.livemode !== subscription.livemode)
  ) {
    throw new StripeSubscriptionProjectionError();
  }
  await commitStripeProjection(
    admin,
    `subscription:${subscription.id}`,
    claimToken,
    projection,
    () => new StripeSubscriptionProjectionError(),
  );
}

/** Rehydrates and projects one subscription while its provider key is leased. */
export async function synchronizeCurrentSubscription(
  admin: SupabaseClient,
  stripe: Stripe,
  subscriptionId: string,
  configuration: StripeBillingConfiguration,
  event?: Pick<Stripe.Event, "id" | "created">,
): Promise<void> {
  await withStripeProjectionLease(
    admin,
    `subscription:${subscriptionId}`,
    async (claimToken) => {
      const subscription = await stripe.subscriptions.retrieve(
        subscriptionId,
        { expand: ["items.data.price.product", "latest_invoice"] },
      );
      if ("deleted" in subscription && subscription.deleted) {
        throw new StripeSubscriptionProjectionError();
      }
      await synchronizeSubscription(
        admin,
        subscription,
        configuration,
        claimToken,
        event,
      );
    },
  );
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
  if (subscriptions.has_more) {
    throw new Error("Stripe subscription projection unavailable.");
  }
  for (const subscription of subscriptions.data) {
    await synchronizeCurrentSubscription(
      admin,
      stripe,
      subscription.id,
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
  user_id: string | null;
  livemode: boolean;
  external_customer_id: string;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string;
  amount_total: number;
  amount_refunded: number;
  currency: string;
  outcome_status: string;
}

export interface StripeDisputeSnapshot {
  data: Stripe.Dispute[];
  hasMore: boolean;
}

type LifetimeOutcome = {
  entitled: boolean;
  outcomeStatus:
    | "completed"
    | "partially_refunded"
    | "refunded"
    | "disputed"
    | "dispute_won"
    | "dispute_lost";
  disputeStatus: "won" | "lost" | "open" | "unknown" | "truncated" | null;
};

/** Folds every bounded current dispute so one stale event cannot re-grant. */
function lifetimeOutcome(
  charge: Stripe.Charge,
  snapshot: StripeDisputeSnapshot,
): LifetimeOutcome {
  if (snapshot.data.length > 100) {
    throw new StripeLifetimeProjectionError(
      "Stripe lifetime dispute set unavailable.",
    );
  }
  for (const dispute of snapshot.data) {
    if (
      dispute.livemode !== charge.livemode ||
      stripeObjectId(dispute.charge) !== charge.id ||
      dispute.currency !== charge.currency ||
      !Number.isSafeInteger(dispute.amount) ||
      dispute.amount <= 0 ||
      dispute.amount > charge.amount ||
      (stripeObjectId(dispute.payment_intent) !== null &&
        stripeObjectId(dispute.payment_intent) !==
          stripeObjectId(charge.payment_intent))
    ) {
      throw new StripeLifetimeProjectionError(
        "Stripe lifetime dispute mismatch.",
      );
    }
  }

  const refunded = charge.amount_refunded === charge.amount;
  const lost = snapshot.data.some((dispute) => dispute.status === "lost");
  const allWon =
    snapshot.data.length > 0 &&
    snapshot.data.every((dispute) => dispute.status === "won");
  const unknown = snapshot.data.length === 0 && charge.disputed;
  const denied = snapshot.hasMore || lost || unknown ||
    (snapshot.data.length > 0 && !allWon);
  return {
    entitled: !refunded && !denied,
    outcomeStatus: refunded
      ? "refunded"
      : snapshot.hasMore || unknown || (snapshot.data.length > 0 && !allWon)
        ? lost
          ? "dispute_lost"
          : "disputed"
        : allWon
          ? "dispute_won"
          : charge.amount_refunded > 0
            ? "partially_refunded"
            : "completed",
    disputeStatus: snapshot.hasMore
      ? "truncated"
      : unknown
        ? "unknown"
        : lost
          ? "lost"
          : allWon
            ? "won"
            : snapshot.data.length > 0
              ? "open"
              : null,
  };
}

/** Checks lifetime routing only after the canonical PaymentIntent is leased. */
export async function hasProjectedLifetimePayment(
  admin: SupabaseClient,
  paymentIntentId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("subscriptions")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (error) throw new Error("Stripe lifetime projection unavailable.");
  return data !== null;
}

/** Projects a paid lifetime Checkout from current Stripe objects only. */
export async function synchronizeLifetimeSession(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
  paymentIntent: Stripe.PaymentIntent,
  disputes: StripeDisputeSnapshot,
  configuration: StripeBillingConfiguration,
  event: Pick<Stripe.Event, "id" | "created">,
  claimToken: string,
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
    paymentIntent.livemode !== configuration.livemode ||
    stripeObjectId(paymentIntent.customer) !== customerId ||
    paymentIntent.metadata?.purpose !== "biblequest_plus" ||
    paymentIntent.metadata?.billing_interval !== "lifetime" ||
    paymentIntent.metadata?.biblequest_user_id !== userId ||
    paymentIntent.status !== "succeeded" ||
    !charge ||
    charge.livemode !== configuration.livemode ||
    !charge.paid ||
    stripeObjectId(charge.customer) !== customerId ||
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

  const outcome = lifetimeOutcome(charge, disputes);
  const entitled = outcome.entitled;
  const now = new Date().toISOString();
  const projection = {
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
    outcome_status: outcome.outcomeStatus,
    dispute_status: outcome.disputeStatus,
    last_stripe_event_created: event.created,
    last_stripe_event_id: event.id,
    synchronized_at: now,
    updated_at: now,
  };
  const { data: existing, error: existingError } = await admin
    .from("subscriptions")
    .select(
      "id,user_id,livemode,external_customer_id,stripe_checkout_session_id,stripe_payment_intent_id,amount_total,amount_refunded,currency,outcome_status",
    )
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .maybeSingle();
  if (existingError) {
    throw new Error("Stripe lifetime projection unavailable.");
  }
  if (
    existing &&
    (existing.user_id !== userId ||
      existing.livemode !== session.livemode ||
      existing.external_customer_id !== customerId ||
      existing.stripe_checkout_session_id !== session.id ||
      existing.stripe_payment_intent_id !== paymentIntent.id ||
      existing.amount_total !== charge.amount ||
      existing.currency !== price.currency)
  ) {
    throw new StripeLifetimeProjectionError(
      "Stripe lifetime identity mismatch.",
    );
  }
  await commitStripeProjection(
    admin,
    `lifetime:${paymentIntent.id}`,
    claimToken,
    projection,
    () =>
      new StripeLifetimeProjectionError(
        "Stripe lifetime identity mismatch.",
      ),
  );
  return true;
}

/** Reconciles refunds and disputes against one known lifetime PaymentIntent. */
export async function synchronizeLifetimeCharge(
  admin: SupabaseClient,
  charge: Stripe.Charge,
  event: Pick<Stripe.Event, "id" | "created">,
  disputes: StripeDisputeSnapshot,
  claimToken: string,
): Promise<boolean> {
  const paymentIntentId = stripeObjectId(charge.payment_intent);
  if (!paymentIntentId) return false;
  const { data, error } = await admin
    .from("subscriptions")
    .select(
      "id,user_id,livemode,external_customer_id,stripe_checkout_session_id,stripe_payment_intent_id,amount_total,amount_refunded,currency,outcome_status",
    )
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (error) throw new Error("Stripe lifetime projection unavailable.");
  if (!data) return false;
  const row = data as LifetimeProjectionRow;
  const mappedUserId = await userForStripeCustomer(
    admin,
    row.external_customer_id,
    row.livemode,
  );
  if (
    !charge.paid ||
    charge.livemode !== row.livemode ||
    stripeObjectId(charge.customer) !== row.external_customer_id ||
    mappedUserId !== row.user_id ||
    paymentIntentId !== row.stripe_payment_intent_id ||
    charge.currency !== row.currency ||
    charge.amount !== row.amount_total ||
    charge.amount_refunded < 0 ||
    charge.amount_refunded > row.amount_total
  ) {
    throw new StripeLifetimeProjectionError(
      "Stripe lifetime adjustment mismatch.",
    );
  }
  const outcome = lifetimeOutcome(charge, disputes);
  const entitled = outcome.entitled;
  const now = new Date().toISOString();
  await commitStripeProjection(
    admin,
    `lifetime:${paymentIntentId}`,
    claimToken,
    {
      ...row,
      status: entitled ? "active" : "canceled",
      plan_key: entitled ? "plus" : "free",
      provider: "stripe",
      billing_interval: "lifetime",
      amount_refunded: charge.amount_refunded,
      outcome_status: outcome.outcomeStatus,
      dispute_status: outcome.disputeStatus,
      canceled_at: entitled
        ? null
        : new Date(event.created * 1000).toISOString(),
      last_stripe_event_created: event.created,
      last_stripe_event_id: event.id,
      synchronized_at: now,
      updated_at: now,
    },
    () =>
      new StripeLifetimeProjectionError(
        "Stripe lifetime identity mismatch.",
      ),
  );
  return true;
}
