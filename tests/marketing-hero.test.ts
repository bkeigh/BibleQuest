import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import dailyVerses from "@/data/seed/daily-verses.json";
import {
  buildHeroVerseRotation,
  HERO_VERSE_IDS,
  HERO_VERSE_ROTATION_MS,
  nextHeroVerseIndex,
} from "@/lib/marketing/hero-verse-rotation";
import type { DailyVerse } from "@/lib/questos/types";

const pool = dailyVerses as DailyVerse[];

describe("marketing hero verse rotation", () => {
  it("starts with today's verse and follows the concise reviewed set", () => {
    const initial = pool.find((verse) => verse.id === "dv050")!;
    const rotation = buildHeroVerseRotation(initial, pool);

    expect(rotation[0]).toBe(initial);
    expect(rotation.slice(1).map((verse) => verse.id)).toEqual(
      HERO_VERSE_IDS,
    );
    expect(new Set(rotation.map((verse) => verse.id)).size).toBe(
      rotation.length,
    );
  });

  it("deduplicates today's verse when it is already curated", () => {
    const initial = pool.find((verse) => verse.id === HERO_VERSE_IDS[0])!;
    const rotation = buildHeroVerseRotation(initial, pool);

    expect(rotation.filter((verse) => verse.id === initial.id)).toHaveLength(1);
    expect(rotation).toHaveLength(HERO_VERSE_IDS.length);
  });

  it("uses a calm interval and wraps the active verse safely", () => {
    expect(HERO_VERSE_ROTATION_MS).toBeGreaterThanOrEqual(8_000);
    expect(nextHeroVerseIndex(0, 4)).toBe(1);
    expect(nextHeroVerseIndex(3, 4)).toBe(0);
    expect(nextHeroVerseIndex(0, 1)).toBe(0);
    expect(nextHeroVerseIndex(Number.NaN, 4)).toBe(0);
  });
});

describe("marketing hero wallpaper", () => {
  it("keeps the live art optional and honors visitor resource preferences", () => {
    const backdrop = readFileSync(
      path.join(
        process.cwd(),
        "src/components/marketing/HeroBackdrop.tsx",
      ),
      "utf8",
    );

    expect(backdrop).toContain("hero-galilee-dawn.webp");
    expect(backdrop).toContain("hero-galilee-dawn-loop.mp4");
    expect(backdrop).toContain("prefers-reduced-motion: no-preference");
    expect(backdrop).toContain("connection?.saveData !== true");
    expect(backdrop).toContain('wideScreen.matches');
    // Keep the still fully opaque and free from a translucent parchment wash.
    expect(backdrop).toContain("opacity-100 sm:object-center");
    expect(backdrop).not.toContain("rgba(255,253,247");
  });

  it("uses the compass sprite for the hero walkthrough action", () => {
    const landingPage = readFileSync(
      path.join(process.cwd(), "src/app/(marketing)/page.tsx"),
      "utf8",
    );

    // Keep the walkthrough action visually distinct from a tombstone silhouette.
    expect(landingPage).toMatch(
      /icon="compass"\s+title="See how it works"/,
    );
  });
});
