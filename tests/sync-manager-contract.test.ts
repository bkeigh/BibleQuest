import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MANAGER = readFileSync(
  "src/components/app-shell/SyncManager.tsx",
  "utf8",
);
const HANDOFF = readFileSync("src/lib/sync/handoff.ts", "utf8");

describe("native account sync manager boundaries", () => {
  it("stops the current engine when live account availability fails", () => {
    const availabilityBranch = MANAGER.slice(
      MANAGER.indexOf("if (!configured)"),
      MANAGER.indexOf("// Stop any previous account"),
    );

    expect(availabilityBranch).toContain("stopSync()");
  });

  it("requires every private device store to clear before stamping a new owner", () => {
    expect(MANAGER).toContain("!(await purgeAvatarCache())");
    expect(MANAGER).toContain("const rhythmCleared = await clearRhythmState()");
    expect(MANAGER).toContain("!(await clearStandaloneGameData())");
    expect(MANAGER).toContain("withActiveWebPrivateWriteReset(");
    expect(HANDOFF).toContain("const journeyPurged = purgePersistedJourney()");
    expect(HANDOFF).toContain("await purgeAllDeviceLocalJournalDrafts()");
    expect(HANDOFF.match(/requireCurrentLifecycle\(\)/g)?.length).toBeGreaterThan(
      4,
    );
    expect(HANDOFF.indexOf("purgePersistedJourney()")).toBeLessThan(
      HANDOFF.lastIndexOf("setLastSyncedUserId(userId)"),
    );
  });

  it("bounds a silent native handoff and restores an actionable error", () => {
    expect(MANAGER).toContain("NATIVE_HANDOFF_DEADLINE_MS");
    expect(MANAGER).toContain("await withDeadline(");
    expect(MANAGER).toContain('"Native journey handoff"');
    expect(MANAGER).toContain("handoffFailurePending = true");
  });
});
