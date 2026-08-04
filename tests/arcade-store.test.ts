import { readFileSync } from "node:fs";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/records.server", () => ({
  userForStripeCustomer: vi.fn(),
}));

import { userForStripeCustomer } from "@/lib/billing/records.server";
import type { StripeBillingConfiguration } from "@/lib/billing/config";
import {
  StripeArcadeProjectionError,
  synchronizeArcadeSession,
} from "@/lib/games/arcade/records.server";
import { arcadeStatusFromRows } from "@/lib/games/arcade/server";

const CONFIGURATION: StripeBillingConfiguration = {
  status: "configured",
  mode: "test",
  secretKey: `sk_test_${"a".repeat(24)}`,
  publishableKey: `pk_test_${"b".repeat(24)}`,
  webhookSecret: `whsec_${"c".repeat(24)}`,
  priceIds: {
    monthly: "price_Monthly123",
    annual: "price_Annual123",
    lifetime: "price_Lifetime123",
  },
  appOrigin: "https://preview.biblequest.test",
  livemode: false,
  purchasesEnabled: true,
  supportEnabled: false,
  arcadeEnabled: true,
  arcadePriceIds: {
    questionSkip: "price_QuestionSkip123",
    gamePass: "price_GamePass123",
  },
};

/** Builds the fully expanded Stripe shape required by fulfillment. */
function paidSession(unitAmount = 99) {
  const charge = {
    id: "ch_Arcade123",
    paid: true,
    payment_intent: "pi_Arcade123",
    amount: unitAmount,
    amount_refunded: 0,
    disputed: false,
    currency: "usd",
  };
  const paymentIntent = {
    id: "pi_Arcade123",
    customer: "cus_Arcade123",
    status: "succeeded",
    amount_received: unitAmount,
    currency: "usd",
    latest_charge: charge,
  } as unknown as Stripe.PaymentIntent;
  const session = {
    id: "cs_test_Arcade123",
    mode: "payment",
    livemode: false,
    status: "complete",
    payment_status: "paid",
    customer: "cus_Arcade123",
    payment_intent: "pi_Arcade123",
    client_reference_id: "d6000000-0000-4000-8000-000000000006",
    metadata: {
      purpose: "biblequest_arcade",
      biblequest_user_id: "d6000000-0000-4000-8000-000000000006",
      arcade_product: "question-skip",
    },
    amount_total: unitAmount,
    currency: "usd",
    line_items: {
      data: [
        {
          quantity: 1,
          price: {
            id: "price_QuestionSkip123",
            type: "one_time",
            recurring: null,
            unit_amount: unitAmount,
            currency: "usd",
            product: "prod_QuestionSkip123",
          },
        },
      ],
    },
  } as unknown as Stripe.Checkout.Session;
  return { paymentIntent, session };
}

describe("Arcade Stripe store", () => {
  beforeEach(() => {
    vi.mocked(userForStripeCustomer).mockReset();
    vi.mocked(userForStripeCustomer).mockResolvedValue(
      "d6000000-0000-4000-8000-000000000006",
    );
  });

  it("reduces sealed order rows to safe ownership and inventory", () => {
    expect(
      arcadeStatusFromRows([
        {
          product_key: "question-skip",
          units_total: 1,
          units_consumed: 0,
          outcome_status: "completed",
        },
        {
          product_key: "question-skip",
          units_total: 1,
          units_consumed: 1,
          outcome_status: "completed",
        },
        {
          product_key: "game-pass",
          units_total: 1,
          units_consumed: 0,
          outcome_status: "dispute_won",
        },
        {
          product_key: "game-pass",
          units_total: 1,
          units_consumed: 0,
          outcome_status: "refunded",
        },
      ]),
    ).toEqual({ gamePass: true, questionSkips: 1 });
  });

  it("fulfills one exact paid product idempotently", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: vi.fn().mockReturnValue({ upsert }),
    } as unknown as SupabaseClient;
    const { session, paymentIntent } = paidSession();

    await expect(
      synchronizeArcadeSession(
        admin,
        session,
        paymentIntent,
        CONFIGURATION,
        { id: "evt_Arcade123", created: 1_784_916_100 },
      ),
    ).resolves.toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "d6000000-0000-4000-8000-000000000006",
        product_key: "question-skip",
        amount_total: 99,
        outcome_status: "completed",
      }),
      {
        onConflict: "stripe_checkout_session_id",
        ignoreDuplicates: true,
      },
    );
  });

  it("rejects a Stripe amount that differs from the fixed catalogue", async () => {
    const admin = {
      from: vi.fn(),
    } as unknown as SupabaseClient;
    const { session, paymentIntent } = paidSession(100);
    await expect(
      synchronizeArcadeSession(
        admin,
        session,
        paymentIntent,
        CONFIGURATION,
        { id: "evt_Arcade123", created: 1_784_916_100 },
      ),
    ).rejects.toBeInstanceOf(StripeArcadeProjectionError);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("keeps product IDs, prices, and fulfillment on server boundaries", () => {
    const checkout = readFileSync(
      "src/app/api/arcade/checkout/route.ts",
      "utf8",
    );
    const webhook = readFileSync(
      "src/lib/billing/webhook.server.ts",
      "utf8",
    );
    const migration = readFileSync(
      "supabase/migrations/0036_arcade_store_purchases.sql",
      "utf8",
    );
    expect(checkout).toContain("isArcadeProductId(");
    expect(checkout).toContain("stripe.prices.retrieve(priceId)");
    expect(checkout).not.toMatch(/body[^;\n]*price/i);
    expect(checkout).toContain('"https://checkout.stripe.com"');
    expect(webhook).toContain("synchronizeArcadeSession(");
    expect(migration).toContain("consume_arcade_question_skip");
    expect(migration).toContain("force row level security");
  });
});
