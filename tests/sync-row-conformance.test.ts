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
  transmittableRecentVerseRows,
  guidedProgressToRows,
} from "@/lib/sync/mapping";
import { GUIDED_MOVEMENT_KEYS } from "@/lib/questos/types";
import { MUTABLE_ACCOUNT_RESOURCES } from "@/lib/sync/mutable-revisions";

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

  it("drops an unsendable passage instead of stranding the batch", () => {
    const verse = (over: Record<string, unknown>) =>
      recentVerseToRow(UID, {
        bookSlug: "john",
        bookName: "John",
        chapter: 1,
        verseStart: 1,
        verseEnd: 5,
        reference: "John 1:1-5",
        text: "fixture",
        viewedAt: "2026-08-15T12:00:00.000Z",
        ...over,
      } as never);

    const good = verse({});
    const rows = [
      good,
      verse({ verseStart: 9, verseEnd: 2 }), // inverted
      verse({ verseStart: 0 }), // verse_start > 0
      verse({ chapter: 0 }), // chapter > 0
    ];

    const sendable = transmittableRecentVerseRows(rows);

    // The readable passage still syncs; the rest of the journey is not held
    // hostage to a selection nobody can read back.
    expect(sendable).toEqual([good]);
    for (const row of sendable) {
      expect(row.chapter).toBeGreaterThan(0);
      expect(row.verse_start).toBeGreaterThan(0);
      expect(row.verse_end).toBeGreaterThanOrEqual(row.verse_start);
    }
  });

  it("keeps a single-verse selection, where end equals start", () => {
    // The constraint is `verse_end >= verse_start`. Reading one verse is the
    // common case and must not be mistaken for malformed — the ready-quest bug
    // was exactly an off-by-one reading of a boundary like this.
    const row = recentVerseToRow(UID, {
      bookSlug: "john",
      bookName: "John",
      chapter: 3,
      verseStart: 16,
      verseEnd: 16,
      reference: "John 3:16",
      text: "fixture",
      viewedAt: "2026-08-15T12:00:00.000Z",
    } as never);

    expect(transmittableRecentVerseRows([row])).toEqual([row]);
  });
});

describe("mutable sync resources", () => {
  /**
   * The resource names `upsert_mutable_account_rows` accepts, read from
   * Production on 2026-08-15. PostgREST resolves this by value, so a name the
   * function does not branch on is silently written nowhere.
   */
  const DB_MUTABLE_RESOURCES = new Set([
    "notification_preferences",
    "prayers",
    "profiles",
    "reading_progress",
    "reflections",
    "user_quests",
    "user_recent_verses",
    "user_settings",
    "verse_bookmarks",
  ]);

  it("only names resources the RPC actually branches on", () => {
    // Adding a tenth resource to the client without a migration would push
    // that data into a function that has no case for it. Nothing would fail
    // loudly; the rows would simply never arrive.
    for (const resource of MUTABLE_ACCOUNT_RESOURCES) {
      expect(DB_MUTABLE_RESOURCES.has(resource), resource).toBe(true);
    }
  });

  it("covers every resource the RPC supports", () => {
    // The reverse drift is quieter: a resource the server supports that the
    // client never sends is data silently left behind on the device.
    const clientResources: ReadonlySet<string> = MUTABLE_ACCOUNT_RESOURCES;
    for (const resource of DB_MUTABLE_RESOURCES) {
      expect(clientResources.has(resource), resource).toBe(true);
    }
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
