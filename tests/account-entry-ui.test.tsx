import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Keep the shared picker independent from live account availability in tests.
vi.mock("@/lib/sync/containment", () => ({
  ACCOUNT_SYNC_CONTAINED: false,
  accountSyncAvailable: (configured: boolean) => configured,
}));

import { AccountIntentPicker } from "@/components/account/AccountIntentPicker";

/** Guards the visible split between first-time enrollment and account return. */
describe("account entry UI", () => {
  it("shows both account paths without making a returning user hunt for sign-in", () => {
    const markup = renderToStaticMarkup(
      createElement(AccountIntentPicker, {
        intent: "signin",
        onIntentChange: () => undefined,
      }),
    );

    expect(markup).toContain("New to BibleQuest?");
    expect(markup).toContain("Create account");
    expect(markup).toContain("Already have an account?");
    expect(markup).toContain("Sign in");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
  });

  it("uses the same choice in onboarding and account settings", () => {
    const onboarding = readFileSync(
      "src/components/onboarding/OnboardingFlow.tsx",
      "utf8",
    );
    const account = readFileSync(
      "src/components/account/AccountScreen.tsx",
      "utf8",
    );

    expect(onboarding).toContain("<AccountIntentPicker");
    expect(account).toContain("<AccountIntentPicker");
    expect(onboarding).toContain(
      "You’ll stay signed in securely on this device until you choose",
    );
  });
});
