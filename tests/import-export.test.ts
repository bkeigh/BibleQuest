import { describe, expect, it } from "vitest";
import { seedMilestones } from "@/data/seed/milestones";
import {
  MAX_IMPORT_FILE_BYTES,
  parseSnapshot,
} from "@/lib/questos/import-schema";
import { createExportSnapshot } from "@/lib/questos/snapshot";
import { currentSnapshot } from "./fixtures";

describe("journey import and export", () => {
  it("rejects oversized files and collections before restore", () => {
    const oversizedFile = parseSnapshot(
      " ".repeat(MAX_IMPORT_FILE_BYTES + 1),
    );
    expect(oversizedFile).toEqual({
      ok: false,
      error: "That journey is too large to restore safely.",
    });

    const oversizedCollection = parseSnapshot(
      JSON.stringify({
        prayers: Array.from({ length: 20_001 }, () => null),
      }),
    );
    expect(oversizedCollection).toEqual({
      ok: false,
      error: "That journey is too large to restore safely.",
    });
  });

  it("round-trips the current snapshot including My Quests lifecycle and steps", () => {
    const exported = createExportSnapshot(currentSnapshot());
    const result = parseSnapshot(JSON.stringify(exported));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.myQuests?.["fixture-walk"]?.status).toBe("paused");
    expect(result.data.myQuests?.["fixture-walk"]?.stepsDone).toEqual([
      "scripture",
      "live",
    ]);
    expect(result.data.myQuests?.["fixture-walk"]?.timesCompleted).toBe(2);
    expect(result.data.accountNudge?.shownContexts).toEqual(["onboarding"]);
    const { analyticsConsent, ...settingsWithoutConsent } = exported.settings;
    expect(analyticsConsent).toBe(false);
    expect(result.data).toEqual({
      ...exported,
      pendingMilestones: [],
      settings: settingsWithoutConsent,
    });
  });

  it("normalizes the legacy single-assignment shape", () => {
    const legacy = {
      assignments: {
        "2026-07-15": {
          dateKey: "2026-07-15",
          questSlug: "legacy-fixture",
          status: "assigned",
          rerolls: 1,
        },
      },
    };
    const result = parseSnapshot(JSON.stringify(legacy));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.data.assignments?.["2026-07-15"])).toBe(true);
    expect(result.data.assignments?.["2026-07-15"]?.[0]?.questSlug).toBe(
      "legacy-fixture"
    );
  });

  it("sanitizes untrusted Bible translation preferences", () => {
    const invalid = parseSnapshot(
      JSON.stringify({
        settings: { preferredBibleTranslation: { startsWith: "boom" } },
      }),
    );
    expect(invalid.ok).toBe(true);
    if (!invalid.ok) return;
    expect(invalid.data.settings?.preferredBibleTranslation).toBe("kjv");

    const connected = parseSnapshot(
      JSON.stringify({
        settings: {
          preferredBibleTranslation: "api:de4e12af7f28f599-02",
        },
      }),
    );
    expect(connected.ok).toBe(true);
    if (!connected.ok) return;
    expect(connected.data.settings?.preferredBibleTranslation).toBe(
      "api:de4e12af7f28f599-02",
    );
  });

  it("clamps imported glass opacity and drops malformed values", () => {
    const belowFloor = parseSnapshot(
      JSON.stringify({ settings: { appearance: { glassOpacity: 0 } } }),
    );
    expect(belowFloor.ok).toBe(true);
    if (!belowFloor.ok) return;
    expect(belowFloor.data.settings?.appearance?.glassOpacity).toBe(15);

    const aboveCeiling = parseSnapshot(
      JSON.stringify({ settings: { appearance: { glassOpacity: 140 } } }),
    );
    expect(aboveCeiling.ok).toBe(true);
    if (!aboveCeiling.ok) return;
    expect(aboveCeiling.data.settings?.appearance?.glassOpacity).toBe(100);

    const malformed = parseSnapshot(
      JSON.stringify({
        settings: { appearance: { glassOpacity: "fully-clear" } },
      }),
    );
    expect(malformed.ok).toBe(true);
    if (!malformed.ok) return;
    expect(malformed.data.settings?.appearance).not.toHaveProperty(
      "glassOpacity",
    );
  });

  it("drops malformed nested settings before they can crash restore", () => {
    const result = parseSnapshot(
      JSON.stringify({
        settings: {
          notifications: null,
          questDurationPreference: "all-day",
          questCategoryPreference: { category: "prayer" },
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.settings).not.toHaveProperty("notifications");
    expect(result.data.settings?.questDurationPreference).toEqual([]);
    expect(result.data.settings?.questCategoryPreference).toEqual([]);
  });

  it("drops malformed records and returns content-free errors", () => {
    const marker = "fixture-private-marker";
    const malformed = JSON.stringify({
      prayers: [
        {
          id: "fixture-id",
          body: marker,
          category: "not-a-category",
          status: "not-a-status",
          createdAt: "bad-date",
          updatedAt: "bad-date",
        },
      ],
      reflections: [
        {
          id: "fixture-id",
          body: marker,
          mood: "not-a-mood",
          createdAt: "bad-date",
          updatedAt: "bad-date",
        },
      ],
      myQuests: {
        malformed: {
          questSlug: "malformed",
          status: "active",
          addedAt: "bad-date",
          lastActivityAt: "bad-date",
          stepsDone: [marker],
          timesCompleted: 0,
        },
      },
    });
    const result = parseSnapshot(malformed);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.prayers?.length).toBe(0);
    expect(result.data.reflections?.length).toBe(0);
    expect(Object.keys(result.data.myQuests ?? {}).length).toBe(0);

    const invalid = parseSnapshot(`{${marker}`);
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.error.includes(marker)).toBe(false);
  });

  it("rejects malformed journal archive metadata without echoing content", () => {
    const snapshot = currentSnapshot();
    const marker = "fixture-private-archive-marker";
    const malformed = {
      ...snapshot,
      prayers: [{ ...snapshot.prayers[0], archivedAt: { marker } }],
      reflections: [{ ...snapshot.reflections[0], archivedAt: 42 }],
    };

    const result = parseSnapshot(JSON.stringify(malformed));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.prayers).toEqual([]);
    expect(result.data.reflections).toEqual([]);
    expect(JSON.stringify(result.data)).not.toContain(marker);
  });

  it("keeps only complete, unique, positive growth ledger entries", () => {
    const valid = {
      id: "growth-valid",
      growthType: "roots",
      amount: 1,
      sourceType: "prayer_created",
      occurredAt: "2026-07-16T12:00:00.000Z",
    };
    const result = parseSnapshot(
      JSON.stringify({
        growthEvents: [
          valid,
          { ...valid, amount: 20 },
          { ...valid, id: "missing-source", sourceType: undefined },
          { ...valid, id: "unknown-growth", growthType: "moss" },
          { ...valid, id: "unknown-source", sourceType: "app_opened" },
          { ...valid, id: "zero", amount: 0 },
          { ...valid, id: "fractional", amount: 1.5 },
          { ...valid, id: "bad-time", occurredAt: "not-a-timestamp" },
          {
            ...valid,
            id: "bad-calendar-date",
            occurredAt: "2026-02-31T12:00:00.000Z",
          },
          {
            ...valid,
            id: "missing-timezone",
            occurredAt: "2026-07-16T12:00:00.000",
          },
          { growthType: "roots", amount: 1 },
        ],
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.growthEvents).toEqual([valid]);
  });

  it("deduplicates and rejects malformed milestone-bearing history", () => {
    const event = {
      id: "journey-valid",
      type: "prayer_created",
      title: "Prayer written",
      dateKey: "2026-07-16",
      occurredAt: "2026-07-16T12:00:00.000Z",
    };
    const completion = {
      id: "completion-valid",
      questSlug: "legacy-quest",
      dateKey: "2026-07-16",
      completedAt: "2026-07-16T12:00:00.000Z",
    };
    const result = parseSnapshot(
      JSON.stringify({
        journeyEvents: [
          event,
          event,
          { ...event, id: "duplicate-source", sourceId: "prayer:one" },
          { ...event, id: "duplicate-source-two", sourceId: "prayer:one" },
          { ...event, id: "unknown-type", type: "app_opened" },
          { ...event, id: "bad-day", dateKey: "2026-02-31" },
          { ...event, id: "far-day", dateKey: "2025-01-01" },
          { ...event, id: "bad-time", occurredAt: "not-a-timestamp" },
        ],
        completions: [
          completion,
          completion,
          { ...completion, id: "bad-completion-day", dateKey: "today" },
          { ...completion, id: "bad-completion-time", completedAt: "later" },
        ],
        streak: { current: -2, longest: 1, lastActiveDateKey: "yesterday" },
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.journeyEvents).toEqual([
      { ...event, id: "duplicate-source", sourceId: "prayer:one" },
    ]);
    expect(result.data.completions).toEqual([completion]);
    expect(result.data.streak).toBeUndefined();
  });

  it("filters retired and duplicate pending milestone reveals", () => {
    const first = seedMilestones[0].key;
    const second = seedMilestones[1].key;
    const result = parseSnapshot(
      JSON.stringify({
        pendingMilestones: [
          "retired-milestone",
          first,
          first,
          42,
          second,
        ],
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pendingMilestones).toEqual([first, second]);
  });
});
