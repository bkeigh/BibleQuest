import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const COORDINATOR = readFileSync(
  path.join(process.cwd(), "src/lib/billing/usePlus.ts"),
  "utf8",
);
const PRESENTATION = readFileSync(
  path.join(process.cwd(), "src/components/plus/PlusCta.tsx"),
  "utf8",
);

describe("Plus management after a Stripe Portal visit", () => {
  it("treats the fixed Portal return as a reconcile hint only", () => {
    expect(COORDINATOR).toContain('parameters.get("portal") === "returned"');
    expect(COORDINATOR).toContain('notice !== "portal-returned"');
    expect(COORDINATOR).toContain("void refresh()");
    expect(COORDINATOR).not.toContain("isPlus: true");
    expect(PRESENTATION).toContain(
      "returning from the browser does not change",
    );
  });

  it("reconciles once when focus returns after external management", () => {
    expect(COORDINATOR).toContain("portalReconciliationPending.current = true");
    expect(COORDINATOR).toContain("portalReconciliationPending.current = false");
    expect(COORDINATOR).toContain("void refresh().catch(() => void load())");
  });

  it("closes duplicate management actions synchronously", () => {
    expect(COORDINATOR).toContain("portalActionInFlight.current");
    expect(COORDINATOR).toContain("portalActionInFlight.current = true");
    expect(COORDINATOR).toContain("portalActionInFlight.current = false");
  });

  it("clears Portal lifecycle state on every account generation change", () => {
    const subjectEffect = COORDINATOR.slice(
      COORDINATOR.indexOf("currentSubject.current = subjectKey"),
      COORDINATOR.indexOf("const visible"),
    );
    expect(subjectEffect).toContain("reconciledReturn.current = false");
    expect(subjectEffect).toContain(
      "portalReconciliationPending.current = false",
    );
    expect(subjectEffect).toContain("portalActionInFlight.current = false");
  });

  it("gates management through the shared storefront-aware adapter", () => {
    const management = COORDINATOR.slice(
      COORDINATOR.indexOf("const openCustomerPortal"),
      COORDINATOR.indexOf("return {", COORDINATOR.indexOf("const openCustomerPortal")),
    );
    expect(management).toContain("!purchases.available");
    expect(COORDINATOR).toContain(
      "Boolean(session.user) && purchases.available && visible.hasCustomer",
    );
  });

  it("shows truthful cancellation, renewal-failure, and no-customer copy", () => {
    expect(PRESENTATION).toContain('plus.status === "canceled"');
    expect(PRESENTATION).toContain(
      "Stripe says this membership needs attention.",
    );
    expect(PRESENTATION).toContain(
      "No Stripe billing profile is linked to this account.",
    );
    expect(PRESENTATION).toContain(
      "local Scripture, prayers, reflections, and journey are unchanged.",
    );
    expect(COORDINATOR).not.toMatch(
      /localStorage\.clear|clearEverything|clearJourney|deleteAccount/,
    );
  });

  it("plainly says native management opens in the browser", () => {
    expect(PRESENTATION).toContain(
      "Open Stripe in your browser to manage billing",
    );
    expect(PRESENTATION).toContain("Review billing in your browser");
  });
});
