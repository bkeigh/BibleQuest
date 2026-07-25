import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { retrieveBillingPlans } from "@/lib/billing/stripe.server";
import type { StripeBillingConfiguration } from "@/lib/billing/config";

const CONFIGURATION: StripeBillingConfiguration = {
  status: "configured",
  mode: "test",
  secretKey: `sk_test_${"a".repeat(24)}`,
  publishableKey: `pk_test_${"b".repeat(24)}`,
  webhookSecret: `whsec_${"c".repeat(24)}`,
  priceIds: {
    monthly: "price_TestMonthly123",
    annual: "price_TestAnnual123",
    lifetime: "price_TestLifetime123",
  },
  appOrigin: "https://preview.biblequest.test",
  livemode: false,
  purchasesEnabled: true,
  supportEnabled: false,
};

/** Creates a minimal active Stripe Price for the catalog validator. */
function price(
  id: string,
  interval: "month" | "year" | null,
): Stripe.Price {
  return {
    id,
    active: true,
    type: interval ? "recurring" : "one_time",
    recurring: interval
      ? { interval, interval_count: 1 }
      : null,
    unit_amount:
      interval === "month" ? 899 : interval === "year" ? 8_999 : 14_499,
    currency: "usd",
    product: "prod_TestPlus123",
  } as Stripe.Price;
}

describe("Stripe Plus catalog validation", () => {
  it("accepts monthly, annual, and one-time lifetime Prices", async () => {
    const retrieve = vi.fn((id: string) =>
      Promise.resolve(
        id === CONFIGURATION.priceIds.monthly
          ? price(id, "month")
          : id === CONFIGURATION.priceIds.annual
            ? price(id, "year")
            : price(id, null),
      ),
    );
    const stripe = { prices: { retrieve } } as unknown as Stripe;

    await expect(
      retrieveBillingPlans(stripe, CONFIGURATION),
    ).resolves.toMatchObject({
      monthly: { interval: "monthly", unitAmount: 899 },
      annual: { interval: "annual", unitAmount: 8_999 },
      lifetime: { interval: "lifetime", unitAmount: 14_499 },
    });
  });

  it("rejects a recurring Price in the lifetime slot", async () => {
    const retrieve = vi.fn((id: string) =>
      Promise.resolve(
        id === CONFIGURATION.priceIds.annual
          ? price(id, "year")
          : price(id, "month"),
      ),
    );
    const stripe = { prices: { retrieve } } as unknown as Stripe;

    await expect(
      retrieveBillingPlans(stripe, CONFIGURATION),
    ).rejects.toThrow("Stripe billing plan unavailable.");
  });
});
