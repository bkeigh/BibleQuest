import "server-only";

/**
 * Reconciles Stripe events into BibleQuest's provider-neutral billing rows.
 * Event payloads identify the object to refresh; current Stripe objects remain
 * authoritative so duplicate, delayed, or out-of-order webhooks are harmless.
 */
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StripeBillingConfiguration } from "./config.server";
import { stripeObjectId } from "./stripe-object.server";
import {
  hasProjectedLifetimePayment,
  synchronizeCurrentSubscription,
  synchronizeLifetimeCharge,
  synchronizeLifetimeSession,
  withStripeProjectionLease,
  type StripeDisputeSnapshot,
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
  "invoice.payment_succeeded",
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
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
]);

export class StripeWebhookProcessingError extends Error {
  constructor(
    readonly category: "provider" | "database" | "invalid",
  ) {
    super("Stripe webhook processing failed.");
    this.name = "StripeWebhookProcessingError";
  }
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return stripeObjectId(invoice.parent?.subscription_details?.subscription ?? null);
}

async function reconcileSubscriptionId(
  admin: SupabaseClient,
  stripe: Stripe,
  configuration: StripeBillingConfiguration,
  event: Stripe.Event,
  subscriptionId: string | null,
): Promise<void> {
  if (!subscriptionId) return;
  await synchronizeCurrentSubscription(
    admin,
    stripe,
    subscriptionId,
    configuration,
    event,
  );
}

/** Retrieves a bounded complete dispute set for one current Charge. */
async function currentDisputes(
  stripe: Stripe,
  chargeId: string,
): Promise<StripeDisputeSnapshot> {
  const disputes = await stripe.disputes.list({ charge: chargeId, limit: 100 });
  return { data: disputes.data, hasMore: disputes.has_more };
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
  const paymentIntentId = stripeObjectId(charge.payment_intent);
  if (!paymentIntentId) {
    return { customerId: stripeObjectId(charge.customer), subscriptionId: null };
  }
  const payments = await stripe.invoicePayments.list({
    payment: {
      type: "payment_intent",
      payment_intent: paymentIntentId,
    },
    limit: 1,
  });
  const invoiceId = stripeObjectId(payments.data[0]?.invoice ?? null);
  if (!invoiceId) {
    return { customerId: stripeObjectId(charge.customer), subscriptionId: null };
  }
  const invoice = await stripe.invoices.retrieve(invoiceId);
  return {
    customerId: stripeObjectId(charge.customer),
    subscriptionId: invoiceSubscriptionId(invoice),
  };
}

