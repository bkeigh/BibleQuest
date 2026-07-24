import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/records.server", () => ({
  synchronizeSubscription: vi.fn(),
}));

import { synchronizeSubscription } from "@/lib/billing/records.server";
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
  },
  appOrigin: "https://preview.biblequest.test",
  livemode: false,
  purchasesEnabled: true,
} satisfies StripeBillingConfiguration;

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
    vi.mocked(synchronizeSubscription).mockReset();
  });

  it("rehydrates the current subscription instead of trusting event payload", async () => {
    const current = { id: "sub_Current123", livemode: false };
    const retrieve = vi.fn().mockResolvedValue(current);
    const stripe = {
      subscriptions: { retrieve },
    } as unknown as Stripe;
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
    expect(retrieve).toHaveBeenCalledWith("sub_Current123", {
      expand: ["items.data.price.product", "latest_invoice"],
    });
    expect(synchronizeSubscription).toHaveBeenCalledWith(
      admin,
      current,
      CONFIGURATION,
      expect.objectContaining({ id: "evt_TestEvent123" }),
    );
    expect(synchronizeSubscription).not.toHaveBeenCalledWith(
      admin,
      payload,
      CONFIGURATION,
      expect.anything(),
    );
  });

  it("rehydrates invoice context and stores only a bounded signal", async () => {
    const current = { id: "sub_Current123", livemode: false };
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
    };
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: vi.fn().mockReturnValue({ upsert }),
    } as unknown as SupabaseClient;
    const stripe = {
      invoices: { retrieve: vi.fn().mockResolvedValue(invoice) },
      subscriptions: { retrieve: vi.fn().mockResolvedValue(current) },
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
    expect(synchronizeSubscription).toHaveBeenCalledWith(
      admin,
      current,
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

  it("categorizes provider failures without retaining provider details", async () => {
    const stripe = {
      subscriptions: {
        retrieve: vi
          .fn()
          .mockRejectedValue({ type: "StripeAPIError", message: "private" }),
      },
    } as unknown as Stripe;

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
