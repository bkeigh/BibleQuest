import { describe, expect, it } from "vitest";
import {
  DEFAULT_GLASS_OPACITY,
  glassOpacityVariables,
  normalizeGlassOpacity,
} from "@/lib/glass-opacity";

describe("glass opacity", () => {
  it("defaults malformed values and clamps finite values to 15–100", () => {
    expect(normalizeGlassOpacity(undefined)).toBe(DEFAULT_GLASS_OPACITY);
    expect(normalizeGlassOpacity(Number.NaN)).toBe(DEFAULT_GLASS_OPACITY);
    expect(normalizeGlassOpacity("15")).toBe(DEFAULT_GLASS_OPACITY);
    expect(normalizeGlassOpacity(0)).toBe(15);
    expect(normalizeGlassOpacity(15)).toBe(15);
    expect(normalizeGlassOpacity(54.4)).toBe(54);
    expect(normalizeGlassOpacity(100)).toBe(100);
    expect(normalizeGlassOpacity(101)).toBe(100);
  });

  it("preserves the original material hierarchy at the default", () => {
    expect(glassOpacityVariables(DEFAULT_GLASS_OPACITY)).toMatchObject({
      "--glass-surface-opacity": "54%",
      "--glass-linen-opacity": "50%",
      "--glass-nested-opacity": "34%",
      "--glass-nav-opacity": "58%",
      "--glass-milestone-opacity": "78%",
      "--glass-milestone-reached-opacity": "92%",
    });
  });

  it("never derives a material below the readability floor", () => {
    const floorLayers = glassOpacityVariables(0);
    const floorValues = Object.values(floorLayers).map((value) =>
      Number.parseInt(value, 10),
    );
    const solidValues = Object.values(glassOpacityVariables(100));

    expect(Math.min(...floorValues)).toBe(15);
    expect(floorLayers["--glass-milestone-opacity"]).toBe("39%");
    expect(floorLayers["--glass-milestone-reached-opacity"]).toBe("53%");
    expect(new Set(solidValues)).toEqual(new Set(["100%"]));
  });
});
