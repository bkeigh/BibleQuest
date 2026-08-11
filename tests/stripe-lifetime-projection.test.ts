import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  synchronizeLifetimeCharge,
  synchronizeLifetimeSession,
  type StripeDisputeSnapshot,
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
const CLAIM_TOKEN = "d1000000-0000-4000-8000-000000000099";
const EMPTY_DISPUTES: StripeDisputeSnapshot = { data: [], hasMore: false };

/** Builds the expanded current objects required for a lifetime decision. */
function lifetimeObjects() {
  const metadata = {
    purpose: "biblequest_plus",
    biblequest_user_id: USER_ID,
    billing_interval: "lifetime",
  };
  const charge = {
    id: "ch_TestLifetime123",
    paid: true,
    disputed: false,
    livemode: false,
    customer: "cus_TestCustomer123",
    payment_intent: "pi_TestLifetime123",
    amount: 14_499,
    amount_refunded: 0,
    currency: "usd",
  } as Stripe.Charge;
  const paymentIntent = {
    id: "pi_TestLifetime123",
    livemode: false,
    customer: "cus_TestCustomer123",
    status: "succeeded",
    amount_received: 14_499,
    currency: "usd",
    metadata,
    latest_charge: charge,
  } as unknown as Stripe.PaymentIntent;
  const session = {
    id: "cs_test_TestLifetime123",
    mode: "payment",
    livemode: false,
    status: "complete",
    payment_status: "paid",
    customer: "cus_TestCustomer123",
    payment_intent: paymentIntent.id,
    client_reference_id: USER_ID,
    metadata,
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

/** Builds the sealed row used to reconcile current Charge adjustments. */
function lifetimeRow() {
  return {
    id: "d1000000-0000-4000-8000-000000000001",
    user_id: USER_ID,
    livemode: false,
    external_customer_id: "cus_TestCustomer123",
    stripe_checkout_session_id: "cs_test_TestLifetime123",
    stripe_payment_intent_id: "pi_TestLifetime123",
    amount_total: 14_499,
    amount_refunded: 0,
    currency: "usd",
    outcome_status: "completed",
  };
}

/** Creates one current dispute attached to the lifetime Charge. */
function dispute(status: Stripe.Dispute.Status): Stripe.Dispute {
  return {
    id: `du_Test${status.replaceAll("_", "")}`,
    livemode: false,
    charge: "ch_TestLifetime123",
    payment_intent: "pi_TestLifetime123",
    amount: 14_499,
    currency: "usd",
    status,
  } as Stripe.Dispute;
}

/** Mocks sealed customer lookup plus one existing-or-new lifetime row. */
function lifetimeAdmin(existing: ReturnType<typeof lifetimeRow> | null) {
  const rpc = vi.fn().mockResolvedValue({ data: "committed", error: null });
  const from = vi.fn((table: string) => {
    if (table === "stripe_customers") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { user_id: USER_ID, livemode: false },
              error: null,
            }),
          }),
        }),
      };
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: existing,
            error: null,
          }),
        }),
      }),
    };
  });
  return {
    admin: { from, rpc } as unknown as SupabaseClient,
    rpc,
  };
}

