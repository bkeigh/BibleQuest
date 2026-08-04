import "server-only";

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StripeBillingConfiguration } from "./config.server";
import {
  synchronizeLifetimeCharge,
  synchronizeLifetimeSession,
  synchronizeSubscription,
} from "./records.server";
import {
  synchronizeSupportDispute,
  synchronizeSupportRefund,
  synchronizeSupportSession,
} from "@/lib/support/records.server";
import {
  synchronizeArcadeCharge,
  synchronizeArcadeSession,
} from "@/lib/games/arcade/records.server";

const HANDLED_SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.trial_will_end",
]);
const HANDLED_INVOICE_EVENTS = new Set([
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.finalization_failed",
]);
const HANDLED_CHECKOUT_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);
const HANDLED_REFUND_EVENTS = new Set([
  "refund.created",
  "refund.updated",
  "refund.failed",
]);
const HANDLED_DISPUTE_EVENTS = new Set([
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
]);

export class StripeWebhookProcessingError extends Error {
  constructor(
    readonly category: "provider" | "database" | "invalid",
  ) {
    super("Stripe webhook processing failed.");
    this.name = "StripeWebhookProcessingError";
  }
}

function id(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return id(invoice.parent?.subscription_details?.subscription ?? null);
}

async function currentSubscription(
  stripe: Stripe,
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price.product", "latest_invoice"],
  });
  if ("deleted" in subscription && subscription.deleted) {
    throw new StripeWebhookProcessingError("invalid");
  }
  return subscription;
}

async function reconcileSubscriptionId(
  admin: SupabaseClient,
  stripe: Stripe,
  configuration: StripeBillingConfiguration,
  event: Stripe.Event,
  subscriptionId: string | null,
): Promise<void> {
  if (!subscriptionId) return;
  const subscription = await currentSubscription(stripe, subscriptionId);
  await synchronizeSubscription(admin, subscription, configuration, event);
}

async function storeBillingSignal(
  admin: SupabaseClient,
  values: {
    event_id: string;
    signal_kind:
      | "invoice_paid"
      | "invoice_payment_failed"
      | "refund"
      | "dispute";
    stripe_object_id: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    status: string | null;
    amount: number | null;
    currency: string | null;
    occurred_at: string;
  },
): Promise<void> {
  const { error } = await admin
    .from("stripe_billing_signals")
    .upsert(values, { onConflict: "event_id" });
  if (error) throw new StripeWebhookProcessingError("database");
}

/** Resolves current invoice/subscription context through the dahlia payment link. */
async function subscriptionContextFromCharge(
  stripe: Stripe,
  charge: Stripe.Charge,
): Promise<{ customerId: string | null; subscriptionId: string | null }> {
  const paymentIntentId = id(charge.payment_intent);
  if (!paymentIntentId) {
    return { customerId: id(charge.customer), subscriptionId: null };
  }
  const payments = await stripe.invoicePayments.list({
    payment: {
      type: "payment_intent",
      payment_intent: paymentIntentId,
    },
    limit: 1,
  });
  const invoiceId = id(payments.data[0]?.invoice ?? null);
  if (!invoiceId) {
    return { customerId: id(charge.customer), subscriptionId: null };
  }
  const invoice = await stripe.invoices.retrieve(invoiceId);
  return {
    customerId: id(charge.customer),
    subscriptionId: invoiceSubscriptionId(invoice),
  };
}

/** Reads only immutable support routing metadata from the current intent. */
async function supportRequestIdFromCharge(
  stripe: Stripe,
  charge: Stripe.Charge,
): Promise<string | null> {
  const paymentIntentId = id(charge.payment_intent);
  if (!paymentIntentId) return null;
  const paymentIntent =
    await stripe.paymentIntents.retrieve(paymentIntentId);
  if (paymentIntent.metadata?.purpose !== "biblequest_support") {
    return null;
  }
  return paymentIntent.metadata.support_request_id ?? null;
}

