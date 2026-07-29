import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeGuidedSessionKey } from "@/lib/guided/progress";
import { useQuestOS } from "@/lib/questos/store";
import { GUIDED_MOVEMENT_KEYS } from "@/lib/questos/types";

const trackEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics/events", () => ({
  track: trackEvent,
  setAnalyticsConsent: vi.fn(),
}));

const CONTENT_ID = "pilgrimage.learning-to-remain.day-01.v1";
const SESSION_KEY = makeGuidedSessionKey("pilgrimage_day", CONTENT_ID);

describe("guided progress store boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:00:00.000Z"));
    trackEvent.mockClear();
    useQuestOS.getState().clearAllData();
    trackEvent.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists Start and Resume without creating Journey or growth", () => {
    const before = useQuestOS.getState();
    const started = before.startGuidedSession({
      sessionKey: SESSION_KEY,
      contentId: CONTENT_ID,
      kind: "pilgrimage_day",
    });
    expect(started?.completedMovements).toEqual([]);
    expect(
      useQuestOS.getState().startGuidedSession({
        sessionKey: SESSION_KEY,
        contentId: CONTENT_ID,
        kind: "pilgrimage_day",
      }),
    ).toEqual(started);

    for (const movement of GUIDED_MOVEMENT_KEYS) {
      vi.advanceTimersByTime(60_000);
      useQuestOS.getState().completeGuidedMovement(SESSION_KEY, movement);
    }
    const after = useQuestOS.getState();
    expect(after.guidedProgress[SESSION_KEY].completedAt).toBeDefined();
    expect(after.journeyEvents).toEqual(before.journeyEvents);
    expect(after.growthEvents).toEqual(before.growthEvents);
    expect(after.streak).toEqual(before.streak);
  });

  it("measures only the first start and first completion transition", () => {
    useQuestOS.getState().startGuidedSession({
      sessionKey: SESSION_KEY,
      contentId: CONTENT_ID,
      kind: "pilgrimage_day",
    });
    useQuestOS.getState().startGuidedSession({
      sessionKey: SESSION_KEY,
      contentId: CONTENT_ID,
      kind: "pilgrimage_day",
    });
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenLastCalledWith("guided_practice_started", {
      kind: "pilgrimage",
    });

    for (const movement of GUIDED_MOVEMENT_KEYS) {
      useQuestOS.getState().completeGuidedMovement(SESSION_KEY, movement);
    }
    useQuestOS.getState().completeGuidedMovement(SESSION_KEY, "pray");

    expect(trackEvent).toHaveBeenCalledTimes(2);
    expect(trackEvent).toHaveBeenLastCalledWith("guided_practice_completed", {
      kind: "pilgrimage",
    });
  });

  it("restores sanitized progress and clears it with the rest of the journey", () => {
    useQuestOS.getState().startGuidedSession({
      sessionKey: SESSION_KEY,
      contentId: CONTENT_ID,
      kind: "pilgrimage_day",
    });
    useQuestOS.getState().completeGuidedMovement(SESSION_KEY, "arrive");
    const progress = useQuestOS.getState().guidedProgress;

    useQuestOS.getState().clearAllData();
    expect(useQuestOS.getState().guidedProgress).toEqual({});
    useQuestOS.getState().importData({ guidedProgress: progress });
    expect(useQuestOS.getState().guidedProgress[SESSION_KEY]).toEqual(
      progress[SESSION_KEY],
    );
  });
});
