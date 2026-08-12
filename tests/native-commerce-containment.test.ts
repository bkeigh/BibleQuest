import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nativeCommerceContained } from "@/lib/billing/containment";

describe("native commerce containment", () => {
  it("fails closed independently from account sync", () => {
    expect(nativeCommerceContained(undefined, true)).toBe(true);
    expect(nativeCommerceContained("false", true)).toBe(true);
    expect(nativeCommerceContained("TRUE", true)).toBe(true);
    expect(nativeCommerceContained("true", true)).toBe(false);
    expect(nativeCommerceContained(undefined, false)).toBe(false);
  });

  it("keeps the native Plus coordinator free and trafficless while sealed", () => {
    const source = readFileSync("src/lib/billing/usePlus.ts", "utf8");
    expect(source).toContain(
      "nativeTarget && (ACCOUNT_SYNC_CONTAINED || NATIVE_COMMERCE_CONTAINED)",
    );
    expect(source).toContain("if (nativeContained)");
    expect(source).toContain("containedNativeState(subjectKey)");
  });
});
