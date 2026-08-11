import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const NATIVE_ACCOUNT_SURFACES = [
  "src/components/account/AccountScreen.tsx",
  "src/components/settings/SettingsScreen.tsx",
  "src/components/app-shell/SyncManager.tsx",
  "src/components/onboarding/OnboardingGate.tsx",
];

describe("native account sign-out surfaces", () => {
  it("routes every native user sign-out through expected-user protection", () => {
    for (const path of NATIVE_ACCOUNT_SURFACES) {
      const source = readFileSync(path, "utf8");

      expect(source, path).toContain("signOutExpectedAccount(");
      expect(source, path).not.toMatch(/\.auth\.signOut\s*\(/);
    }

    expect(readFileSync(NATIVE_ACCOUNT_SURFACES[0], "utf8")).toContain(
      "signOutExpectedAccount(expectedUserId)",
    );
    expect(readFileSync(NATIVE_ACCOUNT_SURFACES[1], "utf8")).toContain(
      "signOutExpectedAccount(expectedUserId)",
    );
    expect(readFileSync(NATIVE_ACCOUNT_SURFACES[2], "utf8")).toContain(
      "signOutExpectedAccount(userId)",
    );
    expect(readFileSync(NATIVE_ACCOUNT_SURFACES[3], "utf8")).toContain(
      "signOutExpectedAccount(userId)",
    );
  });
});
