import { describe, expect, it } from "vitest";
import {
  dailyGameSessionKey,
  selectDailyGame,
} from "@/lib/games/selection";
import { getDailyGameSnapshot } from "@/lib/games/daily-status";
import {
  createConnectionsProgress,
  createTimelineProgress,
} from "@/lib/games/engine";
import { writeGameProgress } from "@/lib/games/storage";

const allEnabled = {
  games: true,
  scriptureConnections: true,
  bibleTimeline: true,
};

describe("daily Scripture game selection", () => {
  it("returns one stable free game for the same local date", () => {
    const first = selectDailyGame("2026-08-01", allEnabled);
    const second = selectDailyGame("2026-08-01", allEnabled);
    expect(first?.id).toBe(second?.id);
    expect(first).toBe(second);
  });

  it("alternates enabled formats across consecutive days", () => {
    const first = selectDailyGame("2026-08-01", allEnabled);
    const second = selectDailyGame("2026-08-02", allEnabled);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.kind).not.toBe(second?.kind);
  });

  it("honors the master and per-format kill switches", () => {
    expect(
      selectDailyGame("2026-08-01", { ...allEnabled, games: false }),
    ).toBeNull();
    expect(
      selectDailyGame("2026-08-01", {
        games: true,
        scriptureConnections: false,
        bibleTimeline: true,
      })?.kind,
    ).toBe("timeline");
  });

  it("uses an identity-free session key for local resume", () => {
    expect(dailyGameSessionKey("2026-08-01", "timeline-exodus")).toBe(
      "2026-08-01:timeline-exodus",
    );
  });

  it("exposes Start and Resume orientation for integrating surfaces", async () => {
    const first = getDailyGameSnapshot(
      "2026-08-01",
      allEnabled,
      window.localStorage,
    );
    expect(first.actionLabel).toBe("Start game");
    expect(first.href).toBe("/app/games");
    expect(first.puzzle).not.toBeNull();
    if (!first.puzzle || !first.sessionKey) return;
    const progress =
      first.puzzle.kind === "connections"
        ? createConnectionsProgress(first.puzzle, first.sessionKey, 1)
        : createTimelineProgress(first.puzzle, first.sessionKey, 1);
    await expect(writeGameProgress(progress, first.puzzle)).resolves.toBe(true);
    expect(
      getDailyGameSnapshot("2026-08-01", allEnabled, window.localStorage)
        .actionLabel,
    ).toBe("Resume game");

    const completed =
      first.puzzle.kind === "connections" && progress.kind === "connections"
        ? {
            ...progress,
            status: "revealed" as const,
            learningEventRecorded: true,
            selectedTerms: [],
          }
        : first.puzzle.kind === "timeline" && progress.kind === "timeline"
          ? {
              ...progress,
              status: "revealed" as const,
              learningEventRecorded: true,
              itemOrder: first.puzzle.items.map((item) => item.id),
            }
          : null;
    expect(completed).not.toBeNull();
    if (!completed) return;
    await expect(writeGameProgress(completed, first.puzzle)).resolves.toBe(
      true,
    );
    expect(
      getDailyGameSnapshot("2026-08-01", allEnabled, window.localStorage)
        .actionLabel,
    ).toBe("Review learning");
  });
});
