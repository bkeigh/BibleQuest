import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PIXEL_SPRITES } from "@/components/design-system/pixel-assets";
import { CANDLE_STAGES } from "@/lib/questos/streak-engine";

const globals = readFileSync("src/app/globals.css", "utf8");
const streakCard = readFileSync("src/components/home/StreakCard.tsx", "utf8");

describe("candle motion", () => {
  it("gives every lit streak stage something that moves", () => {
    // A candle that does not move is a picture of a candle. Each lit stage
    // needs either its own GIF or the CSS flicker — and the unlit one needs
    // neither, because a candle nobody has lit should be still.
    for (const stage of CANDLE_STAGES) {
      const asset = PIXEL_SPRITES[stage];
      expect(asset, `${stage} is missing from the registry`).toBeDefined();
      if (stage === "candle-unlit") {
        expect(asset.animatedSrc, "an unlit candle should not flicker").toBeUndefined();
        expect(asset.ambientClassName).toBeUndefined();
        continue;
      }
      const moves = Boolean(asset.animatedSrc) || Boolean(asset.ambientClassName);
      expect(moves, `${stage} has no GIF and no ambient animation`).toBe(true);
    }
  });

  it("ships the file behind every GIF it promises", () => {
    // A missing GIF is invisible: the still renders, the motion layer 404s,
    // and the candle just looks like it is not animating.
    for (const [name, asset] of Object.entries(PIXEL_SPRITES)) {
      if (!asset.animatedSrc) continue;
      expect(
        existsSync(`public${asset.animatedSrc}`),
        `${name} points at ${asset.animatedSrc}, which is not in public/`,
      ).toBe(true);
    }
  });

  it("lets both the OS and the app stop a GIF", () => {
    // No stylesheet can pause a GIF, so the still is rendered beside it and
    // CSS picks. Losing either rule means reduced motion silently stops
    // working for exactly the sprites that move the most.
    expect(globals).toContain(".pixel-at-rest");
    expect(globals).toContain(".pixel-in-motion");
    expect(globals).toContain("prefers-reduced-motion");
    expect(globals).toContain("force-reduce-motion");
  });

  it("lights the streak candle only on a day that was actually lit", () => {
    // The candle is not a scoreboard. It moves when today has been lit and
    // waits quietly otherwise, rather than animating to imply a streak.
    expect(streakCard).toContain("animate={lit}");
  });
});
