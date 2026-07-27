import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  configuration: vi.fn(),
  createStripe: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  checkoutUrl: vi.fn(),
  optionalUser: vi.fn(),
  contractReady: vi.fn(),
  createAdmin: vi.fn(),
  createServer: vi.fn(),
  createSession: vi.fn(),
  retrieveSession: vi.fn(),
}));

vi.mock("@/lib/bible/provider-request-guard", () => ({
  guardProviderRequest: mocks.guard,
}));
vi.mock("@/lib/billing/config.server", () => ({
  requireStripeBillingConfiguration: mocks.configuration,
}));
vi.mock("@/lib/billing/stripe.server", () => ({
  createStripe: mocks.createStripe,
}));
vi.mock("@/lib/support/records.server", () => ({
  claimSupportCheckout: mocks.claim,
  completeSupportCheckout: mocks.complete,
  supportCheckoutUrl: mocks.checkoutUrl,
}));
vi.mock("@/lib/support/server", () => ({
  optionalSupportUser: mocks.optionalUser,
  stripeSupportContractReady: mocks.contractReady,
}));
vi.mock("@/lib/supabase/admin.server", () => ({
  createAdminSupabase: mocks.createAdmin,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: mocks.createServer,
}));

import { POST } from "@/app/api/support/checkout/route";

const REQUEST_ID = "d1000000-0000-4000-8000-000000000001";
const CHECKOUT_URL =
  "https://checkout.stripe.com/c/pay/cs_test_SupportSession123";
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
  purchasesEnabled: false,
  supportEnabled: true,
} as const;

/** Builds one exact same-origin JSON request for the support route. */
function request(
  body: unknown = { amount: 1_000, requestId: REQUEST_ID },
  origin = "https://preview.biblequest.test",
) {
  return new Request(
    "https://preview.biblequest.test/api/support/checkout",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify(body),
    },
  );
}

/** Builds the bounded current Session returned by the mocked provider. */
function session() {
  return {
    id: "cs_test_SupportSession123",
    mode: "payment",
    livemode: false,
    status: "open",
    payment_status: "unpaid",
    client_reference_id: REQUEST_ID,
    currency: "usd",
    amount_total: 1_000,
    metadata: {
      purpose: "biblequest_support",
      support_request_id: REQUEST_ID,
    },
    url: CHECKOUT_URL,
  };
}

