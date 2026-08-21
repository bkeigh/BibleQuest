import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  accountAccessDescription,
  initialAccountIntent,
} from "@/lib/auth/account-intent";
import { isStandaloneWebApp } from "@/lib/pwa/install-guidance";

/** Builds the browser signals used by the account-entry decision. */
function appWindow(displayModeStandalone: boolean, iosStandalone = false) {
  return {
    matchMedia: () => ({ matches: displayModeStandalone }),
    navigator: { standalone: iosStandalone } as Navigator & {
      standalone?: boolean;
    },
  };
}

describe("account entry intent", () => {
  it("defaults installed apps to sign-in and browsers to account creation", () => {
    expect(initialAccountIntent(isStandaloneWebApp(appWindow(true)))).toBe(
      "signin",
    );
    expect(initialAccountIntent(isStandaloneWebApp(appWindow(false, true)))).toBe(
      "signin",
    );
    expect(initialAccountIntent(isStandaloneWebApp(appWindow(false)))).toBe(
      "create",
    );
  });

  it("describes only the sign-in methods offered on each platform", () => {
    expect(accountAccessDescription("signin", true)).toBe(
      "Use the email account connected to BibleQuest. We’ll restore its saved journey before opening the app.",
    );
    expect(accountAccessDescription("signin", false)).toBe(
      "Use the email, Apple, or Google account connected to BibleQuest. We’ll restore its saved journey before opening the app.",
    );
    expect(accountAccessDescription("create", true)).toContain(
      "A free account syncs",
    );
  });

  it("keeps manual switching semantic and leaves signed-in rendering first", () => {
    const account = readFileSync(
      path.join(process.cwd(), "src/components/account/AccountScreen.tsx"),
      "utf8",
    );

    expect(account).toContain(
      "initialAccountIntent(isStandaloneWebApp())",
    );
    expect(account).toContain("aria-pressed={selected}");
    expect(account).toContain("onClick={() => setIntent(option)}");
    expect(account).toContain("key={intent}");
    expect(account.indexOf("if (user)")).toBeLessThan(
      account.indexOf('aria-label="Choose account access"'),
    );
  });
});
