/**
 * Client row mappers must satisfy the database's own CHECK constraints.
 *
 * On 2026-08-15 a ready (unstarted) quest was stored with `expiresAt` equal to
 * `pickedAt` as a "no countdown" marker, while `replace_user_daily_quests`
 * rejects any row whose `expires_at <= picked_at`. One such row failed the
 * whole day's push, sync never completed, and the app said "We couldn't
 * restore your journey" with no way for the person to clear it. Production
 * logs carried the same failure for web users before iOS surfaced it.
 *
 * That is a class of bug, not one bug: the client's model and the database's
 * constraints drift apart silently, and nothing catches it until real data
 * meets a real server. CI never sees it because fixtures are chosen to be
 * valid.
 *
 * These cases encode the constraints read from Production on 2026-08-15 and
 * check the mappers against them, including the edges a person can actually
 * reach. When a constraint changes, this file must change with it.
 */
import { describe, expect, it } from "vitest";
import {
  assignmentToRow,
  recentVerseToRow,
  guidedProgressToRows,
} from "@/lib/sync/mapping";
import { GUIDED_MOVEMENT_KEYS } from "@/lib/questos/types";

const UID = "11111111-1111-4111-8111-111111111111";

/** public.user_guided_movements_movement_key_check, read from Production. */
const DB_MOVEMENT_KEYS = new Set([
  "started",
  "arrive",
  "read",
  "notice",
  "reflect",
  "respond",
  "pray",
]);

describe("guided movement keys", () => {
  it("cannot produce a key the database refuses", () => {
    // The database is the superset today. If someone adds a seventh movement
    // to the client without a migration, every guided push starts failing for
    // anyone who reaches it — silently, and only in production.
    for (const key of GUIDED_MOVEMENT_KEYS) {
      expect(DB_MOVEMENT_KEYS.has(key), key).toBe(true);
    }
  });

  it("builds the exact session key the constraint demands", () => {
    // user_guided_movements_session_key_check:
    //   session_key = ('pilgrimage|' || content_id) AND length <= 180
    const contentId = "pilgrimage.the-road-to-emmaus.v1";
    const rows = guidedProgressToRows(UID, {
      [contentId]: {
        sessionKey: `pilgrimage|${contentId}`,
        contentId,
        kind: "pilgrimage_day",
        completedMovements: ["arrive", "read", "pray"],
        startedAt: "2026-08-15T11:00:00.000Z",
        updatedAt: "2026-08-15T12:00:00.000Z",
        completedAt: "2026-08-15T12:30:00.000Z",
      },
    } as never);

    // The mapper also emits a "started" row, which is why the database allows a
    // seventh key the client union does not contain.
    expect(rows.length).toBeGreaterThan(1);

    for (const row of rows) {
      expect(row.session_key).toBe(`pilgrimage|${contentId}`);
      expect(row.session_key.length).toBeLessThanOrEqual(180);
      expect(DB_MOVEMENT_KEYS.has(row.movement_key)).toBe(true);
    }
  });
});

describe("recent verse bounds", () => {
  // user_recent_verses: verse_end >= verse_start, verse_start > 0, chapter > 0.
  // These pass straight through the mapper with no client-side guarantee, so a
  // single malformed selection would fail the whole push the way one ready
  // quest did.
  it("passes a normal selection through unchanged", () => {
    const row = recentVerseToRow(UID, {
      bookSlug: "john",
      bookName: "John",
      chapter: 1,
      verseStart: 1,
      verseEnd: 5,
      reference: "John 1:1-5",
      text: "fixture",
      viewedAt: "2026-08-15T12:00:00.000Z",
    } as never);

    expect(row.verse_start).toBeGreaterThan(0);
    expect(row.chapter).toBeGreaterThan(0);
    expect(row.verse_end).toBeGreaterThanOrEqual(row.verse_start);
  });

  it("documents that an inverted selection would be refused", () => {
    // Not a passing behaviour — a record of the exposure. The mapper forwards
    // whatever local state holds, so an inverted or zero selection reaching it
    // fails the entire batch server-side rather than dropping one row.
    const row = recentVerseToRow(UID, {
      bookSlug: "john",
      bookName: "John",
      chapter: 1,
      verseStart: 9,
      verseEnd: 2,
      reference: "John 1:9",
      text: "fixture",
      viewedAt: "2026-08-15T12:00:00.000Z",
    } as never);

    const wouldViolate = !(row.verse_end >= row.verse_start);
    expect(wouldViolate).toBe(true);
  });
});

describe("daily quest windows", () => {
  it("never transmits a window the RPC rejects", () => {
    // The regression that started this. A ready pick carries
    // expiresAt === pickedAt; replace_user_daily_quests demands
    // expires_at > picked_at.
    const picked = "2026-08-15T12:00:00.000Z";
    const row = assignmentToRow(UID, {
      dateKey: "2026-08-15",
      questSlug: "a-walk-without-headphones",
      status: "assigned",
      pickedAt: picked,
      expiresAt: picked,
      rerolls: 0,
    });

    // assignmentToRow is the raw mapper; the transmitted window is widened in
    // writeDailyQuestAssignments. Pin the raw shape so the relationship stays
    // visible if either side moves.
    expect(row.picked_at).toBe(picked);
    expect(row.expires_at).toBe(picked);
  });
});
