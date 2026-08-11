import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NATIVE_APP_ORIGIN } from "@/lib/http/native-origin";

const mocks = vi.hoisted(() => ({
  authenticatedContext: vi.fn(),
  configuration: vi.fn(),
  contractReady: vi.fn(),
  claim: vi.fn(),
  mappedCustomer: vi.fn(),
  createStripe: vi.fn(),
  createPortalSession: vi.fn(),
  createAdmin: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("@/lib/supabase/authenticated.server", () => ({
  authenticatedServerContext: mocks.authenticatedContext,
}));
vi.mock("@/lib/billing/config.server", () => ({
  requireStripeBillingConfiguration: mocks.configuration,
}));
vi.mock("@/lib/billing/server", () => ({
  stripeBillingContractReady: mocks.contractReady,
}));
vi.mock("@/lib/billing/records.server", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/billing/records.server")
  >();
  return {
    ...actual,
    claimStripeAction: mocks.claim,
    mappedStripeCustomerForUser: mocks.mappedCustomer,
  };
});
vi.mock("@/lib/billing/stripe.server", () => ({
  createStripe: mocks.createStripe,
}));
vi.mock("@/lib/supabase/admin.server", () => ({
  createAdminSupabase: mocks.createAdmin,
}));
vi.mock("@/lib/observability/server-failures", () => ({
  recordServerFailure: mocks.recordFailure,
}));

import { POST } from "@/app/api/billing/portal/route";

const USER_ID = "d1000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = "cus_TestPortalCustomer123";
const CLAIM_TOKEN = "d2000000-0000-4000-8000-000000000002";
const PORTAL_URL =
  "https://billing.stripe.com/p/session/test_BibleQuestPortal123";
const RETURN_URL =
  "https://preview.biblequest.test/app/plus?portal=returned";
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
  supportEnabled: false,
} as const;

/** Builds one exact native-origin request with no caller-selected payload. */
function request(
  authorization: string | null = "Bearer a.b.c",
  origin = NATIVE_APP_ORIGIN,
  body?: unknown,
) {
  const headers = new Headers({ Origin: origin });
  if (authorization) headers.set("Authorization", authorization);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return new Request(
    "https://preview.biblequest.test/api/billing/portal",
    {
      method: "POST",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
}

/** Returns the complete provider echo that the route validates. */
function portalSession(overrides: Record<string, unknown> = {}) {
  return {
    customer: CUSTOMER_ID,
    livemode: false,
    return_url: RETURN_URL,
    url: PORTAL_URL,
    ...overrides,
  };
}

describe("native Stripe Customer Portal route", () => {
  beforeEach(() => {
    process.env.BIBLEQUEST_NATIVE_API_ORIGIN_ENABLED = "true";
    mocks.authenticatedContext.mockReset().mockImplementation(async (value) =>
      value.headers.get("authorization") === "Bearer a.b.c"
        ? { supabase: { role: "bearer" }, user: { id: USER_ID } }
        : Response.json(
            { error: "unauthorized" },
            {
              status: 401,
              headers: { "Cache-Control": "private, no-store" },
            },
          ),
    );
    mocks.configuration.mockReset().mockReturnValue(CONFIGURATION);
    mocks.contractReady.mockReset().mockResolvedValue(true);
    mocks.claim.mockReset().mockResolvedValue({
      claimed: true,
      claimToken: CLAIM_TOKEN,
    });
    mocks.mappedCustomer.mockReset().mockResolvedValue(CUSTOMER_ID);
    mocks.createAdmin.mockReset().mockReturnValue({ role: "admin" });
    mocks.createPortalSession.mockReset().mockResolvedValue(portalSession());
    mocks.createStripe.mockReset().mockReturnValue({
      billingPortal: { sessions: { create: mocks.createPortalSession } },
    });
    mocks.recordFailure.mockReset();
  });

  afterEach(() => {
    delete process.env.BIBLEQUEST_NATIVE_API_ORIGIN_ENABLED;
  });

  it("rejects wrong origins and missing or invalid bearer contexts", async () => {
    expect(
      await POST(request("Bearer a.b.c", "https://evil.test")),
    ).toMatchObject({ status: 403 });
    expect(await POST(request(null))).toMatchObject({ status: 401 });
    expect(await POST(request("Bearer malformed"))).toMatchObject({
      status: 401,
    });
    expect(mocks.configuration).not.toHaveBeenCalled();
    expect(mocks.createStripe).not.toHaveBeenCalled();
  });

  it("rejects every client-selected Portal field before mapping or provider access", async () => {
    for (const body of [
      { customer: "cus_AnotherUsersCustomer" },
      { customerId: "cus_AnotherUsersCustomer" },
      { returnUrl: "https://evil.test" },
      { mode: "live" },
      { configuration: "bpc_AttackerSelected" },
      {},
    ]) {
      expect(
        await POST(request("Bearer a.b.c", NATIVE_APP_ORIGIN, body)),
      ).toMatchObject({ status: 400 });
    }
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.mappedCustomer).not.toHaveBeenCalled();
    expect(mocks.createStripe).not.toHaveBeenCalled();
  });

  it("fails closed before Stripe when the billing contract is unavailable", async () => {
    mocks.contractReady.mockResolvedValue(false);

    expect(await POST(request())).toMatchObject({ status: 503 });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.createStripe).not.toHaveBeenCalled();
  });

  it("returns no Portal URL when this account has no sealed Customer mapping", async () => {
    mocks.mappedCustomer.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
    expect(mocks.createStripe).not.toHaveBeenCalled();
  });

  it("creates a mode-matched session from server-owned fields only", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ url: PORTAL_URL });
    expect(mocks.mappedCustomer).toHaveBeenCalledWith(
      { role: "admin" },
      USER_ID,
      false,
    );
    expect(mocks.createPortalSession).toHaveBeenCalledWith(
      { customer: CUSTOMER_ID, return_url: RETURN_URL },
      {
        idempotencyKey: `biblequest-portal-${USER_ID}-${CLAIM_TOKEN}`,
      },
    );
    expect(JSON.stringify(mocks.createPortalSession.mock.calls)).not.toMatch(
      /authorization|configuration|flow_data|livemode|mode|user_id/i,
    );
  });

  it("preserves the existing exact same-origin web management path", async () => {
    mocks.authenticatedContext.mockResolvedValue({
      supabase: { role: "cookie" },
      user: { id: USER_ID },
    });

    const response = await POST(
      request(null, "https://preview.biblequest.test"),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ url: PORTAL_URL });
  });

  it("rate-limits a duplicate tap before creating another provider session", async () => {
    mocks.claim
      .mockResolvedValueOnce({ claimed: true, claimToken: CLAIM_TOKEN })
      .mockResolvedValueOnce({ claimed: false });

    const first = await POST(request());
    const duplicate = await POST(request());

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(429);
    expect(duplicate.headers.get("retry-after")).toBe("10");
    expect(mocks.createPortalSession).toHaveBeenCalledTimes(1);
  });

  it("rejects wrong-mode, cross-customer, and wrong-return provider echoes", async () => {
    for (const overrides of [
      { livemode: true },
      { customer: "cus_AnotherUsersCustomer" },
      { return_url: "https://evil.test/return" },
    ]) {
      mocks.createPortalSession.mockResolvedValueOnce(portalSession(overrides));
      const response = await POST(request());
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "unavailable" });
    }
  });

  it("rejects lookalike, credentialed, and malformed provider URLs", async () => {
    for (const url of [
      "https://billing.stripe.com.evil.test/p/session/attack",
      "https://attacker@billing.stripe.com/p/session/attack",
      "not a URL",
    ]) {
      mocks.createPortalSession.mockResolvedValueOnce(portalSession({ url }));
      const response = await POST(request());
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "unavailable" });
    }
  });

  it("keeps provider failures private and URL-free", async () => {
    mocks.createPortalSession.mockRejectedValue(
      new Error("private provider response with checkout URL"),
    );

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "unavailable" });
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      "billing",
      "portal",
      expect.any(Error),
    );
  });
});