/** Reads only immutable support routing metadata from the current intent. */
async function supportRequestIdFromCharge(
  stripe: Stripe,
  charge: Stripe.Charge,
): Promise<string | null> {
  const paymentIntentId = stripeObjectId(charge.payment_intent);
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
  if (invoice.livemode !== configuration.livemode) {
    throw new StripeWebhookProcessingError("invalid");
  }
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (
    event.type === "invoice.paid" ||
    event.type === "invoice.payment_succeeded" ||
    event.type === "invoice.payment_failed"
  ) {
    await storeBillingSignal(admin, {
      event_id: event.id,
      signal_kind:
        event.type === "invoice.paid" ||
        event.type === "invoice.payment_succeeded"
          ? "invoice_paid"
          : "invoice_payment_failed",
      stripe_object_id: invoice.id,
      stripe_customer_id: stripeObjectId(invoice.customer),
      stripe_subscription_id: subscriptionId,
      status: invoice.status,
      amount:
        event.type === "invoice.paid" ||
        event.type === "invoice.payment_succeeded"
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
  if (session.livemode !== configuration.livemode) {
    throw new StripeWebhookProcessingError("invalid");
  }
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
    const paymentIntentId = stripeObjectId(session.payment_intent);
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
    // Expired, failed, and delayed unpaid sessions are terminal no-grant
    // states; a later async success event performs the authoritative grant.
    if (session.status !== "complete" || session.payment_status !== "paid") {
      return;
    }
    const paymentIntentId = stripeObjectId(session.payment_intent);
    if (!paymentIntentId) {
      throw new StripeWebhookProcessingError("invalid");
    }
    await withStripeProjectionLease(
      admin,
      `lifetime:${paymentIntentId}`,
      async (claimToken) => {
        // Re-read every fulfillment object after acquiring the canonical
        // PaymentIntent lease so concurrent adjustment events cannot race it.
        const currentSession = await stripe.checkout.sessions.retrieve(
          eventSession.id,
          { expand: ["line_items.data.price.product"] },
        );
        if (
          currentSession.status !== "complete" ||
          currentSession.payment_status !== "paid"
        ) {
          return;
        }
        if (
          currentSession.livemode !== configuration.livemode ||
          stripeObjectId(currentSession.payment_intent) !== paymentIntentId
        ) {
          throw new StripeWebhookProcessingError("invalid");
        }
        const paymentIntent = await stripe.paymentIntents.retrieve(
          paymentIntentId,
          { expand: ["latest_charge"] },
        );
        const charge =
          paymentIntent.latest_charge &&
          typeof paymentIntent.latest_charge !== "string"
            ? paymentIntent.latest_charge
            : null;
        if (!charge) throw new StripeWebhookProcessingError("invalid");
        const disputes = await currentDisputes(stripe, charge.id);
        await synchronizeLifetimeSession(
          admin,
          currentSession,
          paymentIntent,
          disputes,
          configuration,
          event,
          claimToken,
        );
      },
    );
    return;
  }
  if (session.mode !== "subscription") return;
  await reconcileSubscriptionId(
    admin,
    stripe,
    configuration,
    event,
    stripeObjectId(session.subscription),
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
  const chargeId = stripeObjectId(refund.charge);
  let customerId: string | null = null;
  let subscriptionId: string | null = null;
  let currentCharge: Stripe.Charge | null = null;
  if (chargeId) {
    currentCharge = await stripe.charges.retrieve(chargeId);
    if (currentCharge.livemode !== configuration.livemode) {
      throw new StripeWebhookProcessingError("invalid");
    }
    customerId = stripeObjectId(currentCharge.customer);
    const paymentIntentId = stripeObjectId(currentCharge.payment_intent);
    let lifetimePayment = false;
    if (paymentIntentId) {
      await withStripeProjectionLease(
        admin,
        `lifetime:${paymentIntentId}`,
        async (claimToken) => {
          const lockedCharge = await stripe.charges.retrieve(chargeId);
          if (lockedCharge.livemode !== configuration.livemode) {
            throw new StripeWebhookProcessingError("invalid");
          }
          if (await hasProjectedLifetimePayment(admin, paymentIntentId)) {
            const disputes = await currentDisputes(stripe, lockedCharge.id);
            lifetimePayment = await synchronizeLifetimeCharge(
              admin,
              lockedCharge,
              event,
              disputes,
              claimToken,
            );
          }
          currentCharge = lockedCharge;
        },
      );
    }
    // A known one-time payment has no invoice, so skip the unrelated lookup.
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
  if (dispute.livemode !== configuration.livemode) {
    throw new StripeWebhookProcessingError("invalid");
  }
  const chargeId = stripeObjectId(dispute.charge);
  let customerId: string | null = null;
  let subscriptionId: string | null = null;
  let currentCharge: Stripe.Charge | null = null;
  if (chargeId) {
    currentCharge = await stripe.charges.retrieve(chargeId);
    if (currentCharge.livemode !== configuration.livemode) {
      throw new StripeWebhookProcessingError("invalid");
    }
    customerId = stripeObjectId(currentCharge.customer);
    const paymentIntentId = stripeObjectId(currentCharge.payment_intent);
    let lifetimePayment = false;
    if (paymentIntentId) {
      await withStripeProjectionLease(
        admin,
        `lifetime:${paymentIntentId}`,
        async (claimToken) => {
          const lockedCharge = await stripe.charges.retrieve(chargeId);
          if (lockedCharge.livemode !== configuration.livemode) {
            throw new StripeWebhookProcessingError("invalid");
          }
          if (await hasProjectedLifetimePayment(admin, paymentIntentId)) {
            const disputes = await currentDisputes(stripe, lockedCharge.id);
            lifetimePayment = await synchronizeLifetimeCharge(
              admin,
              lockedCharge,
              event,
              disputes,
              claimToken,
            );
          }
          currentCharge = lockedCharge;
        },
      );
    }
    // A known one-time payment has no invoice, so skip the unrelated lookup.
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
        error.name === "StripeSubscriptionProjectionError" ||
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
      if (
        error.type === "StripeInvalidRequestError" &&
        (!("statusCode" in error) ||
          typeof error.statusCode !== "number" ||
          error.statusCode < 500)
      ) {
        throw new StripeWebhookProcessingError("invalid");
      }
      throw new StripeWebhookProcessingError("provider");
    }
    throw new StripeWebhookProcessingError("database");
  }
}
