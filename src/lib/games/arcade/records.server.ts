import "server-only";

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StripeBillingConfiguration } from "@/lib/billing/config.server";
import { userForStripeCustomer } from "@/lib/billing/records.server";
import { stripeObjectId } from "@/lib/billing/stripe-object.server";
import {
  arcadeProduct,
  isArcadeProductId,
  type ArcadeProductId,
} from "./store";

export class StripeArcadeProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeArcadeProjectionError";
  }
}

/** Maps one fixed product key to its independently configured Stripe Price. */
export function arcadePriceId(
  configuration: StripeBillingConfiguration,
  productId: ArcadeProductId,
): string | null {
  const prices = configuration.arcadePriceIds;
  if (!prices) return null;
  return productId === "question-skip"
    ? prices.questionSkip
    : prices.gamePass;
}

/** Projects one paid, fully rehydrated Checkout into an idempotent order. */
export async function synchronizeArcadeSession(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
  paymentIntent: Stripe.PaymentIntent,
  configuration: StripeBillingConfiguration,
  event: Pick<Stripe.Event, "id" | "created">,
): Promise<boolean> {
  const productKey = session.metadata?.arcade_product;
  if (!isArcadeProductId(productKey)) {
    throw new StripeArcadeProjectionError("Stripe arcade product mismatch.");
  }
  const expected = arcadeProduct(productKey);
  const expectedPriceId = arcadePriceId(configuration, productKey);
  const customerId = stripeObjectId(session.customer);
  const paymentIntentId = stripeObjectId(session.payment_intent);
  const lineItem = session.line_items?.data[0];
  const price =
    lineItem?.price && typeof lineItem.price !== "string"
      ? lineItem.price
      : null;
  const stripeProductId = price ? stripeObjectId(price.product) : null;
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
    session.metadata?.purpose !== "biblequest_arcade" ||
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
    session.line_items?.data.length !== 1 ||
    lineItem?.quantity !== 1 ||
    !price ||
    !expectedPriceId ||
    price.id !== expectedPriceId ||
    price.type !== "one_time" ||
    price.recurring !== null ||
    price.unit_amount !== expected.unitAmount ||
    price.currency !== "usd" ||
    !stripeProductId ||
    session.amount_total !== expected.unitAmount ||
    paymentIntent.amount_received !== expected.unitAmount ||
    charge.amount !== expected.unitAmount ||
    session.currency !== "usd" ||
    paymentIntent.currency !== "usd" ||
    charge.currency !== "usd" ||
    charge.amount_refunded < 0 ||
    charge.amount_refunded > charge.amount
  ) {
    throw new StripeArcadeProjectionError("Stripe arcade Checkout mismatch.");
  }

  const refunded = charge.amount_refunded === charge.amount;
  const outcome = refunded
    ? "refunded"
    : charge.disputed
      ? "disputed"
      : charge.amount_refunded > 0
        ? "partially_refunded"
        : "completed";
  const { error } = await admin.from("arcade_orders").upsert(
    {
      user_id: userId,
      product_key: productKey,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_customer_id: customerId,
      stripe_price_id: price.id,
      stripe_product_id: stripeProductId,
      livemode: session.livemode,
      currency: "usd",
      amount_total: charge.amount,
      amount_refunded: charge.amount_refunded,
      outcome_status: outcome,
      last_stripe_event_created: event.created,
      last_stripe_event_id: event.id,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "stripe_checkout_session_id",
      ignoreDuplicates: true,
    },
  );
  if (error) throw new Error("Stripe arcade projection unavailable.");
  return true;
}

/** Reconciles a current Charge against a known arcade PaymentIntent. */
export async function synchronizeArcadeCharge(
  admin: SupabaseClient,
  charge: Stripe.Charge,
  event: Pick<Stripe.Event, "id" | "created">,
  dispute?: Stripe.Dispute,
): Promise<boolean> {
  const paymentIntentId = stripeObjectId(charge.payment_intent);
  if (!paymentIntentId) return false;
  const { data, error } = await admin
    .from("arcade_orders")
    .select(
      "id,livemode,currency,amount_total,last_stripe_event_created",
    )
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (error) throw new Error("Stripe arcade projection unavailable.");
  if (!data) return false;
  if (
    charge.livemode !== data.livemode ||
    charge.currency !== data.currency ||
    charge.amount !== data.amount_total ||
    charge.amount_refunded < 0 ||
    charge.amount_refunded > data.amount_total ||
    (dispute &&
      (dispute.livemode !== data.livemode ||
        dispute.currency !== data.currency ||
        dispute.amount <= 0 ||
        dispute.amount > data.amount_total ||
        stripeObjectId(dispute.charge) !== charge.id))
  ) {
    throw new StripeArcadeProjectionError("Stripe arcade adjustment mismatch.");
  }

  const disputeOutcome = dispute
    ? dispute.status === "won"
      ? "dispute_won"
      : dispute.status === "lost"
        ? "dispute_lost"
        : "disputed"
    : null;
  const outcome =
    disputeOutcome ??
    (charge.amount_refunded === data.amount_total
      ? "refunded"
      : charge.amount_refunded > 0
        ? "partially_refunded"
        : "completed");
  const { error: updateError } = await admin
    .from("arcade_orders")
    .update({
      amount_refunded: charge.amount_refunded,
      outcome_status: outcome,
      last_stripe_event_created: event.created,
      last_stripe_event_id: event.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id)
    .lte("last_stripe_event_created", event.created);
  if (updateError) throw new Error("Stripe arcade projection unavailable.");
  return true;
}
