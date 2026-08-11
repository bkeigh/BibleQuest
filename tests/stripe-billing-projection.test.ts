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
const USER_ID = "c1000000-0000-4000-8000-000000000001";

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
    collection_method: "charge_automatically",
    metadata: {
      purpose: "biblequest_plus",
      biblequest_user_id: USER_ID,
      billing_interval: "monthly",
    },
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    trial_end: null,
    latest_invoice: "in_TestInvoice123",
    items: {
      data: [
        {
          quantity: 1,
          current_period_start: 1_784_916_000,
          current_period_end: 1_787_594_400,
          price: {
            id: priceId,
            product: "prod_TestPlus123",
            type: "recurring",
            recurring: { interval: "month", interval_count: 1 },
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
      USER_ID,
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
      USER_ID,
      CONFIGURATION,
    );
    expect(unknown).toMatchObject({
      status: "active",
      plan_key: "free",
      billing_interval: "unknown",
    });

    const pastDue = subscriptionProjection(
      subscription("past_due"),
      USER_ID,
      CONFIGURATION,
    );
    expect(pastDue.plan_key).toBe("free");
  });

  it("requires sealed owner and server-authored recurring purpose metadata", () => {
    const forged = subscription("active");
    forged.metadata.biblequest_user_id =
      "c2000000-0000-4000-8000-000000000002";
    expect(
      subscriptionProjection(forged, USER_ID, CONFIGURATION).plan_key,
    ).toBe("free");

    const wrongPurpose = subscription("active");
    wrongPurpose.metadata.purpose = "biblequest_support";
    expect(
      subscriptionProjection(wrongPurpose, USER_ID, CONFIGURATION).plan_key,
    ).toBe("free");

    const wrongInterval = subscription("active");
    wrongInterval.metadata.billing_interval = "annual";
    expect(
      subscriptionProjection(wrongInterval, USER_ID, CONFIGURATION).plan_key,
    ).toBe("free");
    expect(
      subscriptionProjection(subscription("active"), null, CONFIGURATION)
        .plan_key,
    ).toBe("free");
  });

  it("denies every non-entitled current subscription state", () => {
    const denied: Stripe.Subscription.Status[] = [
      "incomplete",
      "incomplete_expired",
      "past_due",
      "canceled",
      "unpaid",
      "paused",
    ];
    for (const status of denied) {
      expect(
        subscriptionProjection(subscription(status), USER_ID, CONFIGURATION)
          .plan_key,
      ).toBe("free");
    }
  });

  it("uses current item period dates and bounded event identity", () => {
    const projection = subscriptionProjection(
      subscription("trialing"),
      USER_ID,
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

  it("records portal-scheduled cancellation timestamps", () => {
    const scheduled = subscription("active");
    scheduled.cancel_at = 1_787_594_400;
    scheduled.canceled_at = 1_785_300_839;

    expect(
      subscriptionProjection(
        scheduled,
        USER_ID,
        CONFIGURATION,
      ),
    ).toMatchObject({
      plan_key: "plus",
      cancel_at_period_end: true,
      canceled_at: new Date(1_785_300_839 * 1000).toISOString(),
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

  it("reports active lifetime access ahead of finite recurring access", () => {
    const recurring = {
      id: "d1000000-0000-4000-8000-000000000001",
      user_id: USER_ID,
      status: "active",
      plan_key: "plus",
      current_period_start: "2026-08-01T00:00:00.000Z",
      current_period_end: "2026-09-01T00:00:00.000Z",
      billing_interval: "monthly",
      currency: "usd",
      cancel_at_period_end: false,
      canceled_at: null,
      trial_end: null,
      synchronized_at: "2026-08-01T00:00:00.000Z",
    } satisfies SubscriptionProjectionRow;
    const lifetime = {
      ...recurring,
      id: "d2000000-0000-4000-8000-000000000002",
      current_period_start: null,
      current_period_end: null,
      billing_interval: "lifetime",
    } satisfies SubscriptionProjectionRow;

    expect(billingStatusFromRows([recurring, lifetime], true)).toMatchObject({
      isPlus: true,
      interval: "lifetime",
      currentPeriodEnd: null,
    });
  });

  it("rejects ambiguous multi-item subscription shapes", () => {
    const invalid = subscription("active");
    invalid.items.data.push(invalid.items.data[0]);
    expect(() =>
      subscriptionProjection(
        invalid,
        USER_ID,
        CONFIGURATION,
      ),
    ).toThrow("Stripe subscription shape unavailable.");
  });
});
