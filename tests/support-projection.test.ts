import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  supportCheckoutUrl,
  supportDisputeProjection,
  supportRefundProjection,
  supportSessionProjection,
  synchronizeSupportDispute,
  type StripeSupportPaymentRow,
} from "@/lib/support/records.server";

const ROW: StripeSupportPaymentRow = {
  id: "d1000000-0000-4000-8000-000000000001",
  request_id: "d2000000-0000-4000-8000-000000000002",
  user_id: null,
  livemode: false,
  requested_amount: 1_000,
  amount_total: null,
  amount_refunded: 0,
  currency: "usd",
  checkout_status: "open",
  payment_status: "unpaid",
  outcome_status: "pending",
};

/** Builds the current Stripe support Session used by pure projection tests. */
function session(
  status: "open" | "complete" | "expired",
  paymentStatus: "unpaid" | "paid" = "unpaid",
): Stripe.Checkout.Session {
  return {
    id: "cs_test_SupportSession123",
    mode: "payment",
    livemode: false,
    status,
    payment_status: paymentStatus,
    client_reference_id: ROW.request_id,
    currency: "usd",
    amount_total: 1_000,
    payment_intent:
      paymentStatus === "paid" ? "pi_SupportIntent123" : null,
    metadata: {
      purpose: "biblequest_support",
      support_request_id: ROW.request_id,
    },
    url: "https://checkout.stripe.com/c/pay/cs_test_SupportSession123",
  } as unknown as Stripe.Checkout.Session;
}

