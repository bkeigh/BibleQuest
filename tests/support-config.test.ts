import { describe, expect, it } from "vitest";
import {
  isSupportAmount,
  parseCustomSupportAmount,
  SUPPORT_MAXIMUM_AMOUNT,
  SUPPORT_MINIMUM_AMOUNT,
  SUPPORT_PRESET_AMOUNTS,
} from "@/lib/support/config";

describe("one-time support amount policy", () => {
  it("ships four sensible presets inside the fixed server range", () => {
    expect(SUPPORT_PRESET_AMOUNTS).toEqual([500, 1_000, 2_500, 5_000]);
    expect(SUPPORT_PRESET_AMOUNTS.every(isSupportAmount)).toBe(true);
  });

  it("parses custom dollars without floating-point rounding", () => {
    expect(parseCustomSupportAmount("3")).toBe(300);
    expect(parseCustomSupportAmount("3.5")).toBe(350);
    expect(parseCustomSupportAmount("3.05")).toBe(305);
    expect(parseCustomSupportAmount("500.00")).toBe(50_000);
  });

  it("rejects malformed, out-of-range, and ambiguous custom values", () => {
    for (const value of [
      "",
      "2.99",
      "500.01",
      "01",
      "3.",
      ".50",
      "3.001",
      "1e2",
      "-10",
      " 10",
      "10 ",
      "NaN",
    ]) {
      expect(parseCustomSupportAmount(value)).toBeNull();
    }
  });

  it("rejects noninteger and manipulated server amounts", () => {
    expect(isSupportAmount(SUPPORT_MINIMUM_AMOUNT)).toBe(true);
    expect(isSupportAmount(SUPPORT_MAXIMUM_AMOUNT)).toBe(true);
    for (const value of [
      SUPPORT_MINIMUM_AMOUNT - 1,
      SUPPORT_MAXIMUM_AMOUNT + 1,
      1_000.5,
      "1000",
      Number.NaN,
      Number.POSITIVE_INFINITY,
      null,
    ]) {
      expect(isSupportAmount(value)).toBe(false);
    }
  });
});
