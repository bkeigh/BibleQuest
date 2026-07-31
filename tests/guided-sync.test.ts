import { afterEach, describe, expect, it, vi } from "vitest";
import {
  guidedProgressToRows,
  rowsToGuidedProgress,
} from "@/lib/sync/mapping";
import {
  advanceGuidedSession,
  beginGuidedSession,
  makeGuidedSessionKey,
  mergeGuidedProgressRecords,
} from "@/lib/guided/progress";

const CONTENT_ID = "pilgrimage.learning-to-remain.day-01.v1";
const SESSION_KEY = makeGuidedSessionKey("pilgrimage_day", CONTENT_ID);
const USER_ID = "00000000-0000-4000-8000-000000000001";

describe("guided pilgrimage account sync mapping", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips only non-sensitive append-only Pilgrimage markers", () => {
    let pilgrimage = beginGuidedSession(
      SESSION_KEY,
      CONTENT_ID,
      "pilgrimage_day",
      "2026-07-29T12:00:00.000Z",
    )!;
    pilgrimage = advanceGuidedSession(
      pilgrimage,
      "arrive",
      "2026-07-29T12:01:00.000Z",
    );
    pilgrimage = advanceGuidedSession(
      pilgrimage,
      "read",
      "2026-07-29T12:02:00.000Z",
    );
    const daily = beginGuidedSession(
      "daily|2026-07-29|guide.daily.green-pastures.v1",
      "guide.daily.green-pastures.v1",
      "daily",
      "2026-07-29T12:00:00.000Z",
    )!;

    const rows = guidedProgressToRows(USER_ID, {
      [SESSION_KEY]: pilgrimage,
      [daily.sessionKey]: daily,
    });
    expect(rows.map(({ movement_key }) => movement_key)).toEqual([
      "started",
      "arrive",
      "read",
    ]);
    expect(JSON.stringify(rows)).not.toMatch(
      /prayer|reflection|scripture_text|journal|display_name/,
    );
    const restored = rowsToGuidedProgress(rows);
    expect(restored[SESSION_KEY].completedMovements).toEqual([
      "arrive",
      "read",
    ]);
    expect(restored).not.toHaveProperty(daily.sessionKey);
  });

  it("merges disjoint device markers without regression", () => {
    const rowsA = [
      {
        user_id: USER_ID,
        session_key: SESSION_KEY,
        content_id: CONTENT_ID,
        movement_key: "started" as const,
        occurred_at: "2026-07-29T12:00:00.000Z",
      },
      {
        user_id: USER_ID,
        session_key: SESSION_KEY,
        content_id: CONTENT_ID,
        movement_key: "arrive" as const,
        occurred_at: "2026-07-29T12:01:00.000Z",
      },
    ];
    const rowsB = [
      rowsA[0],
      {
        user_id: USER_ID,
        session_key: SESSION_KEY,
        content_id: CONTENT_ID,
        movement_key: "read" as const,
        occurred_at: "2026-07-29T12:02:00.000Z",
      },
    ];

    const merged = mergeGuidedProgressRecords(
      rowsToGuidedProgress(rowsA),
      rowsToGuidedProgress(rowsB),
    );
    expect(merged[SESSION_KEY].completedMovements).toEqual(["arrive", "read"]);
  });

  it("canonicalizes Postgres offsets and rejects malformed or future rows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:10:00.000Z"));
    const base = {
      user_id: USER_ID,
      session_key: SESSION_KEY,
      content_id: CONTENT_ID,
      movement_key: "started" as const,
    };
    const restored = rowsToGuidedProgress([
      {
        ...base,
        occurred_at: "2026-07-29T08:00:00-04:00",
      },
      {
        ...base,
        movement_key: "arrive",
        occurred_at: "2026-07-29T12:01:00+00:00",
      },
      {
        ...base,
        movement_key: "read",
        occurred_at: "not-a-timestamp",
      },
      {
        ...base,
        movement_key: "pray",
        occurred_at: "2099-07-29T12:00:00+00:00",
      },
    ]);

    expect(restored[SESSION_KEY]).toMatchObject({
      startedAt: "2026-07-29T12:00:00.000Z",
      updatedAt: "2026-07-29T12:01:00.000Z",
      completedMovements: ["arrive"],
    });
    expect(restored[SESSION_KEY].completedAt).toBeUndefined();
  });
});
