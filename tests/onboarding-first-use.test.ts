import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seedQuests } from "@/data/seed/quests";
import {
  ONBOARDING_STARTER_MAX_MINUTES,
  ONBOARDING_STARTER_QUEST_SLUGS,
  onboardingStarterQuests,
} from "@/lib/questos/onboarding-starter-quests";

describe("first-use onboarding", () => {
  it("offers only the reviewed low-risk starter pool", () => {
    const starters = onboardingStarterQuests(seedQuests);

    expect(starters.map((quest) => quest.slug)).toEqual(
      ONBOARDING_STARTER_QUEST_SLUGS,
    );
    for (const quest of starters) {
      expect(quest.durationMinutes).toBeLessThanOrEqual(
        ONBOARDING_STARTER_MAX_MINUTES,
      );
      expect(quest.difficulty).toBe("gentle");
      expect(quest.soloOrSocial).toBe("solo");
      expect(quest.sensitivityTags).toEqual([]);
      expect(quest.isPremium).toBe(false);
    }
  });

  it("fails closed when reviewed starter metadata becomes unsuitable", () => {
    const changedCatalog = seedQuests.map((quest) =>
      quest.slug === ONBOARDING_STARTER_QUEST_SLUGS[0]
        ? { ...quest, sensitivityTags: ["grief_sensitive"] }
        : quest,
    );

    expect(
      onboardingStarterQuests(changedCatalog).map((quest) => quest.slug),
    ).toEqual(ONBOARDING_STARTER_QUEST_SLUGS.slice(1));
  });

  it("moves from a six-step guide into the free app without a Plus interstitial", () => {
    const source = readFileSync(
      "src/components/onboarding/OnboardingFlow.tsx",
      "utf8",
    );

    expect(source).toContain("const TOTAL_STEPS = FIRST_QUEST_STEP + 1");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('router.replace("/app")');
    expect(source).toContain('"Add this quest to today"');
    expect(source).not.toContain('"Start with this quest"');
    expect(source).toContain("Choose your language and Bible");
    expect(source).not.toContain("function StepPlus");
    expect(source).not.toContain("Explore BibleQuest Plus");
    expect(source).not.toContain('router.replace("/app/plus")');
  });

  it("defers persistent prompts until after value and never stacks them", () => {
    const shell = readFileSync("src/components/app-shell/AppShell.tsx", "utf8");
    const settings = readFileSync("src/lib/questos/types.ts", "utf8");

    expect(shell).toContain("hasCompletedQuest && (");
    expect(shell).toContain("!installPromptVisible &&");
    expect(shell).toContain(
      "onVisibilityChange={handleInstallPromptVisibility}",
    );
    expect(settings).toContain("myShepherdFloatingButton: false");
  });

  it("makes the only available local path visually primary", () => {
    const source = readFileSync(
      "src/components/onboarding/OnboardingFlow.tsx",
      "utf8",
    );

    expect(source).toContain(
      'variant={accountEnabled ? "ghost" : "primary"}',
    );
    expect(source).toContain('size={accountEnabled ? "sm" : "lg"}');
    expect(source).toContain("{authUnavailable && accountEnabled && (");
    expect(source).toContain("You can continue privately on");
  });

  it("opens every guide page at the top after a longer step scrolls", () => {
    const source = readFileSync(
      "src/components/onboarding/OnboardingFlow.tsx",
      "utf8",
    );

    expect(source).toContain(
      'mainRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" })',
    );
    expect(source).toContain(
      'window.scrollTo({ top: 0, left: 0, behavior: "auto" })',
    );
    expect(source).toContain("ref={mainRef}");
  });
});
