import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { WebCommerceOnly } from "@/components/plus/WebCommerceOnly";

const PLATFORM = "NEXT_PUBLIC_APP_PLATFORM";
const originalPlatform = process.env[PLATFORM];

/** Reads a checked-in surface for stable native-commerce boundary assertions. */
function source(path: string): string {
  return readFileSync(path, "utf8");
}

afterEach(() => {
  if (originalPlatform === undefined) delete process.env[PLATFORM];
  else process.env[PLATFORM] = originalPlatform;
});

describe("native commerce gating", () => {
  it("keeps web markup and removes the same acquisition markup on native", () => {
    process.env[PLATFORM] = "web";
    expect(
      renderToStaticMarkup(
        createElement(WebCommerceOnly, null, createElement("span", null, "Buy")),
      ),
    ).toBe("<span>Buy</span>");

    process.env[PLATFORM] = "native";
    expect(
      renderToStaticMarkup(
        createElement(WebCommerceOnly, null, createElement("span", null, "Buy")),
      ),
    ).toBe("");
  });

  it("gates every known web-only store and Plus action family", () => {
    for (const path of [
      "src/components/plus/PlusFeatureDialog.tsx",
      "src/components/games/GamesScreen.tsx",
      "src/components/games/seven-days/SevenDaysMatchScreen.tsx",
      "src/components/games/GamesArchiveScreen.tsx",
      "src/components/games/ArchiveGameScreen.tsx",
      "src/components/quests/QuestGenerator.tsx",
      "src/components/rhythm/RhythmBuilder.tsx",
      "src/components/guided/PilgrimageCatalog.tsx",
      "src/components/guided/PilgrimageDay.tsx",
      "src/components/guided/PilgrimageDetail.tsx",
      "src/components/shepherd/MyShepherd.tsx",
      "src/components/shepherd/FloatingMyShepherd.tsx",
      "src/components/bible/VerseRefreshLimitDialog.tsx",
    ]) {
      expect(source(path), path).toContain("WebCommerceOnly");
    }
  });

  it("omits unavailable wallpaper controls and free-user Plus chrome", () => {
    const settings = source("src/components/settings/SettingsScreen.tsx");
    const shell = source("src/components/app-shell/AppShell.tsx");
    const quests = source("src/components/quests/QuestBrowse.tsx");
    const rhythm = source("src/components/rhythm/RhythmBuilder.tsx");
    const home = source("src/components/home/HomeScreen.tsx");

    // Anchored on the wallpaper controls themselves. A bare
    // `{!nativeTarget && (` is also how the analytics toggle further down is
    // gated, so this test passed its own name while both wallpaper gates
    // could have been deleted outright.
    expect(settings).toMatch(/\{!nativeTarget && \(\s*<WallpaperPicker/);
    expect(settings).toMatch(
      /\{!nativeTarget && \(\s*<Row label="Wallpaper style">/,
    );
    expect(settings).toContain("{(!nativeTarget || isPlus) && (");
    expect(shell).toContain("(!isNativeTarget() || isPlus)");
    expect(quests).toMatch(
      /\{\(!nativeTarget \|\| isPlus\) && \(\s*<Disclosure\s+label="Generate a quest"/,
    );
    expect(rhythm).toMatch(
      /\{\(!nativeTarget \|\| isPlus\) && \(\s*<>\s*<label[^>]*>\s*Busy-day alternative/,
    );
    expect(home).toContain("nativeTarget ? undefined");
  });

  it("prunes native commerce routes and verifies the export postcondition", () => {
    const builder = source("scripts/build-native.mjs");

    expect(builder).toContain('"src/app/app/plus"');
    expect(builder).toContain('"src/app/app/games/store"');
    expect(builder).toContain("verifyCommerceRoutesPruned();");
  });

  it("normalizes stale web-only onboarding hand-offs on native", () => {
    const gate = source("src/components/onboarding/OnboardingGate.tsx");
    const flow = source("src/components/onboarding/OnboardingFlow.tsx");

    expect(gate).toContain('destination === "/app/plus"');
    expect(gate).toContain('? "/app"');
    expect(flow).toContain('setOnboardingResumeStage("launch")');
    expect(flow).not.toContain('router.replace("/app")');
    expect(gate).toContain('router.replace(launchDestination ?? "/app")');
    expect(flow).not.toContain("PLUS_STEP");
    expect(flow).not.toContain("function StepPlus");
  });
});