describe("one-time support current-object projections", () => {
  it("confirms completion only from the current paid Stripe Session", () => {
    expect(
      supportSessionProjection(
        ROW,
        session("complete", "paid"),
        {
          id: "evt_SupportComplete123",
          created: 1_784_916_100,
          type: "checkout.session.completed",
        },
      ),
    ).toMatchObject({
      amount_total: 1_000,
      stripe_payment_intent_id: "pi_SupportIntent123",
      checkout_status: "complete",
      payment_status: "paid",
      outcome_status: "completed",
      completed_at: new Date(1_784_916_100 * 1000).toISOString(),
    });
  });

  it("records expiration and async failure without inventing payment", () => {
    expect(
      supportSessionProjection(ROW, session("expired"), {
        id: "evt_SupportExpired123",
        created: 1_784_916_200,
        type: "checkout.session.expired",
      }),
    ).toMatchObject({
      checkout_status: "expired",
      payment_status: "unpaid",
      outcome_status: "expired",
    });
    expect(
      supportSessionProjection(ROW, session("complete"), {
        id: "evt_SupportFailed123",
        created: 1_784_916_300,
        type: "checkout.session.async_payment_failed",
      }).outcome_status,
    ).toBe("payment_failed");
  });

  it("never lets a delayed Checkout event erase refund or dispute posture", () => {
    for (const outcome of [
      "partially_refunded",
      "refunded",
      "disputed",
      "dispute_won",
      "dispute_lost",
    ]) {
      expect(
        supportSessionProjection(
          { ...ROW, outcome_status: outcome },
          session("complete", "paid"),
          {
            id: "evt_SupportDelayed123",
            created: 1_784_916_400,
            type: "checkout.session.completed",
          },
        ).outcome_status,
      ).toBe(outcome);
    }
  });

  it("rejects manipulated amount, currency, purpose, and request identity", () => {
    const candidates = [
      { amount_total: 999 },
      { currency: "eur" },
      { metadata: { purpose: "other", support_request_id: ROW.request_id } },
      {
        metadata: {
          purpose: "biblequest_support",
          support_request_id: crypto.randomUUID(),
        },
      },
    ];
    for (const patch of candidates) {
      expect(() =>
        supportSessionProjection(
          { ...ROW },
          { ...session("complete", "paid"), ...patch },
          {
            id: "evt_SupportHostile123",
            created: 1_784_916_500,
            type: "checkout.session.completed",
          },
        ),
      ).toThrow("Stripe support Session mismatch.");
    }
  });

  it("maps cumulative partial/full refunds and dispute outcomes", () => {
    const charge = {
      id: "ch_SupportCharge123",
      livemode: false,
      currency: "usd",
      amount: 1_000,
      amount_refunded: 400,
    } as Stripe.Charge;
    const event = {
      id: "evt_SupportAdjustment123",
      created: 1_784_916_600,
    };
    expect(
      supportRefundProjection(ROW, charge, event),
    ).toMatchObject({
      amount_refunded: 400,
      outcome_status: "partially_refunded",
    });
    expect(
      supportRefundProjection(
        ROW,
        { ...charge, amount_refunded: 1_000 } as Stripe.Charge,
        event,
      ).outcome_status,
    ).toBe("refunded");
    expect(
      supportRefundProjection(
        { ...ROW, outcome_status: "refunded", amount_refunded: 1_000 },
        { ...charge, amount_refunded: 0 } as Stripe.Charge,
        event,
      ).outcome_status,
    ).toBe("completed");
    expect(
      supportRefundProjection(
        { ...ROW, outcome_status: "disputed" },
        { ...charge, amount_refunded: 0 } as Stripe.Charge,
        event,
      ).outcome_status,
    ).toBe("disputed");

    const dispute = {
      charge: "ch_SupportCharge123",
      livemode: false,
      currency: "usd",
      amount: 1_000,
      status: "needs_response",
    } as Stripe.Dispute;
    expect(
      supportDisputeProjection(ROW, charge, dispute, event).outcome_status,
    ).toBe("disputed");
    expect(
      supportDisputeProjection(
        ROW,
        charge,
        { ...dispute, status: "won" } as Stripe.Dispute,
        event,
      ).outcome_status,
    ).toBe("dispute_won");
    expect(
      supportDisputeProjection(
        ROW,
        charge,
        { ...dispute, status: "lost" } as Stripe.Dispute,
        event,
      ).outcome_status,
    ).toBe("dispute_lost");
  });

  it("binds an out-of-order dispute through its immutable request", async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });
    const directMaybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const fallbackMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        ...ROW,
        stripe_payment_intent_id: null,
      },
      error: null,
    });
    const select = vi
      .fn()
      .mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          maybeSingle: directMaybeSingle,
        }),
      })
      .mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          maybeSingle: fallbackMaybeSingle,
        }),
      });
    const admin = {
      from: vi.fn().mockReturnValue({ select, update }),
    } as unknown as SupabaseClient;
    const charge = {
      id: "ch_SupportChargeOutOfOrder123",
      payment_intent: "pi_SupportIntentOutOfOrder123",
      livemode: false,
      currency: "usd",
      amount: 1_000,
      amount_refunded: 0,
    } as Stripe.Charge;
    const dispute = {
      charge: charge.id,
      livemode: false,
      currency: "usd",
      amount: 1_000,
      status: "needs_response",
    } as Stripe.Dispute;

    await expect(
      synchronizeSupportDispute(
        admin,
        charge,
        dispute,
        {
          id: "evt_SupportOutOfOrder123",
          created: 1_784_916_700,
        },
        ROW.request_id,
      ),
    ).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_payment_intent_id: "pi_SupportIntentOutOfOrder123",
        outcome_status: "disputed",
      }),
    );
  });

  it("allows only an open, exact hosted Checkout URL", () => {
    expect(
      supportCheckoutUrl(session("open"), {
        requestId: ROW.request_id,
        amount: 1_000,
        livemode: false,
      }),
    ).toBe(
      "https://checkout.stripe.com/c/pay/cs_test_SupportSession123",
    );
    expect(
      supportCheckoutUrl(
        {
          ...session("open"),
          url: "https://hostile.test/checkout",
        },
        {
          requestId: ROW.request_id,
          amount: 1_000,
          livemode: false,
        },
      ),
    ).toBeNull();
    expect(
      supportCheckoutUrl(
        {
          ...session("open"),
          url: "https://user:pass@checkout.stripe.com/hostile",
        },
        {
          requestId: ROW.request_id,
          amount: 1_000,
          livemode: false,
        },
      ),
    ).toBeNull();
  });

  it("rejects unexpected free-payment state and mismatched dispute Charge", () => {
    expect(() =>
      supportSessionProjection(
        ROW,
        {
          ...session("complete", "paid"),
          payment_status: "no_payment_required",
        },
        {
          id: "evt_SupportFree123",
          created: 1_784_916_700,
          type: "checkout.session.completed",
        },
      ),
    ).toThrow("Stripe support Session mismatch.");
    expect(() =>
      supportDisputeProjection(
        ROW,
        {
          id: "ch_SupportCharge123",
          livemode: false,
          currency: "usd",
          amount: 1_000,
          amount_refunded: 0,
        } as Stripe.Charge,
        {
          charge: "ch_OtherCharge123",
          livemode: false,
          currency: "usd",
          amount: 1_000,
          status: "needs_response",
        } as Stripe.Dispute,
        {
          id: "evt_SupportWrongCharge123",
          created: 1_784_916_800,
        },
      ),
    ).toThrow("Stripe support dispute mismatch.");
  });
});
