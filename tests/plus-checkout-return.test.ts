import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(
  path.join(process.cwd(), "src/lib/billing/usePlus.ts"),
  "utf8",
);
const PURCHASE_SOURCE = readFileSync(
  path.join(process.cwd(), "src/lib/platform/purchases.ts"),
  "utf8",
);

/**
 * A Checkout redirect returns before Stripe's webhook is guaranteed to have
 * landed, and a blocked or delayed event would otherwise strand a paid
 * membership at "free" until a person found a button to press. The client
 * must ask the server to reconcile against Stripe on return — while still
 * taking entitlement only from the sealed server projection.
 */
describe("Plus reconciliation after a Checkout return", () => {
  it("reconciles against Stripe once when Checkout redirects back", () => {
    expect(SOURCE).toContain('safeReturnNotice() !== "checkout-returned"');
    expect(SOURCE).toContain("reconciledReturn.current = true");
    expect(SOURCE).toContain("void refresh()");
  });

  it("never reconciles for a guest or a cancelled Checkout", () => {
    const effect = SOURCE.slice(
      SOURCE.indexOf("// Checkout redirects back before"),
      SOURCE.indexOf("const startCheckout"),
    );
    expect(effect).toContain("if (session.loading || !session.user) return;");
    expect(effect).not.toContain("checkout-cancelled");
  });

  it("keeps the reconcile server-driven rather than trusting the redirect", () => {
    // The return parameter only triggers a request; it never sets isPlus.
    expect(SOURCE).toContain("purchases.restore(session.user.id)");
    expect(PURCHASE_SOURCE).toContain('"/api/billing/refresh"');
    expect(SOURCE).not.toContain('isPlus: true');
  });
});
