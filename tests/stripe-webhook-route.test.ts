import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ProcessingError extends Error {
    constructor(
      readonly category: "provider" | "database" | "invalid",
    ) {
      super("Stripe webhook processing failed.");
      this.name = "StripeWebhookProcessingError";
    }
  }
  return {
    ProcessingError,
    configuration: vi.fn(),
    contractReady: vi.fn(),
    constructEvent: vi.fn(),
    createAdmin: vi.fn(),
    createStripe: vi.fn(),
    processEvent: vi.fn(),
    recordFailure: vi.fn(),
    recordFailureReason: vi.fn(),
    rpc: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/config.server", () => ({
  requireStripeBillingConfiguration: mocks.configuration,
}));
vi.mock("@/lib/billing/server", () => ({
  stripeBillingContractReady: mocks.contractReady,
}));
vi.mock("@/lib/billing/stripe.server", () => ({
  createStripe: mocks.createStripe,
}));
vi.mock("@/lib/billing/webhook.server", () => ({
  processStripeWebhookEvent: mocks.processEvent,
  StripeWebhookProcessingError: mocks.ProcessingError,
}));
vi.mock("@/lib/observability/server-failures", () => ({
  recordServerFailure: mocks.recordFailure,
  recordServerFailureReason: mocks.recordFailureReason,
}));
vi.mock("@/lib/supabase/admin.server", () => ({
  createAdminSupabase: mocks.createAdmin,
}));

import { POST } from "@/app/api/billing/webhook/route";

const CLAIM_TOKEN = "d1000000-0000-4000-8000-000000000001";
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

/** Builds one current signed event envelope returned by the mocked SDK. */
function stripeEvent(livemode = false) {
  return {
    id: "evt_TestWebhook123",
    type: "customer.subscription.updated",
    created: 1_784_916_100,
    livemode,
    data: { object: { id: "sub_TestSubscription123" } },
  };
}

/** Builds a raw webhook request without JSON parsing or browser credentials. */
function request(
  body = "raw=stripe&payload=true",
  headers: Record<string, string> = {},
) {
  return new Request("https://preview.biblequest.test/api/billing/webhook", {
    method: "POST",
    headers: {
      "stripe-signature": "t=1784916100,v1=signature",
      ...headers,
    },
    body,
  });
}

describe("Stripe webhook route", () => {
  beforeEach(() => {
    mocks.configuration.mockReset().mockReturnValue(CONFIGURATION);
    mocks.contractReady.mockReset().mockResolvedValue(true);
    mocks.constructEvent.mockReset().mockReturnValue(stripeEvent());
    mocks.createStripe.mockReset().mockReturnValue({
      webhooks: { constructEvent: mocks.constructEvent },
    });
    mocks.processEvent.mockReset().mockResolvedValue("processed");
    mocks.recordFailure.mockReset();
    mocks.recordFailureReason.mockReset();
    mocks.rpc.mockReset().mockImplementation((name: string) => {
      if (name === "claim_stripe_webhook_event") {
        return Promise.resolve({
          data: { claimed: true, claim_token: CLAIM_TOKEN },
          error: null,
        });
      }
      return Promise.resolve({ data: true, error: null });
    });
    mocks.createAdmin.mockReset().mockReturnValue({ rpc: mocks.rpc });
  });

  it("rejects missing or oversized signatures before reading dependencies", async () => {
    const missing = request("payload", { "stripe-signature": "" });
    expect(await POST(missing)).toMatchObject({ status: 400 });
    expect(
      await POST(request("payload", { "stripe-signature": "x".repeat(8193) })),
    ).toMatchObject({ status: 400 });
    expect(mocks.configuration).not.toHaveBeenCalled();
  });

  it("bounds declared and actual request bodies before signature verification", async () => {
    const declared = request("payload", { "content-length": "262145" });
    expect(await POST(declared)).toMatchObject({ status: 400 });

    const actual = request("x".repeat(262145));
    expect(await POST(actual)).toMatchObject({ status: 413 });
    expect(mocks.constructEvent).not.toHaveBeenCalled();
  });

  it("preserves raw bytes for SDK signature verification", async () => {
    const raw = "{\n  \"not\": \"normalized\"\n}\n";
    expect(await POST(request(raw))).toMatchObject({ status: 200 });
    expect(mocks.constructEvent).toHaveBeenCalledWith(
      raw,
      "t=1784916100,v1=signature",
      CONFIGURATION.webhookSecret,
    );
  });

  it("retries server configuration failures but rejects bad signatures", async () => {
    mocks.configuration.mockImplementation(() => {
      throw new Error("private configuration detail");
    });
    expect(await POST(request())).toMatchObject({ status: 503 });
    expect(mocks.constructEvent).not.toHaveBeenCalled();

    mocks.configuration.mockReturnValue(CONFIGURATION);
    mocks.constructEvent.mockImplementation(() => {
      throw new Error("private signature detail");
    });
    expect(await POST(request())).toMatchObject({ status: 400 });
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });

  it("rejects wrong-mode events before the durable replay claim", async () => {
    mocks.constructEvent.mockReturnValue(stripeEvent(true));
    expect(await POST(request())).toMatchObject({ status: 400 });
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });

  it("acknowledges a processed replay without projecting twice", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { claimed: false, status: "processed" },
      error: null,
    });
    expect(await POST(request())).toMatchObject({ status: 200 });
    expect(mocks.processEvent).not.toHaveBeenCalled();
  });

  it("keeps an active duplicate retryable until its first worker commits", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { claimed: false, status: "processing" },
      error: null,
    });
    expect(await POST(request())).toMatchObject({ status: 503 });
    expect(mocks.processEvent).not.toHaveBeenCalled();
  });

  it("terminally acknowledges a deterministic signed mismatch", async () => {
    mocks.processEvent.mockRejectedValue(
      new mocks.ProcessingError("invalid"),
    );

    expect(await POST(request())).toMatchObject({ status: 200 });
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "complete_stripe_webhook_event",
      {
        p_event_id: "evt_TestWebhook123",
        p_claim_token: CLAIM_TOKEN,
        p_outcome: "processed",
        p_error_category: "ignored",
      },
    );
  });

  it.each(["provider", "database"] as const)(
    "returns 503 and releases a %s failure for Stripe retry",
    async (category) => {
      mocks.processEvent.mockRejectedValue(
        new mocks.ProcessingError(category),
      );
      expect(await POST(request())).toMatchObject({ status: 503 });
      expect(mocks.rpc).toHaveBeenLastCalledWith(
        "complete_stripe_webhook_event",
        expect.objectContaining({
          p_outcome: "failed",
          p_error_category: category,
        }),
      );
    },
  );

  it("keeps completion failures retryable for both success and rejection", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { claimed: true, claim_token: CLAIM_TOKEN },
      error: null,
    });
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await POST(request())).toMatchObject({ status: 503 });

    mocks.processEvent.mockRejectedValue(
      new mocks.ProcessingError("invalid"),
    );
    mocks.rpc.mockResolvedValueOnce({
      data: { claimed: true, claim_token: CLAIM_TOKEN },
      error: null,
    });
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await POST(request())).toMatchObject({ status: 503 });
  });
});
