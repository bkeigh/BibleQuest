import "server-only";

import Stripe from "stripe";
import {
  requireStripeBillingConfiguration,
  type StripeBillingConfiguration,
} from "./config.server";
import type { BillingInterval, BillingPlan } from "./validation";

/** Creates the pinned server SDK client for one already-validated key. */
export function createStripe(
  configuration: StripeBillingConfiguration =
    requireStripeBillingConfiguration(),
): Stripe {
  return new Stripe(configuration.secretKey, {
    apiVersion: "2026-06-24.dahlia",
    maxNetworkRetries: 2,
    timeout: 10_000,
    appInfo: {
      name: "BibleQuest",
      version: "0.1.0",
    },
  });
}

function productId(
  product: string | Stripe.Product | Stripe.DeletedProduct,
): string {
  return typeof product === "string" ? product : product.id;
}

/** Retrieves and proves both recurring Price IDs before showing purchase UI. */
export async function retrieveBillingPlans(
  stripe: Stripe,
  configuration: StripeBillingConfiguration,
): Promise<
  Record<
    BillingInterval,
    BillingPlan & { priceId: string; productId: string }
  >
> {
  const [monthlyPrice, annualPrice] = await Promise.all([
    stripe.prices.retrieve(configuration.priceIds.monthly),
    stripe.prices.retrieve(configuration.priceIds.annual),
  ]);

  const parse = (
    price: Stripe.Price,
    interval: BillingInterval,
  ): BillingPlan & { priceId: string; productId: string } => {
    const expectedInterval = interval === "monthly" ? "month" : "year";
    if (
      !price.active ||
      price.type !== "recurring" ||
      price.recurring?.interval !== expectedInterval ||
      price.recurring.interval_count !== 1 ||
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

  const monthly = parse(monthlyPrice, "monthly");
  const annual = parse(annualPrice, "annual");
  if (
    monthly.currency !== annual.currency ||
    monthly.productId !== annual.productId
  ) {
    throw new Error("Stripe billing plan unavailable.");
  }
  return { monthly, annual };
}
