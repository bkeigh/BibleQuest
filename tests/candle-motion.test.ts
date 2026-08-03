import { existsSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ART_SPRITES } from "@/components/design-system/art-assets";
import { CANDLE_STAGES } from "@/lib/questos/streak-engine";

const globals = readFileSync("src/app/globals.css", "utf8");
const streakCard = readFileSync("src/components/home/StreakCard.tsx", "utf8");

describe("candle motion", () => {
  it("gives every candle state one deliberate loop", () => {
    for (const stage of ["candle", ...CANDLE_STAGES] as const) {
      const asset = ART_SPRITES[stage];
      expect(asset, `${stage} is missing from the registry`).toBeDefined();
      expect(asset.animatedSrc, `${stage} has no GIF`).toBeDefined();
    }
  });

  it("ships sixteen cohesive frames behind every candle GIF", async () => {
    // A missing GIF is invisible: the still renders, the motion layer 404s,
    // and the candle just looks like it is not animating.
    for (const [name, asset] of Object.entries(ART_SPRITES)) {
      if (!asset.animatedSrc) continue;
      expect(
        existsSync(`public${asset.animatedSrc}`),
        `${name} points at ${asset.animatedSrc}, which is not in public/`,
      ).toBe(true);
      const metadata = await sharp(`public${asset.animatedSrc}`, {
        animated: true,
      }).metadata();
      expect(metadata.pages, `${name} frame count`).toBe(16);
      expect(metadata.delay, `${name} timing`).toEqual(
        Array.from({ length: 16 }, () => 100),
      );
    }
  });

  it("lets both the OS and the app stop a GIF", () => {
    // No stylesheet can pause a GIF, so the still is rendered beside it and
    // CSS picks. Losing either rule means reduced motion silently stops
    // working for exactly the sprites that move the most.
    expect(globals).toContain(".art-at-rest");
    expect(globals).toContain(".art-in-motion");
    expect(globals).toContain("prefers-reduced-motion");
    expect(globals).toContain("force-reduce-motion");
  });

  it("lights the streak candle only on a day that was actually lit", () => {
    // The candle is not a scoreboard. It moves when today has been lit and
    // waits quietly otherwise, rather than animating to imply a streak.
    expect(streakCard).toContain("animate={lit}");
  });
});
