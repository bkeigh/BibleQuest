import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  distributedGuard: vi.fn(),
  distributedPolicies: vi.fn(),
  configuration: vi.fn(),
  createStripe: vi.fn(),
  retrievePlans: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("@/lib/bible/provider-request-guard", () => ({
  guardProviderRequest: mocks.guard,
}));
vi.mock("@/lib/security/distributed-rate-limit.server", () => ({
  distributedPoliciesFromWindows: mocks.distributedPolicies,
  guardDistributedRequest: mocks.distributedGuard,
}));
vi.mock("@/lib/billing/config.server", () => ({
  stripeBillingAvailability: mocks.configuration,
}));
vi.mock("@/lib/billing/stripe.server", () => ({
  createStripe: mocks.createStripe,
  retrieveBillingPlans: mocks.retrievePlans,
}));
vi.mock("@/lib/observability/server-failures", () => ({
  recordServerFailure: mocks.recordFailure,
}));

import { GET } from "@/app/api/billing/plans/route";

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

/** Builds one same-origin public catalog request without account credentials. */
function request() {
  return new Request("https://preview.biblequest.test/api/billing/plans", {
    headers: {
      Origin: "https://preview.biblequest.test",
      "Sec-Fetch-Site": "same-origin",
    },
  });
}

/** Returns the public fields accepted from the mocked Stripe catalog. */
function catalog() {
  return {
    monthly: {
      interval: "monthly",
      unitAmount: 899,
      currency: "usd",
    },
    annual: {
      interval: "annual",
      unitAmount: 8_999,
      currency: "usd",
    },
    lifetime: {
      interval: "lifetime",
      unitAmount: 14_499,
      currency: "usd",
    },
  };
}

describe("Stripe plans route", () => {
  beforeEach(() => {
    mocks.guard.mockReset().mockReturnValue(null);
    mocks.distributedGuard.mockReset().mockResolvedValue(null);
    mocks.distributedPolicies
      .mockReset()
      .mockReturnValue([{ limit: 30, windowSeconds: 60 }]);
    mocks.configuration
      .mockReset()
      .mockReturnValue({ status: "coming-soon", mode: "coming-soon" });
    mocks.createStripe.mockReset().mockReturnValue({ provider: "stripe" });
    mocks.retrievePlans.mockReset().mockResolvedValue(catalog());
    mocks.recordFailure.mockReset();
  });

  it("stops a locally blocked caller before reading billing configuration", async () => {
    const blocked = Response.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
    mocks.guard.mockReturnValue(blocked);

    const response = await GET(request());

    expect(response).toBe(blocked);
    expect(mocks.configuration).not.toHaveBeenCalled();
    expect(mocks.distributedGuard).not.toHaveBeenCalled();
    expect(mocks.createStripe).not.toHaveBeenCalled();
  });

  it("returns a no-store disabled posture without contacting Stripe", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      availability: "coming-soon",
      purchasesEnabled: false,
      plans: [],
    });
    expect(mocks.guard).toHaveBeenCalledOnce();
    expect(mocks.distributedGuard).not.toHaveBeenCalled();
    expect(mocks.createStripe).not.toHaveBeenCalled();
  });

  it("keeps a configured but disabled catalog no-store and provider-free", async () => {
    mocks.configuration.mockReturnValue({
      ...CONFIGURATION,
      purchasesEnabled: false,
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      availability: "configured",
      mode: "test",
      purchasesEnabled: false,
      plans: [],
    });
    expect(mocks.distributedGuard).not.toHaveBeenCalled();
    expect(mocks.createStripe).not.toHaveBeenCalled();
  });

  it("stops a shared-limit failure before any Stripe call", async () => {
    mocks.configuration.mockReturnValue(CONFIGURATION);
    const blocked = Response.json(
      { error: "rate_limit_unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
    mocks.distributedGuard.mockResolvedValue(blocked);

    const response = await GET(request());

    expect(response).toBe(blocked);
    expect(mocks.distributedGuard).toHaveBeenCalledOnce();
    expect(mocks.createStripe).not.toHaveBeenCalled();
    expect(mocks.retrievePlans).not.toHaveBeenCalled();
  });

  it("returns public plan fields only after both request guards pass", async () => {
    mocks.configuration.mockReturnValue(CONFIGURATION);
    const incoming = request();

    const response = await GET(incoming);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      availability: "configured",
      mode: "test",
      purchasesEnabled: true,
      plans: [
        { interval: "monthly", unitAmount: 899, currency: "usd" },
        { interval: "annual", unitAmount: 8_999, currency: "usd" },
        { interval: "lifetime", unitAmount: 14_499, currency: "usd" },
      ],
    });
    expect(mocks.guard).toHaveBeenCalledWith(incoming, "billing-plans", [
      { limit: 30, windowMs: 60_000 },
      { limit: 180, windowMs: 3_600_000 },
    ]);
    expect(mocks.distributedPolicies).toHaveBeenCalledWith([
      { limit: 30, windowMs: 60_000 },
      { limit: 180, windowMs: 3_600_000 },
    ]);
    expect(mocks.distributedGuard).toHaveBeenCalledWith(
      incoming,
      "billing-plans",
      [{ limit: 30, windowSeconds: 60 }],
    );
    expect(mocks.createStripe).toHaveBeenCalledWith(CONFIGURATION);
    expect(mocks.retrievePlans).toHaveBeenCalledOnce();
  });

  it("keeps provider failures private and no-store", async () => {
    mocks.configuration.mockReturnValue(CONFIGURATION);
    const failure = new Error("provider detail");
    mocks.retrievePlans.mockRejectedValue(failure);

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "unavailable" });
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      "billing",
      "plans",
      failure,
    );
  });
});
