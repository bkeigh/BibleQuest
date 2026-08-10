import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SETTINGS = readFileSync(
  "src/components/settings/SettingsScreen.tsx",
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
    const purge = clear.indexOf("await purgeJourneyBackup()");
    const reset = clear.indexOf("clearAllData(");

    expect(purge).toBeGreaterThan(-1);
    expect(reset).toBeGreaterThan(purge);
    expect(clear).toContain("resumeJourneyBackupAfterPurge()");
  });

  it("also purges standalone Seven Days, tutorial, and boost records", () => {
    const standalone = SETTINGS.slice(
      SETTINGS.indexOf("function clearStandaloneGameData"),
      SETTINGS.indexOf("function Row"),
    );

    expect(standalone).toContain("clearGameProgress()");
    expect(standalone).toContain("clearSevenDaysProgress()");
    expect(standalone).toContain("SEVEN_DAYS_TUTORIAL_STORAGE_KEY");
    expect(standalone).toContain("BOOST_STORAGE_KEY");

    const deletion = handler("deleteAccount", "\n\n  /** Removes account");
    const clear = handler("clearJourneyData", "\n\n  return (");
    expect(deletion).toContain("clearStandaloneGameData()");
    expect(clear).toContain("clearStandaloneGameData()");
  });
});
