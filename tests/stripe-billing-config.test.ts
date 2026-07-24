import { describe, expect, it } from "vitest";
import { stripeBillingAvailability } from "@/lib/billing/config";

const TEST_ENVIRONMENT = {
  STRIPE_BILLING_MODE: "test",
  STRIPE_SECRET_KEY: `sk_test_${"a".repeat(24)}`,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: `pk_test_${"b".repeat(24)}`,
  STRIPE_WEBHOOK_SECRET: `whsec_${"c".repeat(24)}`,
  STRIPE_PLUS_MONTHLY_PRICE_ID: "price_TestMonthly123",
  STRIPE_PLUS_ANNUAL_PRICE_ID: "price_TestAnnual123",
  NEXT_PUBLIC_APP_URL: "https://preview.biblequest.test",
};

describe("deny-by-default direct Stripe configuration", () => {
  it("stays coming-soon when billing mode is absent", () => {
    expect(stripeBillingAvailability({})).toEqual({
      status: "coming-soon",
      mode: "coming-soon",
    });
  });

  it("requires every matching test credential and a separate purchase gate", () => {
    expect(stripeBillingAvailability(TEST_ENVIRONMENT)).toMatchObject({
      status: "configured",
      mode: "test",
      livemode: false,
      purchasesEnabled: false,
    });
    expect(
      stripeBillingAvailability({
        ...TEST_ENVIRONMENT,
        BIBLEQUEST_STRIPE_PURCHASES_ENABLED: "true",
      }),
    ).toMatchObject({
      status: "configured",
      mode: "test",
      purchasesEnabled: true,
    });
  });

  it("rejects incomplete, mismatched, duplicate-price, and malformed values", () => {
    const candidates = [
      { ...TEST_ENVIRONMENT, STRIPE_WEBHOOK_SECRET: "" },
      {
        ...TEST_ENVIRONMENT,
        STRIPE_SECRET_KEY: `sk_live_${"a".repeat(24)}`,
      },
      {
        ...TEST_ENVIRONMENT,
        STRIPE_PLUS_ANNUAL_PRICE_ID:
          TEST_ENVIRONMENT.STRIPE_PLUS_MONTHLY_PRICE_ID,
      },
      {
        ...TEST_ENVIRONMENT,
        NEXT_PUBLIC_APP_URL: "https://preview.biblequest.test/path",
      },
      { ...TEST_ENVIRONMENT, STRIPE_BILLING_MODE: "sandbox" },
    ];

    for (const candidate of candidates) {
      expect(stripeBillingAvailability(candidate).status).toBe("invalid");
    }
  });

  it("permits HTTP only for local test mode and requires live approval", () => {
    expect(
      stripeBillingAvailability({
        ...TEST_ENVIRONMENT,
        NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
      }).status,
    ).toBe("configured");
    expect(
      stripeBillingAvailability({
        ...TEST_ENVIRONMENT,
        NEXT_PUBLIC_APP_URL: "http://preview.biblequest.test",
      }).status,
    ).toBe("invalid");

    const live = {
      ...TEST_ENVIRONMENT,
      STRIPE_BILLING_MODE: "live",
      STRIPE_SECRET_KEY: `sk_live_${"a".repeat(24)}`,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: `pk_live_${"b".repeat(24)}`,
      NEXT_PUBLIC_APP_URL: "https://www.biblequest.co",
    };
    expect(stripeBillingAvailability(live).status).toBe("invalid");
    expect(
      stripeBillingAvailability({
        ...live,
        STRIPE_LIVE_BILLING_APPROVED: "true",
      }),
    ).toMatchObject({
      status: "configured",
      mode: "live",
      livemode: true,
      purchasesEnabled: false,
    });
  });
});
