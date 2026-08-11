import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SETTINGS = readFileSync(
  "src/components/settings/SettingsScreen.tsx",
  "utf8",
);
const DEVICE_CLEANUP = readFileSync(
  "src/lib/auth/device-account-cleanup.ts",
  "utf8",
);

/** Returns one Settings handler so ordering assertions stay narrowly scoped. */
function handler(name: string, nextMarker: string): string {
  const start = SETTINGS.indexOf(`async function ${name}`);
  const end = SETTINGS.indexOf(nextMarker, start);
  return SETTINGS.slice(start, end);
}

describe("Settings device-data purge", () => {
  it("awaits the native mirror purge before resetting the primary journey", () => {
    const clear = handler("clearJourneyData", "\n\n  return (");
    const purge = clear.indexOf("purgeJourneyBackup()");
    const reset = clear.indexOf("clearAllData(");

    expect(purge).toBeGreaterThan(-1);
    expect(reset).toBeGreaterThan(purge);
    expect(clear).toContain("withDeadline(");
    expect(clear).toContain("resumeJourneyBackupAfterPurge()");
  });

  it("also purges standalone Seven Days, tutorial, and boost records", () => {
    const standalone = DEVICE_CLEANUP.slice(
      DEVICE_CLEANUP.indexOf("function clearStandaloneGameData"),
      DEVICE_CLEANUP.indexOf("export function purgeDeletedAccountDeviceData"),
    );

    expect(standalone).toContain("clearGameProgress()");
    expect(standalone).toContain("clearSevenDaysProgress()");
    expect(standalone).toContain("SEVEN_DAYS_TUTORIAL_STORAGE_KEY");
    expect(standalone).toContain("BOOST_STORAGE_KEY");

    const deletion = handler("deleteAccount", "\n\n  /** Removes account");
    const clear = handler("clearJourneyData", "\n\n  return (");
    expect(deletion).toContain("purgeDeletedAccountDeviceData(");
    expect(DEVICE_CLEANUP).toContain("clearStandaloneGameData,");
    expect(clear).toContain("clearStandaloneGameData()");
  });

  it("cancels native reminders during both destructive Settings paths", () => {
    const deletion = handler("deleteAccount", "\n\n  /** Removes account");
    const clear = handler("clearJourneyData", "\n\n  return (");

    expect(deletion).toContain("purgeDeletedAccountDeviceData(");
    expect(DEVICE_CLEANUP).toContain("purgeNativeReminders");
    expect(clear).toContain("purgeNativeReminders(),");
  });

  it("always releases the clear button and returns to onboarding", () => {
    const clear = handler("clearJourneyData", "\n\n  return (");
    const finallyBlock = clear.slice(clear.indexOf("} finally {"));

    expect(finallyBlock).toContain("setConfirmClear(false)");
    expect(finallyBlock).toContain("setClearingData(false)");
    expect(clear).toContain('router.replace("/onboarding")');
    expect(clear).not.toContain("window.location.replace");
  });
});
