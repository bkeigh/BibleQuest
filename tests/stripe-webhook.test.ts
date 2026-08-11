import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/records.server", () => ({
  hasProjectedLifetimePayment: vi.fn(),
  synchronizeCurrentSubscription: vi.fn(),
  synchronizeLifetimeSession: vi.fn(),
  synchronizeLifetimeCharge: vi.fn(),
  withStripeProjectionLease: vi.fn(),
}));
vi.mock("@/lib/support/records.server", () => ({
  synchronizeSupportSession: vi.fn(),
  synchronizeSupportRefund: vi.fn(),
  synchronizeSupportDispute: vi.fn(),
}));
vi.mock("@/lib/games/arcade/records.server", () => ({
  synchronizeArcadeSession: vi.fn(),
  synchronizeArcadeCharge: vi.fn(),
}));

import {
  hasProjectedLifetimePayment,
  synchronizeCurrentSubscription,
  synchronizeLifetimeCharge,
  synchronizeLifetimeSession,
  withStripeProjectionLease,
} from "@/lib/billing/records.server";
import {
  synchronizeSupportDispute,
  synchronizeSupportRefund,
  synchronizeSupportSession,
} from "@/lib/support/records.server";
import {
  synchronizeArcadeCharge,
  synchronizeArcadeSession,
} from "@/lib/games/arcade/records.server";
import {
  processStripeWebhookEvent,
  StripeWebhookProcessingError,
} from "@/lib/billing/webhook.server";
import type { StripeBillingConfiguration } from "@/lib/billing/config";

const CONFIGURATION = {
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
} satisfies StripeBillingConfiguration;
const CLAIM_TOKEN = "d1000000-0000-4000-8000-000000000099";

/** Creates only the fixed envelope fields used by the webhook dispatcher. */
function event(type: string, object: object): Stripe.Event {
  return {
    id: "evt_TestEvent123",
    type,
    created: 1_784_916_100,
    livemode: false,
    data: { object },
  } as unknown as Stripe.Event;
}