async function processInvoice(
  admin: SupabaseClient,
  stripe: Stripe,
  configuration: StripeBillingConfiguration,
  event: Stripe.Event,
): Promise<void> {
  const eventInvoice = event.data.object as Stripe.Invoice;
  const invoice = await stripe.invoices.retrieve(eventInvoice.id);
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    await storeBillingSignal(admin, {
      event_id: event.id,
      signal_kind:
        event.type === "invoice.paid"
          ? "invoice_paid"
          : "invoice_payment_failed",
      stripe_object_id: invoice.id,
      stripe_customer_id: id(invoice.customer),
      stripe_subscription_id: subscriptionId,
      status: invoice.status,
      amount:
        event.type === "invoice.paid"
          ? invoice.amount_paid
          : invoice.amount_due,
      currency: invoice.currency,
      occurred_at: new Date(event.created * 1000).toISOString(),
    });
  }
  await reconcileSubscriptionId(
    admin,
    stripe,
    configuration,
    event,
    subscriptionId,
  );
}

async function processCheckout(
  admin: SupabaseClient,
  stripe: Stripe,
  configuration: StripeBillingConfiguration,
  event: Stripe.Event,
): Promise<void> {
  const eventSession = event.data.object as Stripe.Checkout.Session;
  const session = await stripe.checkout.sessions.retrieve(eventSession.id, {
    expand: ["line_items.data.price.product"],
  });
  if (
    session.mode === "payment" &&
    session.metadata?.purpose === "biblequest_support"
  ) {
    await synchronizeSupportSession(admin, session, event);
    return;
  }
  if (
    session.mode === "payment" &&
    session.metadata?.purpose === "biblequest_arcade"
  ) {
    // Expired and failed sessions are acknowledged but never fulfilled.
    if (session.status !== "complete" || session.payment_status !== "paid") {
      return;
    }
    const paymentIntentId = id(session.payment_intent);
    if (!paymentIntentId) {
      throw new StripeWebhookProcessingError("invalid");
    }
    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      { expand: ["latest_charge"] },
    );
    await synchronizeArcadeSession(
      admin,
      session,
      paymentIntent,
      configuration,
      event,
    );
    return;
  }
  if (
    session.mode === "payment" &&
    session.metadata?.purpose === "biblequest_plus" &&
    session.metadata?.billing_interval === "lifetime"
  ) {
    const paymentIntentId = id(session.payment_intent);
    if (!paymentIntentId) {
      throw new StripeWebhookProcessingError("invalid");
    }
    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      { expand: ["latest_charge"] },
    );
    await synchronizeLifetimeSession(
      admin,
      session,
      paymentIntent,
      configuration,
      event,
    );
    return;
  }
  if (session.mode !== "subscription") return;
  await reconcileSubscriptionId(
    admin,
    stripe,
    configuration,
    event,
    id(session.subscription),
  );
}

async function processRefund(
  admin: SupabaseClient,
  stripe: Stripe,
  configuration: StripeBillingConfiguration,
  event: Stripe.Event,
): Promise<void> {
  const eventRefund = event.data.object as Stripe.Refund;
  const refund = await stripe.refunds.retrieve(eventRefund.id);
  const chargeId = id(refund.charge);
  let customerId: string | null = null;
  let subscriptionId: string | null = null;
  let currentCharge: Stripe.Charge | null = null;
  if (chargeId) {
    currentCharge = await stripe.charges.retrieve(chargeId);
    customerId = id(currentCharge.customer);
    // A known one-time payment has no invoice, so skip the unrelated lookup.
    const lifetimePayment = await synchronizeLifetimeCharge(
      admin,
      currentCharge,
      event,
    );
    const arcadePayment = lifetimePayment
      ? false
      : await synchronizeArcadeCharge(admin, currentCharge, event);
    const supportPayment = lifetimePayment || arcadePayment
      ? false
      : await synchronizeSupportRefund(
          admin,
          currentCharge,
          event,
        );
    const recoveredSupportPayment =
      !lifetimePayment && !arcadePayment && !supportPayment
        ? await synchronizeSupportRefund(
            admin,
            currentCharge,
            event,
            await supportRequestIdFromCharge(stripe, currentCharge),
          )
        : supportPayment;
    if (!lifetimePayment && !arcadePayment && !recoveredSupportPayment) {
      const context = await subscriptionContextFromCharge(
        stripe,
        currentCharge,
      );
      customerId = context.customerId;
      subscriptionId = context.subscriptionId;
    }
  }
  await storeBillingSignal(admin, {
    event_id: event.id,
    signal_kind: "refund",
    stripe_object_id: refund.id,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    status: refund.status,
    amount: refund.amount,
    currency: refund.currency,
    occurred_at: new Date(event.created * 1000).toISOString(),
  });
  await reconcileSubscriptionId(
    admin,
    stripe,
    configuration,
    event,
    subscriptionId,
  );
}

