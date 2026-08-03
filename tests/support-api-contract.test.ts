import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/** Reads one support boundary for static security and product assertions. */
function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("one-time Support BibleQuest API boundary", () => {
  const route = source("src/app/api/support/checkout/route.ts");
  const client = source("src/components/plus/SupportCheckout.tsx");
  const migration = source(
    "supabase/migrations/0026_stripe_one_time_support.sql",
  );

  it("uses POST, same-origin protection, bounded JSON, and layered limits", () => {
    expect(route).toContain("export async function POST(request: Request)");
    expect(route).toContain("hasSameOrigin(request)");
    expect(route).toContain("guardProviderRequest(request,");
    expect(route).toContain("guardDistributedRequest(");
    expect(route).toContain(
      "boundedJson(request, MAX_SUPPORT_REQUEST_BYTES)",
    );
    expect(route).not.toContain("export function GET");
  });

  it("lets guests pay without creating an application account", () => {
    expect(route).toContain("optionalSupportUser(createServerSupabase)");
    expect(route).toContain("userId: user?.id ?? null");
    expect(route).not.toMatch(/auth\.signUp|admin\.createUser|inviteUser/);
    expect(migration).toContain(
      "user_id uuid references auth.users(id) on delete set null",
    );
  });

  it("fixes currency and bounds amount before server-created Checkout", () => {
    expect(route).toContain("isSupportAmount(values.amount)");
    expect(route).toContain("currency: SUPPORT_CURRENCY");
    expect(route).toContain("unit_amount: values.amount");
    expect(route).toContain('mode: "payment"');
    expect(route).toContain('customer_creation: "always"');
    expect(route).not.toMatch(/body[^;\n]*(?:currency|price_data)/i);
  });

  it("idempotently maps a request before exposing exact hosted Checkout", () => {
    expect(route).toContain("claimSupportCheckout(admin,");
    expect(route).toContain(
      "idempotencyKey: `biblequest-support-${values.requestId}`",
    );
    expect(route).toContain("completeSupportCheckout(admin,");
    expect(route).toContain("supportCheckoutUrl(session,");
    expect(client).toContain('"https://checkout.stripe.com"');
    expect(client).toContain("destination.username");
    expect(client).toContain("request.current?.amount !== amount");
  });

  it("distinguishes one-time support from membership without pressure copy", () => {
    expect(client).toMatch(/voluntary, non-recurring, and not tax-deductible/i);
    expect(client).toMatch(/no\s+Plus membership or spiritual benefit/i);
    expect(client).not.toMatch(
      /donat|urgent|hurry|only today|matching gift|tax-deductible receipt/i,
    );
  });

  it("never treats a return query as payment proof", () => {
    expect(client).toContain(
      "Only Stripe’s signed webhook confirms payment",
    );
    expect(client).toContain(
      "No payment is inferred from this return",
    );
    expect(client).not.toMatch(
      /returnNotice[\s\S]*?(?:payment confirmed|payment complete|paid successfully)/i,
    );
  });
});
