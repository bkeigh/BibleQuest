import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PIXEL_ICON } from "@/components/design-system/PixelIcon";

const SOURCES = globSync("src/**/*.tsx");

/** Every `size={n}` sitting on a PixelIcon or PixelMascot element. */
function iconSizes(): { file: string; size: number }[] {
  const found: { file: string; size: number }[] = [];
  const element = /<(PixelIcon|PixelMascot)((?:[^<>]|\n)*?)(?=\/?>)/g;
  for (const file of SOURCES) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(element)) {
      const size = /size=\{([0-9.]+)\}/.exec(match[2]);
      if (size) found.push({ file, size: Number(size[1]) });
    }
  }
  return found;
}

describe("pixel icon scale", () => {
  it("finds the icons it is meant to be guarding", () => {
    // A regex that silently matches nothing would make every assertion below
    // pass while checking absolutely nothing.
    expect(iconSizes().length).toBeGreaterThan(50);
  });

  it("takes plain pixels, never the old cell multiplier", () => {
    // `size` used to be a multiplier: `max(1, round(size * cellScale)) * cols`.
    // Under it every value from 2 to 7 rendered at exactly 32px, so eight
    // distinct intents across the app came out as two actual sizes. A small
    // number here now means a 3px icon rather than a slightly smaller one,
    // which is silent enough to ship — hence a test rather than a comment.
    for (const { file, size } of iconSizes()) {
      expect(size, `${file} looks like an unmigrated cell multiplier`).toBeGreaterThanOrEqual(16);
    }
  });

  it("keeps icons within a range a phone can show", () => {
    for (const { file, size } of iconSizes()) {
      expect(size, `${file} is larger than the narrowest viewport`).toBeLessThanOrEqual(320);
    }
  });

  it("offers a named ladder so screens pick a role, not a number", () => {
    const steps = Object.values(PIXEL_ICON);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(new Set(steps).size).toBe(steps.length);
    // The smallest step still has to clear the guard above.
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(16);
  });
});
