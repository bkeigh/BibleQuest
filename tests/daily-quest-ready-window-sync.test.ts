/**
 * A ready (unstarted) pick is stored with `expiresAt === pickedAt` as a "no
 * countdown yet" marker — see `normalizeAssignmentWindow`, which allows it
 * deliberately via `Math.max(expiresMs, pickedMs)`.
 *
 * `replace_user_daily_quests` rejects any row whose `expires_at <= picked_at`.
 * So every device holding a ready quest failed to push its day with
 * `replace_user_daily_quests: invalid row values`, sync never completed, and
 * the app showed "We couldn't restore your journey" (SYNC-RESTORE). Confirmed
 * on iOS on 2026-08-15 and present in production web logs from 2026-08-14.
 *
 * These tests exercise the real push path against a fake RPC that enforces the
 * server's exact predicate, so they fail if the payload regresses.
 */
import { describe, expect, it, vi } from "vitest";
import { writeDailyQuestAssignments } from "@/lib/sync/daily-quests";
import type { DailyQuestAssignment } from "@/lib/questos/types";

const USER = "11111111-1111-4111-8111-111111111111";
const DAY = "2026-08-15";
const PICKED = "2026-08-15T12:00:00.000Z";

/** Mirrors the server's row validation, including the strict window check. */
function serverRejects(rows: Array<Record<string, unknown>>): string | null {
  for (const row of rows) {
    const picked = Date.parse(String(row.picked_at));
    const expires = Date.parse(String(row.expires_at));
    if (!row.picked_at || !row.expires_at) return "invalid row values";
    if (!(expires > picked)) return "invalid row values";
    if (row.status === "completed" && !row.completed_at) {
      return "invalid row values";
    }
  }
  return null;
}

function fakeSupabase(captured: Array<Record<string, unknown>>) {
  return {
    rpc: vi.fn((_name: string, params: Record<string, unknown>) => {
      const rows = params.p_rows as Array<Record<string, unknown>>;
      captured.push(...rows);
      const rejection = serverRejects(rows);
      if (rejection) {
        return Promise.resolve({
          data: null,
          error: { message: rejection, code: "22023" },
        });
      }
      return Promise.resolve({
        data: {
          status: "applied",
          revision: 1,
          duplicate: false,
          rows,
          generation: 0,
        },
        error: null,
      });
    }),
  } as never;
}

function syncContext() {
  return {
    mode: "transactional" as const,
    epoch: 1,
    bases: new Map<string, unknown[]>(),
    revisions: new Map<string, number>(),
    pending: new Map<string, { payload: string; requestId: string }>(),
    requestId: () => "22222222-2222-4222-8222-222222222222",
  } as never;
}

function readyAssignment(): DailyQuestAssignment {
  return {
    dateKey: DAY,
    questSlug: "a-walk-without-headphones",
    status: "assigned",
    // Ready has no countdown: the store writes both as the same instant.
    pickedAt: PICKED,
    expiresAt: PICKED,
    rerolls: 0,
  };
}

describe("pushing a ready daily quest", () => {
  it("sends a window the server accepts", async () => {
    const captured: Array<Record<string, unknown>> = [];

    await expect(
      writeDailyQuestAssignments(
        fakeSupabase(captured),
        USER,
        { [DAY]: [readyAssignment()] },
        syncContext(),
      ),
    ).resolves.toBeTruthy();

    expect(captured).toHaveLength(1);
    const row = captured[0]!;
    expect(Date.parse(String(row.expires_at))).toBeGreaterThan(
      Date.parse(String(row.picked_at)),
    );
  });

  it("leaves a real started window untouched", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const started: DailyQuestAssignment = {
      ...readyAssignment(),
      status: "started",
      startedAt: PICKED,
      expiresAt: "2026-08-16T12:00:00.000Z",
    };

    await writeDailyQuestAssignments(
      fakeSupabase(captured),
      USER,
      { [DAY]: [started] },
      syncContext(),
    );

    expect(captured[0]!.expires_at).toBe("2026-08-16T12:00:00.000Z");
  });

  it("converges: the echoed row re-serializes without another nudge", async () => {
    const first: Array<Record<string, unknown>> = [];
    await writeDailyQuestAssignments(
      fakeSupabase(first),
      USER,
      { [DAY]: [readyAssignment()] },
      syncContext(),
    );
    const echoed = String(first[0]!.expires_at);

    // Whatever the server stored is what the next local state holds. Pushing
    // it again must produce the identical value, or sync would write forever.
    const second: Array<Record<string, unknown>> = [];
    await writeDailyQuestAssignments(
      fakeSupabase(second),
      USER,
      { [DAY]: [{ ...readyAssignment(), expiresAt: echoed }] },
      syncContext(),
    );

    expect(second[0]!.expires_at).toBe(echoed);
  });
});
