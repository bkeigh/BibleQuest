import { beforeEach, describe, expect, it } from "vitest";
import {
  clearOnboardingResumeStage,
  getOnboardingResumeStage,
  isOnboardingResumePending,
  onboardingLaunchDestination,
  setOnboardingResumeStage,
  shouldAdvanceOnboardingAccountStep,
  shouldKeepCompletedProfileOnOnboarding,
  shouldRedirectAppToOnboarding,
  shouldTrackOnboardingStarted,
  type OnboardingResumeStage,
} from "@/lib/auth/onboarding-resume";

describe("onboarding account hand-off", () => {
  beforeEach(() => window.localStorage.clear());

  it.each<OnboardingResumeStage>([
    "account",
    "guide",
    "quest",
    "plus",
    "launch",
    "launch_quests",
    "launch_plus",
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

  it("recognizes onboarding screens without treating launches as pending", () => {
    expect(isOnboardingResumePending("account")).toBe(true);
    expect(isOnboardingResumePending("guide")).toBe(true);
    expect(isOnboardingResumePending("quest")).toBe(true);
    expect(isOnboardingResumePending("plus")).toBe(true);
    expect(isOnboardingResumePending("launch")).toBe(false);
    expect(isOnboardingResumePending("launch_quests")).toBe(false);
    expect(isOnboardingResumePending("launch_plus")).toBe(false);
    expect(isOnboardingResumePending(null)).toBe(false);
  });

  it.each(["account", "guide", "quest", "plus"] as const)(
    "does not let stale %s state override a completed PWA journey",
    (stage) => {
      expect(shouldRedirectAppToOnboarding(true, stage)).toBe(false);
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
    expect(onboardingLaunchDestination("launch_plus")).toBe("/app/plus");
    expect(onboardingLaunchDestination("quest")).toBeNull();
  });

  it("always sends an incomplete profile to onboarding", () => {
    expect(shouldRedirectAppToOnboarding(false, null)).toBe(true);
    expect(shouldRedirectAppToOnboarding(false, "launch")).toBe(true);
  });

  it("keeps only the intentional Plus preview on the onboarding route", () => {
    expect(shouldKeepCompletedProfileOnOnboarding(true, "plus")).toBe(true);
    expect(shouldKeepCompletedProfileOnOnboarding(true, "account")).toBe(false);
    expect(shouldKeepCompletedProfileOnOnboarding(false, "plus")).toBe(false);
  });

  it("advances an incomplete restored session past the account form", () => {
    expect(shouldAdvanceOnboardingAccountStep(false, "account-a")).toBe(true);
    expect(shouldAdvanceOnboardingAccountStep(false, null)).toBe(false);
    expect(shouldAdvanceOnboardingAccountStep(true, "account-a")).toBe(false);
  });

  it("does not double-count onboarding when resuming any guide stage", () => {
    expect(shouldTrackOnboardingStarted(true, "account")).toBe(false);
    expect(shouldTrackOnboardingStarted(false, "guide")).toBe(false);
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
