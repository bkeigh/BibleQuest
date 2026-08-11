import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/** Reads one checked-in billing boundary for static security assertions. */
function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("direct Stripe API boundary", () => {
  const accountRoutes = [
    "src/app/api/billing/status/route.ts",
    "src/app/api/billing/checkout/route.ts",
    "src/app/api/billing/portal/route.ts",
    "src/app/api/billing/refresh/route.ts",
  ];
  const mutationRoutes = accountRoutes.slice(1);

  it("authenticates every account route and origin-protects mutations", () => {
    for (const path of accountRoutes) {
      expect(source(path)).toContain("authenticatedServerContext(request)");
      expect(source(path)).toContain("stripeBillingContractReady(");
    }
    for (const path of mutationRoutes) {
      expect(source(path)).toContain("hasSameOrigin(request)");
    }
    expect(source("src/app/api/billing/checkout/route.ts")).toContain(
      "boundedJson(request, MAX_BILLING_REQUEST_BYTES)",
    );
  });

  it("accepts only server-selected Prices and independently gates purchase", () => {
    const checkout = source("src/app/api/billing/checkout/route.ts");
    const plans = source("src/lib/billing/stripe.server.ts");
    expect(checkout).toContain("isBillingInterval(");
    expect(checkout).toContain("plans[interval].priceId");
    expect(checkout).toContain("configuration.purchasesEnabled");
    expect(checkout).not.toMatch(/body[^;\n]*price/i);
    expect(plans).toContain("configuration.priceIds.monthly");
    expect(plans).toContain("configuration.priceIds.annual");
    expect(plans).toContain("configuration.priceIds.lifetime");
    expect(plans).toContain("monthly.productId !== annual.productId");
    expect(checkout).toContain('interval === "lifetime"');
    expect(checkout).toContain('mode: lifetime ? "payment" : "subscription"');
  });

  it("verifies raw signatures before claiming a replay-safe event", () => {
    const webhook = source("src/app/api/billing/webhook/route.ts");
    expect(webhook).toContain('request.headers.get("stripe-signature")');
    expect(webhook).toContain(
      "boundedText(request, MAX_STRIPE_WEBHOOK_BYTES)",
    );
    expect(webhook).toContain("stripe.webhooks.constructEvent(");
    expect(webhook.indexOf("constructEvent(")).toBeLessThan(
      webhook.indexOf('"claim_stripe_webhook_event"'),
    );
    expect(webhook).toContain('claim.status === "processed"');
    expect(webhook).toContain(
      'claim.status !== "claimed"',
    );
    expect(webhook).toContain("MAX_STRIPE_WEBHOOK_BYTES");
    expect(webhook).not.toContain("request.json()");
  });

  it("keeps provider identifiers and entitlement decisions off the client", () => {
    const status = source("src/app/api/billing/status/route.ts");
    const client = source("src/lib/billing/usePlus.ts");
    expect(status).not.toMatch(
      /\.select\([\s\S]*?external_(?:customer|subscription)_id/,
    );
    expect(client).not.toMatch(
      /external_customer_id|external_subscription_id|stripe_price_id/,
    );
    expect(status).toContain('from("operator_plus_grants")');
    expect(status).toContain("operatorPlusGrantContractReady(admin)");
    // Both markers must exist before comparing: indexOf returns -1 for a
    // missing needle, which is less than any hit, so a renamed call would
    // otherwise let this ordering pin pass vacuously.
    const authIndex = status.indexOf("authenticatedServerContext(request)");
    const availabilityIndex = status.indexOf("stripeBillingAvailability()");
    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(availabilityIndex).toBeGreaterThanOrEqual(0);
    expect(authIndex).toBeLessThan(availabilityIndex);
    expect(client.indexOf("if (value.isPlus)")).toBeLessThan(
      client.indexOf('value.availability === "coming-soon"'),
    );
    const returnParser = client.slice(
      client.indexOf("function safeReturnNotice"),
      client.indexOf("export interface PlusState"),
    );
    expect(returnParser).not.toMatch(/isPlus|plan|status.*plus/i);
    expect(client).toContain("safePlusStatus(statusPayload)");
  });

  it("does not probe the protected account projection for guests", () => {
    const client = source("src/lib/billing/usePlus.ts");
    const guestBoundary = client.slice(
      client.indexOf('if (subjectKey === "guest")'),
      client.indexOf("const [statusResponse, plansResponse]"),
    );

    expect(guestBoundary).toContain('billingFetch("/api/billing/plans")');
    expect(guestBoundary).not.toContain('billingFetch("/api/billing/status")');
    expect(guestBoundary).toContain('status: "sign-in-required"');
  });

  it("allows only exact hosted Stripe redirect origins", () => {
    const checkout = source("src/app/api/billing/checkout/route.ts");
    const checkoutServer = source("src/lib/billing/stripe.server.ts");
    const portal = source("src/app/api/billing/portal/route.ts");
    const records = source("src/lib/billing/records.server.ts");
    const client = source("src/lib/billing/usePlus.ts");
    const purchases = source("src/lib/platform/purchases.ts");
    expect(checkoutServer).toContain('"https://checkout.stripe.com"');
    expect(checkout).toContain('origin_context: "mobile_app"');
    expect(portal).toContain("stripeBillingPortalUrl(portal");
    expect(records).toContain('"https://billing.stripe.com"');
    expect(client).toContain("purchaseAdapter()");
    expect(purchases).toContain('"https://checkout.stripe.com"');
    expect(purchases).toContain('"https://billing.stripe.com"');
  });
});