async function processDispute(
  admin: SupabaseClient,
  stripe: Stripe,
  configuration: StripeBillingConfiguration,
  event: Stripe.Event,
): Promise<void> {
  const eventDispute = event.data.object as Stripe.Dispute;
  const dispute = await stripe.disputes.retrieve(eventDispute.id);
  const chargeId = id(dispute.charge);
  let customerId: string | null = null;
  let subscriptionId: string | null = null;
  let currentCharge: Stripe.Charge | null = null;
  if (chargeId) {
    currentCharge = await stripe.charges.retrieve(chargeId);
    customerId = id(currentCharge.customer);
    // A known one-time payment has no invoice, so skip the unrelated lookup.
    const lifetimePayment = await synchronizeLifetimeCharge(
      admin,
      currentCharge,
      event,
      dispute,
    );
    const arcadePayment = lifetimePayment
      ? false
      : await synchronizeArcadeCharge(
          admin,
          currentCharge,
          event,
          dispute,
        );
    const supportPayment = lifetimePayment || arcadePayment
      ? false
      : await synchronizeSupportDispute(
          admin,
          currentCharge,
          dispute,
          event,
        );
    const recoveredSupportPayment =
      !lifetimePayment && !arcadePayment && !supportPayment
        ? await synchronizeSupportDispute(
            admin,
            currentCharge,
            dispute,
            event,
            await supportRequestIdFromCharge(stripe, currentCharge),
          )
        : supportPayment;
    if (!lifetimePayment && !arcadePayment && !recoveredSupportPayment) {
      const context = await subscriptionContextFromCharge(
        stripe,
        currentCharge,
      );
      customerId = context.customerId;
      subscriptionId = context.subscriptionId;
    }
  }
  await storeBillingSignal(admin, {
    event_id: event.id,
    signal_kind: "dispute",
    stripe_object_id: dispute.id,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    status: dispute.status,
    amount: dispute.amount,
    currency: dispute.currency,
    occurred_at: new Date(event.created * 1000).toISOString(),
  });
  await reconcileSubscriptionId(
    admin,
    stripe,
    configuration,
    event,
    subscriptionId,
  );
}

/** Retrieves current Stripe objects so event delivery order cannot grant access. */
export async function processStripeWebhookEvent(
  admin: SupabaseClient,
  stripe: Stripe,
  configuration: StripeBillingConfiguration,
  event: Stripe.Event,
): Promise<"processed" | "ignored"> {
  if (event.livemode !== configuration.livemode) {
    throw new StripeWebhookProcessingError("invalid");
  }
  try {
    if (HANDLED_SUBSCRIPTION_EVENTS.has(event.type)) {
      const object = event.data.object as Stripe.Subscription;
      await reconcileSubscriptionId(
        admin,
        stripe,
        configuration,
        event,
        object.id,
      );
      return "processed";
    }
    if (HANDLED_INVOICE_EVENTS.has(event.type)) {
      await processInvoice(admin, stripe, configuration, event);
      return "processed";
    }
    if (HANDLED_CHECKOUT_EVENTS.has(event.type)) {
      await processCheckout(admin, stripe, configuration, event);
      return "processed";
    }
    if (HANDLED_REFUND_EVENTS.has(event.type)) {
      await processRefund(admin, stripe, configuration, event);
      return "processed";
    }
    if (HANDLED_DISPUTE_EVENTS.has(event.type)) {
      await processDispute(admin, stripe, configuration, event);
      return "processed";
    }
    return "ignored";
  } catch (error) {
    if (error instanceof StripeWebhookProcessingError) throw error;
    if (
      error instanceof Error &&
      (
        error.name === "StripeSupportProjectionError" ||
        error.name === "StripeLifetimeProjectionError" ||
        error.name === "StripeArcadeProjectionError"
      )
    ) {
      throw new StripeWebhookProcessingError("invalid");
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      typeof error.type === "string" &&
      error.type.startsWith("Stripe")
    ) {
      throw new StripeWebhookProcessingError("provider");
    }
    throw new StripeWebhookProcessingError("database");
  }
}