describe("order-tolerant Stripe webhook processing", () => {
  beforeEach(() => {
    vi.mocked(hasProjectedLifetimePayment).mockReset();
    vi.mocked(hasProjectedLifetimePayment).mockResolvedValue(false);
    vi.mocked(synchronizeCurrentSubscription).mockReset();
    vi.mocked(synchronizeLifetimeSession).mockReset();
    vi.mocked(synchronizeLifetimeCharge).mockReset();
    vi.mocked(withStripeProjectionLease).mockReset();
    vi.mocked(withStripeProjectionLease).mockImplementation(
      async (_admin, _key, work) => work(CLAIM_TOKEN),
    );
    vi.mocked(synchronizeSupportSession).mockReset();
    vi.mocked(synchronizeSupportRefund).mockReset();
    vi.mocked(synchronizeSupportDispute).mockReset();
    vi.mocked(synchronizeArcadeSession).mockReset();
    vi.mocked(synchronizeArcadeCharge).mockReset();
  });

  it("leases and rehydrates the current subscription by provider ID", async () => {
    const stripe = {} as Stripe;
    const admin = {} as SupabaseClient;
    const payload = { id: "sub_Current123", status: "active" };

    await expect(
      processStripeWebhookEvent(
        admin,
        stripe,
        CONFIGURATION,
        event("customer.subscription.updated", payload),
      ),
    ).resolves.toBe("processed");
    expect(synchronizeCurrentSubscription).toHaveBeenCalledWith(
      admin,
      stripe,
      "sub_Current123",
      CONFIGURATION,
      expect.objectContaining({ id: "evt_TestEvent123" }),
    );
  });

  it("rehydrates invoice context and stores only a bounded signal", async () => {
    const invoice = {
      id: "in_TestInvoice123",
      customer: "cus_TestCustomer123",
      parent: {
        subscription_details: { subscription: "sub_Current123" },
      },
      status: "paid",
      amount_paid: 500,
      amount_due: 500,
      currency: "usd",
      livemode: false,
    };
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: vi.fn().mockReturnValue({ upsert }),
    } as unknown as SupabaseClient;
    const stripe = {
      invoices: { retrieve: vi.fn().mockResolvedValue(invoice) },
    } as unknown as Stripe;

    await processStripeWebhookEvent(
      admin,
      stripe,
      CONFIGURATION,
      event("invoice.paid", { id: invoice.id, description: "private" }),
    );
    expect(upsert).toHaveBeenCalledWith(
      {
        event_id: "evt_TestEvent123",
        signal_kind: "invoice_paid",
        stripe_object_id: invoice.id,
        stripe_customer_id: "cus_TestCustomer123",
        stripe_subscription_id: "sub_Current123",
        status: "paid",
        amount: 500,
        currency: "usd",
        occurred_at: new Date(1_784_916_100 * 1000).toISOString(),
      },
      { onConflict: "event_id" },
    );
    expect(JSON.stringify(upsert.mock.calls)).not.toContain("private");
    expect(synchronizeCurrentSubscription).toHaveBeenCalledWith(
      admin,
      stripe,
      "sub_Current123",
      CONFIGURATION,
      expect.anything(),
    );
  });

  it("ignores unrelated signed events without a provider or database call", async () => {
    const admin = { from: vi.fn() } as unknown as SupabaseClient;
    const stripe = {
      subscriptions: { retrieve: vi.fn() },
    } as unknown as Stripe;
    await expect(
      processStripeWebhookEvent(
        admin,
        stripe,
        CONFIGURATION,
        event("customer.created", { id: "cus_TestCustomer123" }),
      ),
    ).resolves.toBe("ignored");
    expect(admin.from).not.toHaveBeenCalled();
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it("rehydrates and projects one-time support Checkout events", async () => {
    const current = {
      id: "cs_test_SupportSession123",
      mode: "payment",
      livemode: false,
      metadata: { purpose: "biblequest_support" },
    };
    const stripe = {
      checkout: {
        sessions: { retrieve: vi.fn().mockResolvedValue(current) },
      },
    } as unknown as Stripe;
    const admin = {} as SupabaseClient;
    const supportEvent = event("checkout.session.expired", {
      id: "cs_test_SupportSession123",
      mode: "payment",
    });

    await expect(
      processStripeWebhookEvent(
        admin,
        stripe,
        CONFIGURATION,
        supportEvent,
      ),
    ).resolves.toBe("processed");
    expect(synchronizeSupportSession).toHaveBeenCalledWith(
      admin,
      current,
      supportEvent,
    );
    expect(synchronizeCurrentSubscription).not.toHaveBeenCalled();
  });

  it("rehydrates and projects one-time lifetime Checkout events", async () => {
    const current = {
      id: "cs_test_LifetimeSession123",
      mode: "payment",
      livemode: false,
      status: "complete",
      payment_status: "paid",
      payment_intent: "pi_LifetimeIntent123",
      metadata: {
        purpose: "biblequest_plus",
        billing_interval: "lifetime",
      },
    };
    const paymentIntent = {
      id: "pi_LifetimeIntent123",
      latest_charge: { id: "ch_LifetimeCharge123" },
    };
    const stripe = {
      checkout: {
        sessions: { retrieve: vi.fn().mockResolvedValue(current) },
      },
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue(paymentIntent),
      },
      disputes: {
        list: vi.fn().mockResolvedValue({ data: [], has_more: false }),
      },
    } as unknown as Stripe;
    const admin = {} as SupabaseClient;
    const lifetimeEvent = event("checkout.session.completed", {
      id: "cs_test_LifetimeSession123",
    });

    await expect(
      processStripeWebhookEvent(
        admin,
        stripe,
        CONFIGURATION,
        lifetimeEvent,
      ),
    ).resolves.toBe("processed");
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith(
      "cs_test_LifetimeSession123",
      { expand: ["line_items.data.price.product"] },
    );
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith(
      "pi_LifetimeIntent123",
      { expand: ["latest_charge"] },
    );
    expect(synchronizeLifetimeSession).toHaveBeenCalledWith(
      admin,
      current,
      paymentIntent,
      { data: [], hasMore: false },
      CONFIGURATION,
      lifetimeEvent,
      CLAIM_TOKEN,
    );
    expect(withStripeProjectionLease).toHaveBeenCalledWith(
      admin,
      "lifetime:pi_LifetimeIntent123",
      expect.any(Function),
    );
    expect(synchronizeCurrentSubscription).not.toHaveBeenCalled();
  });

  it("acknowledges expired and unpaid lifetime sessions without fulfillment", async () => {
    const current = {
      id: "cs_test_UnpaidLifetime123",
      mode: "payment",
      livemode: false,
      status: "expired",
      payment_status: "unpaid",
      payment_intent: null,
      metadata: {
        purpose: "biblequest_plus",
        billing_interval: "lifetime",
      },
    };
    const stripe = {
      checkout: {
        sessions: { retrieve: vi.fn().mockResolvedValue(current) },
      },
      paymentIntents: { retrieve: vi.fn() },
    } as unknown as Stripe;

    await expect(
      processStripeWebhookEvent(
        {} as SupabaseClient,
        stripe,
        CONFIGURATION,
        event("checkout.session.expired", { id: current.id }),
      ),
    ).resolves.toBe("processed");
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(synchronizeLifetimeSession).not.toHaveBeenCalled();
  });

  it("rehydrates and projects a paid arcade Checkout event", async () => {
    const current = {
      id: "cs_test_ArcadeSession123",
      mode: "payment",
      livemode: false,
      status: "complete",
      payment_status: "paid",
      payment_intent: "pi_ArcadeIntent123",
      metadata: { purpose: "biblequest_arcade" },
    };
    const paymentIntent = {
      id: "pi_ArcadeIntent123",
      latest_charge: { id: "ch_ArcadeCharge123" },
    };
    const stripe = {
      checkout: {
        sessions: { retrieve: vi.fn().mockResolvedValue(current) },
      },
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue(paymentIntent),
      },
    } as unknown as Stripe;
    const admin = {} as SupabaseClient;
    const arcadeEvent = event("checkout.session.completed", {
      id: current.id,
    });

    await expect(
      processStripeWebhookEvent(
        admin,
        stripe,
        CONFIGURATION,
        arcadeEvent,
      ),
    ).resolves.toBe("processed");
    expect(synchronizeArcadeSession).toHaveBeenCalledWith(
      admin,
      current,
      paymentIntent,
      CONFIGURATION,
      arcadeEvent,
    );
  });

  it("leases a refund before routing when no lifetime row exists", async () => {
    vi.mocked(synchronizeSupportRefund).mockResolvedValue(true);
    const refund = {
      id: "re_SupportRefund123",
      charge: "ch_SupportCharge123",
      status: "succeeded",
      amount: 1_000,
      currency: "usd",
      livemode: false,
    };
    const charge = {
      id: "ch_SupportCharge123",
      payment_intent: "pi_SupportIntent123",
      customer: "cus_SupportCustomer123",
      livemode: false,
    };
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: vi.fn().mockReturnValue({ upsert }),
    } as unknown as SupabaseClient;
    const stripe = {
      refunds: { retrieve: vi.fn().mockResolvedValue(refund) },
      charges: { retrieve: vi.fn().mockResolvedValue(charge) },
      invoicePayments: {
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
    } as unknown as Stripe;
    const refundEvent = event("refund.updated", {
      id: refund.id,
    });

    await processStripeWebhookEvent(
      admin,
      stripe,
      CONFIGURATION,
      refundEvent,
    );
    expect(synchronizeSupportRefund).toHaveBeenCalledWith(
      admin,
      charge,
      refundEvent,
    );
    expect(withStripeProjectionLease).toHaveBeenCalledWith(
      admin,
      "lifetime:pi_SupportIntent123",
      expect.any(Function),
    );
    expect(hasProjectedLifetimePayment).toHaveBeenCalledWith(
      admin,
      "pi_SupportIntent123",
    );
    expect(stripe.invoicePayments.list).not.toHaveBeenCalled();
  });

  it("leases a dispute before routing when no lifetime row exists", async () => {
    vi.mocked(synchronizeSupportDispute).mockResolvedValue(true);
    const dispute = {
      id: "dp_SupportDispute123",
      charge: "ch_SupportCharge123",
      status: "needs_response",
      amount: 1_000,
      currency: "usd",
      livemode: false,
    };
    const charge = {
      id: "ch_SupportCharge123",
      payment_intent: "pi_SupportIntent123",
      customer: "cus_SupportCustomer123",
      livemode: false,
    };
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: vi.fn().mockReturnValue({ upsert }),
    } as unknown as SupabaseClient;
    const stripe = {
      disputes: { retrieve: vi.fn().mockResolvedValue(dispute) },
      charges: { retrieve: vi.fn().mockResolvedValue(charge) },
      invoicePayments: {
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
    } as unknown as Stripe;
    const disputeEvent = event("charge.dispute.created", {
      id: dispute.id,
    });

    await processStripeWebhookEvent(
      admin,
      stripe,
      CONFIGURATION,
      disputeEvent,
    );
    expect(synchronizeSupportDispute).toHaveBeenCalledWith(
      admin,
      charge,
      dispute,
      disputeEvent,
    );
    expect(withStripeProjectionLease).toHaveBeenCalledWith(
      admin,
      "lifetime:pi_SupportIntent123",
      expect.any(Function),
    );
    expect(stripe.invoicePayments.list).not.toHaveBeenCalled();
  });

  it("recovers an out-of-order support dispute from intent metadata", async () => {
    vi.mocked(synchronizeLifetimeCharge).mockResolvedValue(false);
    vi.mocked(synchronizeSupportDispute)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const dispute = {
      id: "du_SupportDisputeOutOfOrder123",
      charge: "ch_SupportChargeOutOfOrder123",
      status: "needs_response",
      amount: 2_500,
      currency: "usd",
      livemode: false,
    };
    const charge = {
      id: "ch_SupportChargeOutOfOrder123",
      payment_intent: "pi_SupportIntentOutOfOrder123",
      customer: "cus_SupportCustomerOutOfOrder123",
      livemode: false,
    };
    const requestId = "d2000000-0000-4000-8000-000000000002";
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: vi.fn().mockReturnValue({ upsert }),
    } as unknown as SupabaseClient;
    const stripe = {
      disputes: { retrieve: vi.fn().mockResolvedValue(dispute) },
      charges: { retrieve: vi.fn().mockResolvedValue(charge) },
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue({
          metadata: {
            purpose: "biblequest_support",
            support_request_id: requestId,
          },
        }),
      },
      invoicePayments: { list: vi.fn() },
    } as unknown as Stripe;
    const disputeEvent = event("charge.dispute.created", {
      id: dispute.id,
    });

    await expect(
      processStripeWebhookEvent(
        admin,
        stripe,
        CONFIGURATION,
        disputeEvent,
      ),
    ).resolves.toBe("processed");
    expect(synchronizeSupportDispute).toHaveBeenNthCalledWith(
      2,
      admin,
      charge,
      dispute,
      disputeEvent,
      requestId,
    );
    expect(stripe.invoicePayments.list).not.toHaveBeenCalled();
  });

  it("categorizes provider failures without retaining provider details", async () => {
    vi.mocked(synchronizeCurrentSubscription).mockRejectedValue({
      type: "StripeAPIError",
      message: "private",
    });
    const stripe = {} as Stripe;

    await expect(
      processStripeWebhookEvent(
        {} as SupabaseClient,
        stripe,
        CONFIGURATION,
        event("customer.subscription.deleted", {
          id: "sub_Current123",
        }),
      ),
    ).rejects.toMatchObject({
      category: "provider",
      message: "Stripe webhook processing failed.",
    } satisfies Partial<StripeWebhookProcessingError>);
  });

  it("categorizes a current support object mismatch as invalid", async () => {
    const mismatch = new Error("private mismatch");
    mismatch.name = "StripeSupportProjectionError";
    vi.mocked(synchronizeSupportSession).mockRejectedValue(mismatch);
    const stripe = {
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cs_test_SupportSession123",
            mode: "payment",
            livemode: false,
            metadata: { purpose: "biblequest_support" },
          }),
        },
      },
    } as unknown as Stripe;

    await expect(
      processStripeWebhookEvent(
        {} as SupabaseClient,
        stripe,
        CONFIGURATION,
        event("checkout.session.completed", {
          id: "cs_test_SupportSession123",
        }),
      ),
    ).rejects.toMatchObject({
      category: "invalid",
      message: "Stripe webhook processing failed.",
    });
  });

  it("rejects an event from the wrong Stripe mode", async () => {
    const wrongMode = event("customer.subscription.updated", {
      id: "sub_Current123",
    });
    wrongMode.livemode = true;
    await expect(
      processStripeWebhookEvent(
        {} as SupabaseClient,
        {} as Stripe,
        CONFIGURATION,
        wrongMode,
      ),
    ).rejects.toMatchObject({ category: "invalid" });
  });
});