describe("Stripe lifetime Plus projection", () => {
  it("grants only from matching current paid objects and sealed identity", async () => {
    const { admin, rpc } = lifetimeAdmin(null);
    const { session, paymentIntent } = lifetimeObjects();

    await expect(
      synchronizeLifetimeSession(
        admin,
        session,
        paymentIntent,
        EMPTY_DISPUTES,
        CONFIGURATION,
        EVENT,
        CLAIM_TOKEN,
      ),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "commit_stripe_projection",
      expect.objectContaining({
        p_projection_key: "lifetime:pi_TestLifetime123",
        p_claim_token: CLAIM_TOKEN,
        p_projection: expect.objectContaining({
          user_id: USER_ID,
          status: "active",
          plan_key: "plus",
          billing_interval: "lifetime",
          stripe_price_id: CONFIGURATION.priceIds.lifetime,
          amount_total: 14_499,
          amount_refunded: 0,
          outcome_status: "completed",
          dispute_status: null,
        }),
      }),
    );
  });

  it("rejects unapproved Price, unpaid Charge, and wrong customer", async () => {
    const { admin } = lifetimeAdmin(null);
    const unapproved = lifetimeObjects();
    (
      unapproved.session.line_items!.data[0].price as Stripe.Price
    ).id = "price_Unapproved123";
    await expect(
      synchronizeLifetimeSession(
        admin,
        unapproved.session,
        unapproved.paymentIntent,
        EMPTY_DISPUTES,
        CONFIGURATION,
        EVENT,
        CLAIM_TOKEN,
      ),
    ).rejects.toMatchObject({ name: "StripeLifetimeProjectionError" });

    const unpaid = lifetimeObjects();
    unpaid.charge.paid = false;
    await expect(
      synchronizeLifetimeSession(
        admin,
        unpaid.session,
        unpaid.paymentIntent,
        EMPTY_DISPUTES,
        CONFIGURATION,
        EVENT,
        CLAIM_TOKEN,
      ),
    ).rejects.toMatchObject({ name: "StripeLifetimeProjectionError" });

    const wrongCustomer = lifetimeObjects();
    wrongCustomer.charge.customer = "cus_CrossAccount123";
    await expect(
      synchronizeLifetimeSession(
        admin,
        wrongCustomer.session,
        wrongCustomer.paymentIntent,
        EMPTY_DISPUTES,
        CONFIGURATION,
        EVENT,
        CLAIM_TOKEN,
      ),
    ).rejects.toMatchObject({ name: "StripeLifetimeProjectionError" });
  });

  it("revokes a fully refunded lifetime payment", async () => {
    const { admin, rpc } = lifetimeAdmin(lifetimeRow());
    const { charge } = lifetimeObjects();
    charge.amount_refunded = charge.amount;

    await expect(
      synchronizeLifetimeCharge(
        admin,
        charge,
        EVENT,
        EMPTY_DISPUTES,
        CLAIM_TOKEN,
      ),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "commit_stripe_projection",
      expect.objectContaining({
        p_projection: expect.objectContaining({
          status: "canceled",
          plan_key: "free",
          amount_refunded: 14_499,
          outcome_status: "refunded",
        }),
      }),
    );
  });

  it("keeps delayed refunds from overriding open or lost disputes", async () => {
    for (const status of ["needs_response", "lost"] as const) {
      const { admin, rpc } = lifetimeAdmin(lifetimeRow());
      const { charge } = lifetimeObjects();
      charge.amount_refunded = 1_000;
      await synchronizeLifetimeCharge(
        admin,
        charge,
        EVENT,
        { data: [dispute(status)], hasMore: false },
        CLAIM_TOKEN,
      );
      expect(rpc).toHaveBeenCalledWith(
        "commit_stripe_projection",
        expect.objectContaining({
          p_projection: expect.objectContaining({
            status: "canceled",
            plan_key: "free",
            outcome_status: status === "lost" ? "dispute_lost" : "disputed",
          }),
        }),
      );
    }
  });

  it("requires every current dispute to be won before restoring access", async () => {
    const mixed = lifetimeAdmin(lifetimeRow());
    await synchronizeLifetimeCharge(
      mixed.admin,
      lifetimeObjects().charge,
      EVENT,
      {
        data: [dispute("won"), dispute("under_review")],
        hasMore: false,
      },
      CLAIM_TOKEN,
    );
    expect(mixed.rpc).toHaveBeenCalledWith(
      "commit_stripe_projection",
      expect.objectContaining({
        p_projection: expect.objectContaining({
          status: "canceled",
          plan_key: "free",
        }),
      }),
    );

    const won = lifetimeAdmin(lifetimeRow());
    await synchronizeLifetimeCharge(
      won.admin,
      lifetimeObjects().charge,
      EVENT,
      { data: [dispute("won"), dispute("won")], hasMore: false },
      CLAIM_TOKEN,
    );
    expect(won.rpc).toHaveBeenCalledWith(
      "commit_stripe_projection",
      expect.objectContaining({
        p_projection: expect.objectContaining({
          status: "active",
          plan_key: "plus",
          outcome_status: "dispute_won",
        }),
      }),
    );
  });

  it("lets full refunds outrank won disputes and truncation deny access", async () => {
    const refunded = lifetimeAdmin(lifetimeRow());
    const charge = lifetimeObjects().charge;
    charge.amount_refunded = charge.amount;
    await synchronizeLifetimeCharge(
      refunded.admin,
      charge,
      EVENT,
      { data: [dispute("won")], hasMore: false },
      CLAIM_TOKEN,
    );
    expect(refunded.rpc).toHaveBeenCalledWith(
      "commit_stripe_projection",
      expect.objectContaining({
        p_projection: expect.objectContaining({
          status: "canceled",
          outcome_status: "refunded",
        }),
      }),
    );

    const truncated = lifetimeAdmin(lifetimeRow());
    await synchronizeLifetimeCharge(
      truncated.admin,
      lifetimeObjects().charge,
      EVENT,
      { data: [dispute("won")], hasMore: true },
      CLAIM_TOKEN,
    );
    expect(truncated.rpc).toHaveBeenCalledWith(
      "commit_stripe_projection",
      expect.objectContaining({
        p_projection: expect.objectContaining({
          status: "canceled",
          outcome_status: "disputed",
          dispute_status: "truncated",
        }),
      }),
    );
  });
});
