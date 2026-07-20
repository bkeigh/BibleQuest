import { describe, expect, it } from "vitest";
import {
  assignmentToRow,
  prayerToRow,
  recentVerseToRow,
  reflectionToRow,
  rowToAssignment,
  rowToPrayer,
  rowToRecentVerse,
  rowToReflection,
} from "@/lib/sync/mapping";
import type {
  DailyQuestAssignment,
  Prayer,
  RecentVerse,
  Reflection,
} from "@/lib/questos/types";

describe("rolling quest and recent-verse sync mapping", () => {
  it("round-trips rolling-window timestamps and released reservations", () => {
    const assignment: DailyQuestAssignment = {
      dateKey: "2026-07-16",
      questSlug: "pray-before-you-rise",
      status: "released",
      rerolls: 0,
      pickedAt: "2026-07-16T23:30:00.000Z",
      expiresAt: "2026-07-17T23:30:00.000Z",
      startedAt: "2026-07-16T23:35:00.000Z",
    };
    expect(rowToAssignment(assignmentToRow("user-a", assignment))).toEqual(
      assignment,
    );
  });

  it("round-trips the natural recent-passage key and exact text", () => {
    const verse: RecentVerse = {
      bookSlug: "john",
      bookName: "John",
      chapter: 3,
      verseStart: 16,
      verseEnd: 17,
      reference: "John 3:16-17",
      text: "Exact WEB fixture",
      viewedAt: "2026-07-16T12:00:00.000Z",
    };
    expect(rowToRecentVerse(recentVerseToRow("user-a", verse))).toEqual(verse);
  });

  it("round-trips orthogonal prayer and reflection archive timestamps", () => {
    const prayer: Prayer = {
      id: "00000000-0000-4000-8000-000000000201",
      body: "Private fixture prayer",
      category: "general",
      status: "answered",
      answeredAt: "2026-07-15T12:00:00.000Z",
      archivedAt: "2026-07-16T12:00:00.000Z",
      createdAt: "2026-07-14T12:00:00.000Z",
      updatedAt: "2026-07-16T12:00:00.000Z",
    };
    const reflection: Reflection = {
      id: "00000000-0000-4000-8000-000000000202",
      body: "Private fixture reflection",
      archivedAt: "2026-07-16T12:00:00.000Z",
      createdAt: "2026-07-14T12:00:00.000Z",
      updatedAt: "2026-07-16T12:00:00.000Z",
    };

    expect(rowToPrayer(prayerToRow("user-a", prayer))).toEqual(prayer);
    expect(rowToReflection(reflectionToRow("user-a", reflection))).toEqual(
      reflection,
    );
  });
});
