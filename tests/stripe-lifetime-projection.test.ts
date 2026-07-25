import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  synchronizeLifetimeCharge,
  synchronizeLifetimeSession,
} from "@/lib/billing/records.server";
import type { StripeBillingConfiguration } from "@/lib/billing/config";

const USER_ID = "c1000000-0000-4000-8000-000000000001";
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
const EVENT = { id: "evt_TestLifetime123", created: 1_785_015_899 };

/** Builds the expanded current objects required for a lifetime grant. */
function lifetimeObjects() {
  const charge = {
    id: "ch_TestLifetime123",
    paid: true,
    disputed: false,
    livemode: false,
    payment_intent: "pi_TestLifetime123",
    amount: 14_499,
    amount_refunded: 0,
    currency: "usd",
  } as Stripe.Charge;
  const paymentIntent = {
    id: "pi_TestLifetime123",
    customer: "cus_TestCustomer123",
    status: "succeeded",
    amount_received: 14_499,
    currency: "usd",
    latest_charge: charge,
  } as Stripe.PaymentIntent;
  const session = {
    id: "cs_test_TestLifetime123",
    mode: "payment",
    livemode: false,
    status: "complete",
    payment_status: "paid",
    customer: "cus_TestCustomer123",
    payment_intent: paymentIntent.id,
    client_reference_id: USER_ID,
    metadata: {
      purpose: "biblequest_plus",
      biblequest_user_id: USER_ID,
      billing_interval: "lifetime",
    },
    amount_total: 14_499,
    currency: "usd",
    line_items: {
      data: [
        {
          quantity: 1,
          price: {
            id: CONFIGURATION.priceIds.lifetime,
            active: true,
            type: "one_time",
            recurring: null,
            unit_amount: 14_499,
            currency: "usd",
            product: "prod_TestPlus123",
          },
        },
      ],
    },
  } as unknown as Stripe.Checkout.Session;
  return { charge, paymentIntent, session };
}

describe("Stripe lifetime Plus projection", () => {
  it("grants access only from matching current paid Stripe objects", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) =>
      table === "stripe_customers"
        ? {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { user_id: USER_ID, livemode: false },
                  error: null,
                }),
              }),
            }),
          }
        : { upsert },
    );
    const { session, paymentIntent } = lifetimeObjects();

    await expect(
      synchronizeLifetimeSession(
        { from } as unknown as SupabaseClient,
        session,
        paymentIntent,
        CONFIGURATION,
        EVENT,
      ),
    ).resolves.toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        status: "active",
        plan_key: "plus",
        billing_interval: "lifetime",
        stripe_price_id: CONFIGURATION.priceIds.lifetime,
        amount_total: 14_499,
        amount_refunded: 0,
        outcome_status: "completed",
      }),
      { onConflict: "stripe_checkout_session_id" },
    );
  });

  it("rejects a paid Checkout using an unapproved Price", async () => {
    const { session, paymentIntent } = lifetimeObjects();
    (
      session.line_items!.data[0].price as Stripe.Price
    ).id = "price_Unapproved123";
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { user_id: USER_ID, livemode: false },
            error: null,
          }),
        }),
      }),
    });

    await expect(
      synchronizeLifetimeSession(
        { from } as unknown as SupabaseClient,
        session,
        paymentIntent,
        CONFIGURATION,
        EVENT,
      ),
    ).rejects.toMatchObject({ name: "StripeLifetimeProjectionError" });
  });

  it("revokes a fully refunded lifetime payment", async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "d1000000-0000-4000-8000-000000000001",
        livemode: false,
        amount_total: 14_499,
        amount_refunded: 0,
        currency: "usd",
        outcome_status: "completed",
      },
      error: null,
    });
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle }),
      }),
      update,
    });
    const { charge } = lifetimeObjects();
    charge.amount_refunded = charge.amount;

    await expect(
      synchronizeLifetimeCharge(
        { from } as unknown as SupabaseClient,
        charge,
        EVENT,
      ),
    ).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "canceled",
        plan_key: "free",
        amount_refunded: 14_499,
        outcome_status: "refunded",
      }),
    );
  });
});
