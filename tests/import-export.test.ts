import { describe, expect, it } from "vitest";
import { parseSnapshot } from "@/lib/questos/import-schema";
import { createExportSnapshot } from "@/lib/questos/snapshot";
import { currentSnapshot } from "./fixtures";

describe("journey import and export", () => {
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
});