describe("one-time support Checkout route", () => {
  beforeEach(() => {
    mocks.guard.mockReset().mockReturnValue(null);
    mocks.configuration.mockReset().mockReturnValue(CONFIGURATION);
    mocks.createAdmin.mockReset().mockReturnValue({ role: "admin" });
    mocks.createServer.mockReset();
    mocks.optionalUser.mockReset().mockResolvedValue(null);
    mocks.contractReady.mockReset().mockResolvedValue(true);
    mocks.claim.mockReset().mockResolvedValue({
      status: "claimed",
      token: "d2000000-0000-4000-8000-000000000002",
    });
    mocks.complete.mockReset().mockResolvedValue(true);
    mocks.createSession.mockReset().mockResolvedValue(session());
    mocks.retrieveSession.mockReset().mockResolvedValue(session());
    mocks.createStripe.mockReset().mockReturnValue({
      checkout: {
        sessions: {
          create: mocks.createSession,
          retrieve: mocks.retrieveSession,
        },
      },
    });
    mocks.checkoutUrl.mockReset().mockReturnValue(CHECKOUT_URL);
  });

  it("rejects cross-origin and manipulated requests before provider access", async () => {
    expect(await POST(request(undefined, "https://evil.test"))).toMatchObject({
      status: 403,
    });
    for (const body of [
      { amount: 299, requestId: REQUEST_ID },
      { amount: "1000", requestId: REQUEST_ID },
      { amount: 1_000, requestId: "not-a-uuid" },
      { amount: 1_000, requestId: REQUEST_ID, currency: "eur" },
    ]) {
      expect(await POST(request(body))).toMatchObject({ status: 400 });
    }
    expect(mocks.createStripe).not.toHaveBeenCalled();
  });

  it("fails closed when the support latch or schema contract is unavailable", async () => {
    mocks.configuration.mockReturnValue({
      ...CONFIGURATION,
      supportEnabled: false,
    });
    expect(await POST(request())).toMatchObject({ status: 503 });

    mocks.configuration.mockReturnValue(CONFIGURATION);
    mocks.contractReady.mockResolvedValue(false);
    expect(await POST(request())).toMatchObject({ status: 503 });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.createStripe).not.toHaveBeenCalled();
  });

  it("creates a guest Session with fixed server product and idempotency", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ url: CHECKOUT_URL });
    expect(mocks.claim).toHaveBeenCalledWith(
      { role: "admin" },
      {
        requestId: REQUEST_ID,
        userId: null,
        amount: 1_000,
        livemode: false,
      },
    );
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        customer_creation: "always",
        line_items: [
          expect.objectContaining({
            quantity: 1,
            price_data: expect.objectContaining({
              currency: "usd",
              unit_amount: 1_000,
            }),
          }),
        ],
        success_url:
          "https://preview.biblequest.test/support?checkout=returned",
        cancel_url:
          "https://preview.biblequest.test/support?checkout=cancelled",
        metadata: {
          purpose: "biblequest_support",
          support_request_id: REQUEST_ID,
        },
      }),
      { idempotencyKey: `biblequest-support-${REQUEST_ID}` },
    );
    expect(JSON.stringify(mocks.createSession.mock.calls)).not.toMatch(
      /user_id|customer_email|card|tax_id/i,
    );
    expect(mocks.complete).toHaveBeenCalledWith(
      { role: "admin" },
      {
        requestId: REQUEST_ID,
        token: "d2000000-0000-4000-8000-000000000002",
        outcome: "created",
        sessionId: "cs_test_SupportSession123",
      },
    );
  });

  it("prefills only a verified account email without creating an account", async () => {
    mocks.optionalUser.mockResolvedValue({
      id: "d3000000-0000-4000-8000-000000000003",
      email: "verified@example.test",
      email_confirmed_at: "2026-07-24T00:00:00.000Z",
    });

    expect(await POST(request())).toMatchObject({ status: 201 });
    expect(mocks.claim).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "d3000000-0000-4000-8000-000000000003",
      }),
    );
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_email: "verified@example.test",
      }),
      expect.anything(),
    );
    expect(mocks.createServer).not.toHaveBeenCalled();
  });

  it("does not prefill an unconfirmed account email", async () => {
    mocks.optionalUser.mockResolvedValue({
      id: "d3000000-0000-4000-8000-000000000003",
      email: "unconfirmed@example.test",
      email_confirmed_at: null,
    });

    expect(await POST(request())).toMatchObject({ status: 201 });
    const [parameters] = mocks.createSession.mock.calls[0];
    expect(parameters).not.toHaveProperty("customer_email");
  });

  it("rehydrates an idempotent existing Session without creating another", async () => {
    mocks.claim.mockResolvedValue({
      status: "created",
      sessionId: "cs_test_SupportSession123",
    });

    expect(await POST(request())).toMatchObject({ status: 201 });
    expect(mocks.retrieveSession).toHaveBeenCalledWith(
      "cs_test_SupportSession123",
    );
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("returns a retryable response while another creation claim is active", async () => {
    mocks.claim.mockResolvedValue({ status: "unavailable" });

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(mocks.createStripe).not.toHaveBeenCalled();
  });

  it("records bounded invalid/provider failures and never exposes a URL", async () => {
    mocks.checkoutUrl.mockReturnValueOnce(null);
    const invalid = await POST(request());
    expect(invalid.status).toBe(503);
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        outcome: "failed",
        errorCategory: "invalid",
      }),
    );

    mocks.complete.mockClear();
    mocks.createSession.mockRejectedValueOnce(new Error("private provider"));
    const provider = await POST(request());
    expect(provider.status).toBe(503);
    expect(await provider.json()).toEqual({ error: "unavailable" });
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        outcome: "failed",
        errorCategory: "provider",
      }),
    );
  });

  it("withholds Checkout when the provider mapping cannot be committed", async () => {
    mocks.complete.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });

  it("keeps a failure response bounded when failure projection also fails", async () => {
    mocks.createSession.mockRejectedValueOnce(new Error("private provider"));
    mocks.complete.mockRejectedValueOnce(new Error("private database"));

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });
});
