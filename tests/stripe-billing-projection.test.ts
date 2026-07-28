import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  billingStatusFromRows,
  subscriptionProjection,
  type OperatorPlusGrantRow,
  type SubscriptionProjectionRow,
} from "@/lib/billing/server";
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

/** Builds the current Stripe shape without embedding stale event fields. */
function subscription(
  status: Stripe.Subscription.Status,
  priceId = CONFIGURATION.priceIds.monthly,
): Stripe.Subscription {
  return {
    id: "sub_TestSubscription123",
    customer: "cus_TestCustomer123",
    status,
    livemode: false,
    currency: "usd",
    cancel_at_period_end: false,
    canceled_at: null,
    trial_end: null,
    latest_invoice: "in_TestInvoice123",
    items: {
      data: [
        {
          current_period_start: 1_784_916_000,
          current_period_end: 1_787_594_400,
          price: {
            id: priceId,
            product: "prod_TestPlus123",
          },
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

describe("server-authoritative Stripe projection", () => {
  it("grants Plus only for an active recognized server Price", () => {
    const active = subscriptionProjection(
      subscription("active"),
      "c1000000-0000-4000-8000-000000000001",
      CONFIGURATION,
    );
    expect(active).toMatchObject({
      status: "active",
      plan_key: "plus",
      billing_interval: "monthly",
      stripe_price_id: CONFIGURATION.priceIds.monthly,
      // Recorded so a test row can never be read as a live membership.
      livemode: false,
    });

    const unknown = subscriptionProjection(
      subscription("active", "price_Unrecognized123"),
      "c1000000-0000-4000-8000-000000000001",
      CONFIGURATION,
    );
    expect(unknown).toMatchObject({
      status: "active",
      plan_key: "free",
      billing_interval: "unknown",
    });

    const pastDue = subscriptionProjection(
      subscription("past_due"),
      "c1000000-0000-4000-8000-000000000001",
      CONFIGURATION,
    );
    expect(pastDue.plan_key).toBe("free");
  });

  it("uses current item period dates and bounded event identity", () => {
    const projection = subscriptionProjection(
      subscription("trialing"),
      "c1000000-0000-4000-8000-000000000001",
      CONFIGURATION,
      { id: "evt_TestEvent123", created: 1_784_916_100 },
    );
    expect(projection.current_period_start).toBe(
      new Date(1_784_916_000 * 1000).toISOString(),
    );
    expect(projection.current_period_end).toBe(
      new Date(1_787_594_400 * 1000).toISOString(),
    );
    expect(projection).toMatchObject({
      last_stripe_event_id: "evt_TestEvent123",
      last_stripe_event_created: 1_784_916_100,
      plan_key: "plus",
    });
  });

  it("returns free unless a current row has an allowed entitled state", () => {
    const row = {
      id: "d1000000-0000-4000-8000-000000000001",
      user_id: "c1000000-0000-4000-8000-000000000001",
      status: "past_due",
      plan_key: "free",
      current_period_start: "2026-07-01T00:00:00.000Z",
      current_period_end: "2026-08-01T00:00:00.000Z",
      billing_interval: "monthly",
      currency: "usd",
      cancel_at_period_end: false,
      canceled_at: null,
      trial_end: null,
      synchronized_at: "2026-07-24T00:00:00.000Z",
    } satisfies SubscriptionProjectionRow;
    expect(billingStatusFromRows([row], true)).toMatchObject({
      plan: "free",
      isPlus: false,
      status: "past_due",
      hasCustomer: true,
    });
    expect(
      billingStatusFromRows(
        [{ ...row, status: "active", plan_key: "plus" }],
        true,
      ),
    ).toMatchObject({
      plan: "plus",
      isPlus: true,
      status: "active",
    });
  });

  it("unions a current operator grant without fabricating Stripe state", () => {
    const grant = {
      id: "d1000000-0000-4000-8000-000000000001",
      user_id: "c1000000-0000-4000-8000-000000000001",
      starts_at: "2026-07-01T00:00:00.000Z",
      expires_at: "2026-08-01T00:00:00.000Z",
      revoked_at: null,
    } satisfies OperatorPlusGrantRow;
    expect(
      billingStatusFromRows([], false, [grant], Date.parse("2026-07-15")),
    ).toMatchObject({
      plan: "plus",
      isPlus: true,
      status: "active",
      entitlementSource: "operator",
      interval: null,
      currentPeriodEnd: grant.expires_at,
      hasCustomer: false,
    });
    expect(
      billingStatusFromRows(
        [],
        false,
        [grant],
        Date.parse("2026-08-02"),
      ),
    ).toMatchObject({
      plan: "free",
      isPlus: false,
      entitlementSource: null,
    });
    expect(
      billingStatusFromRows(
        [],
        false,
        [{ ...grant, expires_at: null, revoked_at: "2026-07-10T00:00:00Z" }],
        Date.parse("2026-07-15"),
      ),
    ).toMatchObject({
      plan: "free",
      isPlus: false,
    });
  });

  it("rejects ambiguous multi-item subscription shapes", () => {
    const invalid = subscription("active");
    invalid.items.data.push(invalid.items.data[0]);
    expect(() =>
      subscriptionProjection(
        invalid,
        "c1000000-0000-4000-8000-000000000001",
        CONFIGURATION,
      ),
    ).toThrow("Stripe subscription shape unavailable.");
  });
});
