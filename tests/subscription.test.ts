import { describe, expect, it } from "vitest";
import { PLUS_ENTITLEMENT_ID } from "@/lib/revenuecat/client";
import { planFromActiveEntitlements } from "@/lib/questos/subscription-engine";

describe("RevenueCat entitlement mapping", () => {
  it("grants Plus only for the configured Plus entitlement", () => {
    expect(planFromActiveEntitlements([])).toBe("free");
    expect(planFromActiveEntitlements(["Patron"])).toBe("free");
    expect(planFromActiveEntitlements(["plus"])).toBe("free");
    expect(planFromActiveEntitlements([`${PLUS_ENTITLEMENT_ID} `])).toBe("free");
    expect(planFromActiveEntitlements([PLUS_ENTITLEMENT_ID])).toBe("plus");
  });
});
