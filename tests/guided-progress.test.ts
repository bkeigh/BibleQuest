import { describe, expect, it } from "vitest";
import {
  advanceGuidedSession,
  beginGuidedSession,
  guidedProgressPercent,
  isGuidedSessionProgress,
  makeGuidedSessionKey,
  mergeGuidedProgressRecords,
  nextGuidedMovement,
  sanitizeGuidedProgress,
} from "@/lib/guided/progress";
import { GUIDED_MOVEMENT_KEYS } from "@/lib/questos/types";

const CONTENT_ID = "pilgrimage.learning-to-remain.day-01.v1";
const SESSION_KEY = makeGuidedSessionKey("pilgrimage_day", CONTENT_ID);
const START = "2026-07-29T12:00:00.000Z";

describe("guided progress engine", () => {
  it("creates stable day-scoped and timeless Pilgrimage session keys", () => {
    expect(
      makeGuidedSessionKey(
        "daily",
        "guide.daily.green-pastures.v1",
        "2026-07-29",
      ),
    ).toBe("daily|2026-07-29|guide.daily.green-pastures.v1");
    expect(SESSION_KEY).toBe(
      "pilgrimage|pilgrimage.learning-to-remain.day-01.v1",
    );
    expect(() =>
      makeGuidedSessionKey("daily", "guide.daily.green-pastures.v1"),
    ).toThrow("valid local date");
  });

  it("advances idempotently in canonical order and completes at Pray", () => {
    let progress = beginGuidedSession(
      SESSION_KEY,
      CONTENT_ID,
      "pilgrimage_day",
      START,
    )!;
    expect(nextGuidedMovement(progress)).toBe("arrive");
    expect(guidedProgressPercent(progress)).toBe(0);

    for (const [index, movement] of GUIDED_MOVEMENT_KEYS.entries()) {
      progress = advanceGuidedSession(
        progress,
        movement,
        `2026-07-29T12:0${index + 1}:00.000Z`,
      );
      progress = advanceGuidedSession(
        progress,
        movement,
        `2026-07-29T12:0${index + 1}:00.000Z`,
      );
    }

    expect(progress.completedMovements).toEqual([...GUIDED_MOVEMENT_KEYS]);
    expect(progress.completedAt).toBe("2026-07-29T12:06:00.000Z");
    expect(guidedProgressPercent(progress)).toBe(100);
  });

  it("unions two devices monotonically without changing daily history", () => {
    const base = beginGuidedSession(
      SESSION_KEY,
      CONTENT_ID,
      "pilgrimage_day",
      START,
    )!;
    const deviceA = advanceGuidedSession(
      advanceGuidedSession(base, "arrive", "2026-07-29T12:01:00.000Z"),
      "read",
      "2026-07-29T12:02:00.000Z",
    );
    const deviceB = ["arrive", "read", "notice", "reflect"].reduce(
      (progress, movement, index) =>
        advanceGuidedSession(
          progress,
          movement as (typeof GUIDED_MOVEMENT_KEYS)[number],
          `2026-07-29T12:0${index + 1}:30.000Z`,
        ),
      base,
    );
    const daily = beginGuidedSession(
      "daily|2026-07-29|guide.daily.green-pastures.v1",
      "guide.daily.green-pastures.v1",
      "daily",
      START,
    )!;

    const merged = mergeGuidedProgressRecords(
      { [SESSION_KEY]: deviceA, [daily.sessionKey]: daily },
      { [SESSION_KEY]: deviceB },
    );
    expect(merged[SESSION_KEY].completedMovements).toEqual([
      "arrive",
      "read",
      "notice",
      "reflect",
    ]);
    expect(merged[daily.sessionKey]).toEqual(daily);
  });

  it("drops malformed imports instead of inventing completion", () => {
    expect(
      sanitizeGuidedProgress({
        mismatch: {
          sessionKey: SESSION_KEY,
          contentId: CONTENT_ID,
          kind: "pilgrimage_day",
          completedMovements: ["pray"],
          startedAt: START,
          updatedAt: START,
        },
        [SESSION_KEY]: {
          sessionKey: SESSION_KEY,
          contentId: CONTENT_ID,
          kind: "pilgrimage_day",
          completedMovements: ["unknown"],
          startedAt: START,
          updatedAt: START,
        },
      }),
    ).toEqual({});
  });

  it("rejects future-poisoned or internally impossible progress clocks", () => {
    const completed = GUIDED_MOVEMENT_KEYS.reduce(
      (progress, movement, index) =>
        advanceGuidedSession(
          progress,
          movement,
          `2026-07-29T12:0${index + 1}:00.000Z`,
        ),
      beginGuidedSession(
        SESSION_KEY,
        CONTENT_ID,
        "pilgrimage_day",
        START,
      )!,
    );

    expect(
      isGuidedSessionProgress({
        ...completed,
        completedAt: "2026-07-29T12:07:00.000Z",
      }),
    ).toBe(false);
    expect(
      isGuidedSessionProgress({
        ...completed,
        updatedAt: "2099-07-29T12:06:00.000Z",
        completedAt: "2099-07-29T12:06:00.000Z",
      }),
    ).toBe(false);
  });

  it("refuses to skip an unfinished movement", () => {
    const started = beginGuidedSession(
      SESSION_KEY,
      CONTENT_ID,
      "pilgrimage_day",
      START,
    )!;
    expect(
      advanceGuidedSession(
        started,
        "notice",
        "2026-07-29T12:01:00.000Z",
      ),
    ).toBe(started);
  });

  it("keeps old Pilgrimage progress ahead of newer daily history", () => {
    const pilgrimage = beginGuidedSession(
      SESSION_KEY,
      CONTENT_ID,
      "pilgrimage_day",
      "2025-01-01T12:00:00.000Z",
    )!;
    const daily = Object.fromEntries(
      Array.from({ length: 500 }, (_, index) => {
        const suffix = String(index + 1).padStart(3, "0");
        const contentId = `guide.daily.retention-${suffix}.v1`;
        const sessionKey = makeGuidedSessionKey(
          "daily",
          contentId,
          "2026-07-29",
        );
        return [
          sessionKey,
          beginGuidedSession(
            sessionKey,
            contentId,
            "daily",
            "2026-07-29T12:00:00.000Z",
          )!,
        ];
      }),
    );

    const sanitized = sanitizeGuidedProgress({
      ...daily,
      [SESSION_KEY]: pilgrimage,
    });

    expect(Object.keys(sanitized)).toHaveLength(500);
    expect(sanitized[SESSION_KEY]).toEqual(pilgrimage);
  });
});
