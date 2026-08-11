import "server-only";

import Stripe from "stripe";
import {
  requireStripeBillingConfiguration,
  type StripeBillingConfiguration,
} from "./config.server";
import { stripeObjectId } from "./stripe-object.server";
import type { BillingInterval, BillingPlan } from "./validation";

/** Creates the pinned server SDK client for one already-validated key. */
export function createStripe(
  configuration: StripeBillingConfiguration =
    requireStripeBillingConfiguration(),
): Stripe {
  return new Stripe(configuration.secretKey, {
    apiVersion: "2026-07-29.dahlia",
    maxNetworkRetries: 2,
    timeout: 10_000,
    appInfo: {
      name: "BibleQuest",
      version: "0.1.0",
    },
  });
}

/** Returns only a newly created Plus Session's exact hosted Stripe URL. */
export function plusCheckoutUrl(
  session: Stripe.Checkout.Session,
  expected: {
    customerId: string;
    userId: string;
    interval: BillingInterval;
    livemode: boolean;
  },
): string | null {
  const mode = expected.interval === "lifetime" ? "payment" : "subscription";
  if (
    session.mode !== mode ||
    session.livemode !== expected.livemode ||
    session.status !== "open" ||
    session.client_reference_id !== expected.userId ||
    stripeObjectId(session.customer) !== expected.customerId ||
    session.metadata?.purpose !== "biblequest_plus" ||
    session.metadata?.biblequest_user_id !== expected.userId ||
    session.metadata?.billing_interval !== expected.interval ||
    !session.url
  ) {
    return null;
  }
  try {
    const destination = new URL(session.url);
    if (
      destination.origin !== "https://checkout.stripe.com" ||
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

function productId(
  product: string | Stripe.Product | Stripe.DeletedProduct,
): string {
  return typeof product === "string" ? product : product.id;
}

/** Retrieves and proves every server-allowlisted Price before showing purchase UI. */
export async function retrieveBillingPlans(
  stripe: Stripe,
  configuration: StripeBillingConfiguration,
): Promise<
  Record<
    BillingInterval,
    BillingPlan & { priceId: string; productId: string }
  >
> {
  const [monthlyPrice, annualPrice, lifetimePrice] = await Promise.all([
    stripe.prices.retrieve(configuration.priceIds.monthly),
    stripe.prices.retrieve(configuration.priceIds.annual),
    stripe.prices.retrieve(configuration.priceIds.lifetime),
  ]);

  const parse = (
    price: Stripe.Price,
    interval: BillingInterval,
    expectedPriceId: string,
  ): BillingPlan & { priceId: string; productId: string } => {
    const expectedInterval =
      interval === "monthly"
        ? "month"
        : interval === "annual"
          ? "year"
          : null;
    if (
      price.id !== expectedPriceId ||
      price.livemode !== configuration.livemode ||
      !price.active ||
      (expectedInterval === null
        ? price.type !== "one_time" || price.recurring !== null
        : price.type !== "recurring" ||
          price.recurring?.interval !== expectedInterval ||
          price.recurring.interval_count !== 1) ||
      !Number.isSafeInteger(price.unit_amount) ||
      (price.unit_amount ?? 0) <= 0 ||
      !/^[a-z]{3}$/.test(price.currency) ||
      !price.product
    ) {
      throw new Error("Stripe billing plan unavailable.");
    }
    return {
      interval,
      unitAmount: price.unit_amount!,
      currency: price.currency,
      priceId: price.id,
      productId: productId(price.product),
    };
  };

  const monthly = parse(
    monthlyPrice,
    "monthly",
    configuration.priceIds.monthly,
  );
  const annual = parse(
    annualPrice,
    "annual",
    configuration.priceIds.annual,
  );
  const lifetime = parse(
    lifetimePrice,
    "lifetime",
    configuration.priceIds.lifetime,
  );
  if (
    monthly.currency !== annual.currency ||
    monthly.currency !== lifetime.currency ||
    monthly.productId !== annual.productId ||
    monthly.productId !== lifetime.productId
  ) {
    throw new Error("Stripe billing plan unavailable.");
  }
  return { monthly, annual, lifetime };
}
