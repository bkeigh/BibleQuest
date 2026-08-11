import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticatedContext: vi.fn(),
  claim: vi.fn(),
  configuration: vi.fn(),
  contractReady: vi.fn(),
  createAdmin: vi.fn(),
  createSession: vi.fn(),
  createStripe: vi.fn(),
  customer: vi.fn(),
  recordFailure: vi.fn(),
  retrievePlans: vi.fn(),
  subscriptions: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/config.server", () => ({
  requireStripeBillingConfiguration: mocks.configuration,
}));
vi.mock("@/lib/billing/records.server", () => ({
  claimStripeAction: mocks.claim,
  customerForUser: mocks.customer,
  stripeActionRateLimited: (retryAfterSeconds: number) =>
    Response.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: {
          "Cache-Control": "private, no-store",
          "Retry-After": String(retryAfterSeconds),
        },
      },
    ),
}));
vi.mock("@/lib/billing/server", () => ({
  stripeBillingContractReady: mocks.contractReady,
}));
vi.mock("@/lib/billing/stripe.server", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/billing/stripe.server")
  >();
  return {
    ...actual,
    createStripe: mocks.createStripe,
    retrieveBillingPlans: mocks.retrievePlans,
  };
});
vi.mock("@/lib/observability/server-failures", () => ({
  recordServerFailure: mocks.recordFailure,
}));
vi.mock("@/lib/supabase/admin.server", () => ({
  createAdminSupabase: mocks.createAdmin,
}));
vi.mock("@/lib/supabase/authenticated.server", () => ({
  authenticatedServerContext: mocks.authenticatedContext,
}));

import { POST } from "@/app/api/billing/checkout/route";
import { NATIVE_APP_ORIGIN } from "@/lib/http/native-origin";

const NATIVE_LATCH = "BIBLEQUEST_NATIVE_API_ORIGIN_ENABLED";
const USER_ID = "d1000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "d2000000-0000-4000-8000-000000000002";
const CLAIM_TOKEN = "d3000000-0000-4000-8000-000000000003";
const CUSTOMER_ID = "cus_TestBibleQuest123";
const ACCESS_TOKEN = "header.payload.signature";
const CHECKOUT_URL =
  "https://checkout.stripe.com/c/pay/cs_test_BibleQuest123";
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
} as const;
const PLANS = {
  monthly: {
    interval: "monthly",
    unitAmount: 899,
    currency: "usd",
    priceId: CONFIGURATION.priceIds.monthly,
    productId: "prod_TestPlus123",
  },
  annual: {
    interval: "annual",
    unitAmount: 8_999,
    currency: "usd",
    priceId: CONFIGURATION.priceIds.annual,
    productId: "prod_TestPlus123",
  },
  lifetime: {
    interval: "lifetime",
    unitAmount: 14_499,
    currency: "usd",
    priceId: CONFIGURATION.priceIds.lifetime,
    productId: "prod_TestPlus123",
  },
} as const;

/** Builds a request from the reviewed native origin by default. */
function checkoutRequest(
  body: unknown = { interval: "monthly" },
  origin: string | null = NATIVE_APP_ORIGIN,
  authorization: string | null = `Bearer ${ACCESS_TOKEN}`,
): Request {
  const headers = new Headers({
    "Content-Type": "application/json",
    Host: "preview.biblequest.test",
  });
  if (origin !== null) headers.set("Origin", origin);
  if (authorization !== null) {
    headers.set("Authorization", authorization);
  }
  return new Request(
    "https://preview.biblequest.test/api/billing/checkout",
    { method: "POST", headers, body: JSON.stringify(body) },
  );
}

/** Returns the complete provider shape required before exposing its URL. */
function session(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "cs_test_BibleQuest123",
    mode: "subscription",
    livemode: false,
    status: "open",
    payment_status: "unpaid",
    customer: CUSTOMER_ID,
    client_reference_id: USER_ID,
    metadata: {
      purpose: "biblequest_plus",
      biblequest_user_id: USER_ID,
      billing_interval: "monthly",
    },
    url: CHECKOUT_URL,
    ...overrides,
  };
}

