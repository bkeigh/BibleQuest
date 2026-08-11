import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mappedStripeCustomerForUser,
  stripeBillingPortalUrl,
} from "@/lib/billing/records.server";

const USER_ID = "d1000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = "cus_TestPortalCustomer123";
const RETURN_URL =
  "https://preview.biblequest.test/app/plus?portal=returned";
const PORTAL_URL =
  "https://billing.stripe.com/p/session/test_BibleQuestPortal123";

/** Builds the exact fluent query surface used by the sealed mapping lookup. */
function mappingAdmin(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return {
    client: { from } as unknown as SupabaseClient,
    from,
    select,
    eq,
  };
}

describe("sealed Stripe Customer mapping", () => {
  it("queries by the verified owner and returns only a valid mode match", async () => {
    const admin = mappingAdmin({
      data: {
        user_id: USER_ID,
        stripe_customer_id: CUSTOMER_ID,
        livemode: false,
      },
      error: null,
    });

    await expect(
      mappedStripeCustomerForUser(admin.client, USER_ID, false),
    ).resolves.toBe(CUSTOMER_ID);
    expect(admin.from).toHaveBeenCalledWith("stripe_customers");
    expect(admin.select).toHaveBeenCalledWith(
      "user_id,stripe_customer_id,livemode",
    );
    expect(admin.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("returns null for no mapping without inventing a Customer", async () => {
    const admin = mappingAdmin({ data: null, error: null });

    await expect(
      mappedStripeCustomerForUser(admin.client, USER_ID, false),
    ).resolves.toBeNull();
  });

  it("fails closed on database, livemode, and malformed mapping state", async () => {
    for (const result of [
      { data: null, error: { code: "PGRST205" } },
      {
        data: {
          user_id: USER_ID,
          stripe_customer_id: CUSTOMER_ID,
          livemode: true,
        },
        error: null,
      },
      {
        data: {
          user_id: USER_ID,
          stripe_customer_id: "cus_Attacker/Injected",
          livemode: false,
        },
        error: null,
      },
      {
        data: {
          user_id: "d1000000-0000-4000-8000-000000000002",
          stripe_customer_id: CUSTOMER_ID,
          livemode: false,
        },
        error: null,
      },
    ]) {
      const admin = mappingAdmin(result);
      await expect(
        mappedStripeCustomerForUser(admin.client, USER_ID, false),
      ).rejects.toThrow("Stripe customer mapping unavailable.");
    }
  });
});

describe("Stripe Billing Portal destination", () => {
  it("accepts only the full expected server and provider echo", () => {
    expect(
      stripeBillingPortalUrl(
        {
          customer: CUSTOMER_ID,
          livemode: false,
          return_url: RETURN_URL,
          url: PORTAL_URL,
        },
        { customerId: CUSTOMER_ID, livemode: false, returnUrl: RETURN_URL },
      ),
    ).toBe(PORTAL_URL);
  });

  it("rejects every mismatched contract or non-exact Stripe origin", () => {
    const base = {
      customer: CUSTOMER_ID,
      livemode: false,
      return_url: RETURN_URL,
      url: PORTAL_URL,
    };
    for (const session of [
      { ...base, customer: "cus_AnotherUser" },
      { ...base, livemode: true },
      { ...base, return_url: "https://evil.test" },
      { ...base, url: "https://billing.stripe.com.evil.test/session" },
      { ...base, url: "https://attacker@billing.stripe.com/session" },
      { ...base, url: null },
    ]) {
      expect(
        stripeBillingPortalUrl(session, {
          customerId: CUSTOMER_ID,
          livemode: false,
          returnUrl: RETURN_URL,
        }),
      ).toBeNull();
    }
  });
});
