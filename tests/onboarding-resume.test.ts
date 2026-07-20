import { beforeEach, describe, expect, it } from "vitest";
import {
  clearOnboardingResumeStage,
  getOnboardingResumeStage,
  isOnboardingResumePending,
  onboardingLaunchDestination,
  setOnboardingResumeStage,
  shouldRedirectAppToOnboarding,
  shouldTrackOnboardingStarted,
  type OnboardingResumeStage,
} from "@/lib/auth/onboarding-resume";

describe("onboarding account hand-off", () => {
  beforeEach(() => window.localStorage.clear());

  it.each<OnboardingResumeStage>([
    "account",
    "quest",
    "launch",
    "launch_quests",
  ])(
    "persists the non-PII %s stage across an auth or PWA round trip",
    (stage) => {
      setOnboardingResumeStage(stage);

      expect(getOnboardingResumeStage()).toBe(stage);
      expect(
        window.localStorage.getItem(
          "biblequest:onboarding-account-pending",
        ),
      ).toBe(stage);

      clearOnboardingResumeStage();
      expect(getOnboardingResumeStage()).toBeNull();
    },
  );

  it("treats account and quest as unfinished but launch as intentional", () => {
    expect(isOnboardingResumePending("account")).toBe(true);
    expect(isOnboardingResumePending("quest")).toBe(true);
    expect(isOnboardingResumePending("launch")).toBe(false);
    expect(isOnboardingResumePending("launch_quests")).toBe(false);
    expect(isOnboardingResumePending(null)).toBe(false);
  });

  it.each(["account", "quest"] as const)(
    "redirects a completed PWA reopened at /app while %s is pending",
    (stage) => {
      expect(shouldRedirectAppToOnboarding(true, stage)).toBe(true);
    },
  );

  it("allows only an intentional launch or an ordinary completed journey", () => {
    expect(shouldRedirectAppToOnboarding(true, "launch")).toBe(false);
    expect(shouldRedirectAppToOnboarding(true, "launch_quests")).toBe(false);
    expect(shouldRedirectAppToOnboarding(true, null)).toBe(false);
  });

  it("preserves the exact intentional launch destination", () => {
    expect(onboardingLaunchDestination("launch")).toBe("/app");
    expect(onboardingLaunchDestination("launch_quests")).toBe(
      "/app/quests",
    );
    expect(onboardingLaunchDestination("quest")).toBeNull();
  });

  it("always sends an incomplete profile to onboarding", () => {
    expect(shouldRedirectAppToOnboarding(false, null)).toBe(true);
    expect(shouldRedirectAppToOnboarding(false, "launch")).toBe(true);
  });

  it("does not double-count onboarding when resuming account or quest", () => {
    expect(shouldTrackOnboardingStarted(true, "account")).toBe(false);
    expect(shouldTrackOnboardingStarted(true, "quest")).toBe(false);
    expect(shouldTrackOnboardingStarted(false, null)).toBe(true);
  });

  it("fails closed for malformed marker state", () => {
    window.localStorage.setItem(
      "biblequest:onboarding-account-pending",
      "unexpected",
    );
    expect(getOnboardingResumeStage()).toBe("account");
  });
});
