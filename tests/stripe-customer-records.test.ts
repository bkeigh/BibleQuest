import type Stripe from "stripe";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { customerForUser } from "@/lib/billing/records.server";
import type { StripeBillingConfiguration } from "@/lib/billing/config";

const USER = {
  id: "d1000000-0000-4000-8000-000000000001",
  email: "owner@example.test",
} as User;
const OTHER_USER_ID = "d2000000-0000-4000-8000-000000000002";
const CUSTOMER_ID = "cus_TestBibleQuest123";
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

type Lookup = { data: unknown; error: unknown };

/** Builds the sealed mapping query with deterministic lookup responses. */
function mappingAdmin(
  lookups: Lookup[],
  insertError: unknown = null,
): {
  admin: SupabaseClient;
  eq: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
} {
  const maybeSingle = vi.fn();
  for (const lookup of lookups) maybeSingle.mockResolvedValueOnce(lookup);
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = maybeSingle;
  query.insert = vi.fn().mockResolvedValue({ error: insertError });
  return {
    admin: {
      from: vi.fn(() => query),
    } as unknown as SupabaseClient,
    eq: query.eq,
    insert: query.insert,
    maybeSingle,
  };
}

/** Builds the one Stripe Customer creation method used by this boundary. */
function customerStripe(
  customer: { id: string; livemode: boolean } = {
    id: CUSTOMER_ID,
    livemode: false,
  },
): { stripe: Stripe; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn().mockResolvedValue(customer);
  return {
    stripe: { customers: { create } } as unknown as Stripe,
    create,
  };
}

describe("sealed Stripe Customer mapping", () => {
  it("reuses only the verified account's matching-mode Customer", async () => {
    const { admin, eq, insert } = mappingAdmin([
      {
        data: {
          user_id: USER.id,
          stripe_customer_id: CUSTOMER_ID,
          livemode: false,
        },
        error: null,
      },
    ]);
    const { stripe, create } = customerStripe();

    await expect(
      customerForUser(admin, stripe, USER, CONFIGURATION),
    ).resolves.toBe(CUSTOMER_ID);
    expect(eq).toHaveBeenCalledWith("user_id", USER.id);
    expect(create).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects another user's, malformed, or wrong-mode mapping", async () => {
    for (const data of [
      {
        user_id: OTHER_USER_ID,
        stripe_customer_id: CUSTOMER_ID,
        livemode: false,
      },
      {
        user_id: USER.id,
        stripe_customer_id: "not-a-customer",
        livemode: false,
      },
      {
        user_id: USER.id,
        stripe_customer_id: CUSTOMER_ID,
        livemode: true,
      },
    ]) {
      const { admin, insert } = mappingAdmin([{ data, error: null }]);
      const { stripe, create } = customerStripe();

      await expect(
        customerForUser(admin, stripe, USER, CONFIGURATION),
      ).rejects.toThrow("Stripe customer unavailable.");
      expect(create).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
    }
  });

  it("creates and inserts one idempotent Customer from verified identity", async () => {
    const { admin, insert } = mappingAdmin([{ data: null, error: null }]);
    const { stripe, create } = customerStripe();

    await expect(
      customerForUser(admin, stripe, USER, CONFIGURATION),
    ).resolves.toBe(CUSTOMER_ID);
    expect(create).toHaveBeenCalledWith(
      {
        email: USER.email,
        metadata: {
          biblequest_user_id: USER.id,
          purpose: "biblequest_plus",
        },
      },
      { idempotencyKey: `biblequest-customer-${USER.id}` },
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER.id,
        stripe_customer_id: CUSTOMER_ID,
        livemode: false,
      }),
    );
  });

  it("rejects a newly created Customer from the wrong mode", async () => {
    const { admin, insert } = mappingAdmin([{ data: null, error: null }]);
    const { stripe } = customerStripe({ id: CUSTOMER_ID, livemode: true });

    await expect(
      customerForUser(admin, stripe, USER, CONFIGURATION),
    ).rejects.toThrow("Stripe customer unavailable.");
    expect(insert).not.toHaveBeenCalled();
  });

  it("recovers only the exact same mapping after an ambiguous duplicate insert", async () => {
    const mapping = {
      user_id: USER.id,
      stripe_customer_id: CUSTOMER_ID,
      livemode: false,
    };
    const { admin, maybeSingle } = mappingAdmin(
      [
        { data: null, error: null },
        { data: mapping, error: null },
      ],
      { code: "23505" },
    );
    const { stripe } = customerStripe();

    await expect(
      customerForUser(admin, stripe, USER, CONFIGURATION),
    ).resolves.toBe(CUSTOMER_ID);
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });

  it("never reassigns a conflicting Customer mapping to the current user", async () => {
    const { admin, maybeSingle } = mappingAdmin(
      [
        { data: null, error: null },
        {
          data: {
            user_id: OTHER_USER_ID,
            stripe_customer_id: CUSTOMER_ID,
            livemode: false,
          },
          error: null,
        },
      ],
      { code: "23505" },
    );
    const { stripe } = customerStripe();

    await expect(
      customerForUser(admin, stripe, USER, CONFIGURATION),
    ).rejects.toThrow("Stripe customer unavailable.");
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });
});