describe("authenticated Plus Checkout route", () => {
  beforeEach(() => {
    process.env[NATIVE_LATCH] = "true";
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.in = mocks.subscriptions;
    mocks.subscriptions.mockReset().mockResolvedValue({ count: 0, error: null });
    mocks.createAdmin.mockReset().mockReturnValue({
      from: vi.fn(() => query),
    });
    mocks.authenticatedContext.mockReset().mockResolvedValue({
      supabase: { role: "verified-bearer" },
      user: { id: USER_ID, email: "owner@example.test" },
    });
    mocks.configuration.mockReset().mockReturnValue(CONFIGURATION);
    mocks.contractReady.mockReset().mockResolvedValue(true);
    mocks.claim.mockReset().mockResolvedValue({
      claimed: true,
      claimToken: CLAIM_TOKEN,
    });
    mocks.customer.mockReset().mockResolvedValue(CUSTOMER_ID);
    mocks.retrievePlans.mockReset().mockResolvedValue(PLANS);
    mocks.createSession.mockReset().mockResolvedValue(session());
    mocks.createStripe.mockReset().mockReturnValue({
      checkout: { sessions: { create: mocks.createSession } },
    });
    mocks.recordFailure.mockReset();
  });

  afterEach(() => {
    delete process.env[NATIVE_LATCH];
  });

  it("creates one mobile-context Session from verified server values", async () => {
    const response = await POST(checkoutRequest());

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ url: CHECKOUT_URL });
    expect(mocks.customer).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ id: USER_ID }),
      CONFIGURATION,
    );
    expect(mocks.createSession).toHaveBeenCalledWith(
      {
        mode: "subscription",
        customer: CUSTOMER_ID,
        client_reference_id: USER_ID,
        line_items: [
          { price: CONFIGURATION.priceIds.monthly, quantity: 1 },
        ],
        origin_context: "mobile_app",
        success_url:
          "https://preview.biblequest.test/app/plus?checkout=returned",
        cancel_url:
          "https://preview.biblequest.test/app/plus?checkout=cancelled",
        metadata: {
          purpose: "biblequest_plus",
          biblequest_user_id: USER_ID,
          billing_interval: "monthly",
        },
        subscription_data: {
          metadata: {
            purpose: "biblequest_plus",
            biblequest_user_id: USER_ID,
            billing_interval: "monthly",
          },
        },
      },
      {
        idempotencyKey:
          `biblequest-checkout-${USER_ID}-monthly-${CLAIM_TOKEN}`,
      },
    );
    expect(JSON.stringify(mocks.createSession.mock.calls)).not.toContain(
      ACCESS_TOKEN,
    );
    expect(JSON.stringify(mocks.createSession.mock.calls)).not.toContain(
      "owner@example.test",
    );
  });

  it("preserves hosted web Checkout without claiming mobile context", async () => {
    const response = await POST(
      checkoutRequest(
        { interval: "monthly" },
        "https://preview.biblequest.test",
        null,
      ),
    );

    expect(response.status).toBe(201);
    const [parameters] = mocks.createSession.mock.calls[0];
    expect(parameters).not.toHaveProperty("origin_context");
  });

  it("uses the allowlisted one-time Price and payment mode for lifetime Plus", async () => {
    mocks.createSession.mockResolvedValue(
      session({
        mode: "payment",
        metadata: {
          purpose: "biblequest_plus",
          biblequest_user_id: USER_ID,
          billing_interval: "lifetime",
        },
      }),
    );

    const response = await POST(checkoutRequest({ interval: "lifetime" }));

    expect(response.status).toBe(201);
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        origin_context: "mobile_app",
        line_items: [
          { price: CONFIGURATION.priceIds.lifetime, quantity: 1 },
        ],
        payment_intent_data: {
          description: "BibleQuest Plus lifetime access",
          metadata: {
            purpose: "biblequest_plus",
            biblequest_user_id: USER_ID,
            billing_interval: "lifetime",
          },
        },
      }),
      expect.anything(),
    );
  });

  it("rejects missing, wrong, and lookalike origins before authentication", async () => {
    for (const origin of [
      null,
      "https://evil.test",
      "capacitor://localhost.evil.test",
      "null",
    ]) {
      const response = await POST(checkoutRequest(undefined, origin));
      expect(response.status).toBe(403);
    }
    expect(mocks.authenticatedContext).not.toHaveBeenCalled();
    expect(mocks.createStripe).not.toHaveBeenCalled();
  });

  it("stops when bearer verification rejects a malformed token", async () => {
    mocks.authenticatedContext.mockResolvedValue(
      Response.json(
        { error: "unauthorized" },
        {
          status: 401,
          headers: { "Cache-Control": "private, no-store" },
        },
      ),
    );

    const response = await POST(
      checkoutRequest({ interval: "monthly" }, NATIVE_APP_ORIGIN, "Bearer bad"),
    );

    expect(response.status).toBe(401);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.createStripe).not.toHaveBeenCalled();
  });

  it("rejects forged identity, Customer, Price, quantity, mode, and redirects", async () => {
    for (const extra of [
      { userId: OTHER_USER_ID },
      { stripeCustomerId: "cus_Other123" },
      { priceId: "price_Other123" },
      { quantity: 2 },
      { mode: "payment" },
      { successUrl: "https://evil.test/success" },
      { cancelUrl: "https://evil.test/cancel" },
      { storefront: "USA" },
    ]) {
      const response = await POST(
        checkoutRequest({ interval: "monthly", ...extra }),
      );
      expect(response.status).toBe(400);
    }
    expect(mocks.configuration).not.toHaveBeenCalled();
    expect(mocks.createStripe).not.toHaveBeenCalled();
  });

  it("fails closed when purchases or the billing contract are disabled", async () => {
    mocks.configuration.mockReturnValueOnce({
      ...CONFIGURATION,
      purchasesEnabled: false,
    });
    expect(await POST(checkoutRequest())).toMatchObject({ status: 503 });

    mocks.contractReady.mockResolvedValueOnce(false);
    expect(await POST(checkoutRequest())).toMatchObject({ status: 503 });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.createStripe).not.toHaveBeenCalled();
  });

  it("throttles duplicate requests before any provider call", async () => {
    mocks.claim.mockResolvedValue({ claimed: false });

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(mocks.createStripe).not.toHaveBeenCalled();
  });

  it("directs an account with an existing subscription to management", async () => {
    mocks.subscriptions.mockResolvedValue({ count: 1, error: null });

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "manage_existing" });
    expect(mocks.createStripe).not.toHaveBeenCalled();
  });

  it("withholds malformed, credentialed, cross-account, and wrong-mode Sessions", async () => {
    const invalidSessions = [
      session({ livemode: true }),
      session({ mode: "payment" }),
      session({ customer: "cus_Other123" }),
      session({ client_reference_id: OTHER_USER_ID }),
      session({
        metadata: {
          purpose: "biblequest_plus",
          biblequest_user_id: OTHER_USER_ID,
          billing_interval: "monthly",
        },
      }),
      session({
        url: "https://user:secret@checkout.stripe.com/c/pay/cs_test_bad",
      }),
      session({ url: "https://checkout.stripe.com.evil.test/session" }),
    ];

    for (const invalidSession of invalidSessions) {
      mocks.createSession.mockResolvedValueOnce(invalidSession);
      const response = await POST(checkoutRequest());
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "unavailable" });
    }
  });

  it("keeps provider failures private and records only the bounded signal", async () => {
    mocks.createSession.mockRejectedValue(
      new Error(`private provider body ${CHECKOUT_URL}`),
    );

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "unavailable" });
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      "billing",
      "checkout",
      expect.any(Error),
    );
  });
});
