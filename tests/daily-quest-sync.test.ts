import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyQuestAssignment } from "@/lib/questos/types";
import {
  configureDailyQuestSyncContext,
  createDailyQuestSyncContext,
  isMissingDailyQuestRevisionTable,
  isMissingDailyQuestRpc,
  mergeDailyQuestDay,
  reconcileDailyQuestPull,
  restoreDailyQuestSyncContext,
  writeDailyQuestAssignments,
} from "@/lib/sync/daily-quests";

const DAY = "2026-07-20";
const PICKED_AT = "2026-07-20T12:00:00.000Z";
const EXPIRES_AT = "2026-07-21T12:00:00.000Z";

interface PayloadRow {
  quest_slug: string;
  status: string;
  rerolls: number;
  started_at: string | null;
  completed_at: string | null;
  picked_at: string;
  expires_at: string;
}

interface ReplaceArgs {
  p_expected_user_id: string;
  p_expected_generation: number;
  p_assigned_date: string;
  p_expected_revision: number;
  p_request_id: string;
  p_rows: PayloadRow[];
}

/** Build a content-free assignment fixture with deterministic window times. */
function assignment(
  questSlug: string,
  status: DailyQuestAssignment["status"] = "assigned",
): DailyQuestAssignment {
  return {
    dateKey: DAY,
    questSlug,
    status,
    rerolls: 0,
    pickedAt: PICKED_AT,
    expiresAt: EXPIRES_AT,
    ...(status === "completed" ? { completedAt: PICKED_AT } : {}),
  };
}

/** Model the migration's row lock, revision guard, and request deduplication. */
class FakeCasServer {
  revision = 0;
  rows: PayloadRow[] = [];
  lastRequest: { id: string; payload: string } | null = null;
  calls: ReplaceArgs[] = [];
  failBeforeCommit = false;
  loseNextResponse = false;

  client(): SupabaseClient {
    return {
      rpc: async (_name: string, rawArgs: unknown) =>
        this.replace(rawArgs as ReplaceArgs),
    } as unknown as SupabaseClient;
  }

  /** Apply one atomic replacement or return the current canonical day. */
  private replace(args: ReplaceArgs) {
    this.calls.push(structuredClone(args));
    const payload = JSON.stringify(args.p_rows);
    if (this.lastRequest?.id === args.p_request_id) {
      if (this.lastRequest.payload !== payload) {
        return {
          data: null,
          error: { code: "22023", message: "request id reused" },
        };
      }
      return {
        data: this.response("applied", true),
        error: null,
      };
    }
    if (args.p_expected_revision !== this.revision) {
      return {
        data: this.response("conflict", false),
        error: null,
      };
    }

    // Stage a complete replacement first; injected failures never publish it.
    const completed = new Map(
      this.rows
        .filter((row) => row.status === "completed")
        .map((row) => [row.quest_slug, row]),
    );
    const staged = new Map(completed);
    for (const row of args.p_rows) {
      if (!staged.has(row.quest_slug)) staged.set(row.quest_slug, row);
    }
    if (this.failBeforeCommit) {
      this.failBeforeCommit = false;
      return {
        data: null,
        error: { code: "40001", message: "injected transaction rollback" },
      };
    }

    this.rows = [...staged.values()].sort((a, b) =>
      a.quest_slug.localeCompare(b.quest_slug),
    );
    this.revision += 1;
    this.lastRequest = { id: args.p_request_id, payload };
    if (this.loseNextResponse) {
      this.loseNextResponse = false;
      return {
        data: null,
        error: { code: "503", message: "response unavailable after commit" },
      };
    }
    return { data: this.response("applied", false), error: null };
  }

  /** Return the same bounded JSON shape as the production RPC. */
  private response(status: "applied" | "conflict", duplicate: boolean) {
    return {
      status,
      revision: this.revision,
      duplicate,
      rows: structuredClone(this.rows),
      generation: 0,
    };
  }
}

/** Create a deterministic per-device request-id generator. */
function context(prefix: string, revision = 0) {
  let sequence = 0;
  const value = createDailyQuestSyncContext(
    () => `${prefix}-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
  );
  configureDailyQuestSyncContext(
    value,
    revision ? [{ assigned_date: DAY, revision }] : [],
    true,
  );
  return value;
}

/** Emulate durable browser metadata without relying on a DOM test runtime. */
class FakeStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("transactional daily-quest sync", () => {
  it("falls back only for the exact missing revision table contract", () => {
    expect(isMissingDailyQuestRevisionTable({
      code: "PGRST205",
      message:
        "Could not find the table public.user_daily_quest_days in the schema cache",
    })).toBe(true);
    expect(isMissingDailyQuestRevisionTable({
      code: "42501",
      message: "permission denied for user_daily_quest_days",
    })).toBe(false);
    expect(isMissingDailyQuestRevisionTable({
      code: "PGRST205",
      message: "Could not find public.user_daily_quest_days_archive",
    })).toBe(false);
  });

  it("merges simultaneous devices after one bounded stale-revision conflict", async () => {
    const server = new FakeCasServer();
    const deviceA = context("aaaaaaaa");
    const deviceB = context("bbbbbbbb");

    await writeDailyQuestAssignments(
      server.client(),
      "owner-a",
      { [DAY]: [assignment("quest-a")] },
      deviceA,
    );
    const stale = await writeDailyQuestAssignments(
      server.client(),
      "owner-a",
      { [DAY]: [assignment("quest-b")] },
      deviceB,
    );

    expect(server.revision).toBe(1);
    expect(server.rows.map((row) => row.quest_slug)).toEqual(["quest-a"]);
    expect(stale.conflicts[DAY].map((row) => row.questSlug)).toEqual([
      "quest-a",
      "quest-b",
    ]);

    const retry = await writeDailyQuestAssignments(
      server.client(),
      "owner-a",
      stale.conflicts,
      deviceB,
    );
    expect(retry.conflicts).toEqual({});
    expect(server.revision).toBe(2);
    expect(server.rows.map((row) => row.quest_slug)).toEqual([
      "quest-a",
      "quest-b",
    ]);
  });

  it("does not mutate the canonical day for a stale revision", async () => {
    const server = new FakeCasServer();
    await writeDailyQuestAssignments(
      server.client(),
      "owner-a",
      { [DAY]: [assignment("canonical")] },
      context("aaaaaaaa"),
    );

    await writeDailyQuestAssignments(
      server.client(),
      "owner-a",
      { [DAY]: [assignment("stale")] },
      context("bbbbbbbb"),
    );

    expect(server.revision).toBe(1);
    expect(server.rows.map((row) => row.quest_slug)).toEqual(["canonical"]);
  });

  it("reuses a request id after a committed response is lost", async () => {
    const server = new FakeCasServer();
    const device = context("aaaaaaaa");
    server.loseNextResponse = true;

    await expect(
      writeDailyQuestAssignments(
        server.client(),
        "owner-a",
        { [DAY]: [assignment("quest-a")] },
        device,
      ),
    ).rejects.toMatchObject({ code: "503" });
    await writeDailyQuestAssignments(
      server.client(),
      "owner-a",
      { [DAY]: [assignment("quest-a")] },
      device,
    );

    expect(server.calls[1].p_request_id).toBe(server.calls[0].p_request_id);
    expect(server.revision).toBe(1);
    expect(server.rows).toHaveLength(1);
  });

  it("atomically deletes an unpicked unfinished assignment", async () => {
    const server = new FakeCasServer();
    const device = context("aaaaaaaa");
    await writeDailyQuestAssignments(
      server.client(),
      "owner-a",
      { [DAY]: [assignment("unfinished")] },
      device,
    );

    await writeDailyQuestAssignments(
      server.client(),
      "owner-a",
      { [DAY]: [] },
      device,
    );

    expect(server.rows).toEqual([]);
    expect(server.revision).toBe(2);
  });

  it("keeps a remote unpick deleted when a stale device retries", async () => {
    const server = new FakeCasServer();
    const original = assignment("unfinished");
    const deviceA = context("aaaaaaaa");
    await writeDailyQuestAssignments(
      server.client(),
      "owner-a",
      { [DAY]: [original] },
      deviceA,
    );
    const deviceB = context("bbbbbbbb", 1);
    deviceB.bases.set(DAY, [original]);

    await writeDailyQuestAssignments(
      server.client(),
      "owner-a",
      { [DAY]: [] },
      deviceA,
    );
    const staleEdit: DailyQuestAssignment = {
      ...original,
      status: "started",
      startedAt: PICKED_AT,
    };
    const stale = await writeDailyQuestAssignments(
      server.client(),
      "owner-a",
      { [DAY]: [staleEdit] },
      deviceB,
    );

    expect(stale.conflicts[DAY]).toEqual([]);
    await writeDailyQuestAssignments(
      server.client(),
      "owner-a",
      stale.conflicts,
      deviceB,
    );
    expect(server.rows).toEqual([]);
    expect(server.revision).toBe(2);
  });

  it("preserves a completed assignment when another device sends an empty day", async () => {
    const server = new FakeCasServer();
    const device = context("aaaaaaaa");
    await writeDailyQuestAssignments(
      server.client(),
      "owner-a",
      { [DAY]: [assignment("completed", "completed")] },
      device,
    );

    await writeDailyQuestAssignments(
      server.client(),
      "owner-a",
      { [DAY]: [] },
      device,
    );

    expect(server.rows).toMatchObject([
      { quest_slug: "completed", status: "completed" },
    ]);
  });

  it("keeps the canonical completion while merging a stale client day", () => {
    const merged = mergeDailyQuestDay(
      [assignment("completed", "started"), assignment("local")],
      [assignment("completed", "completed"), assignment("remote")],
    );

    expect(merged.map((row) => [row.questSlug, row.status])).toEqual([
      ["completed", "completed"],
      ["local", "assigned"],
      ["remote", "assigned"],
    ]);
  });

  it("rolls back a partial failure and retries with the same request", async () => {
    const server = new FakeCasServer();
    const device = context("aaaaaaaa");
    server.failBeforeCommit = true;

    await expect(
      writeDailyQuestAssignments(
        server.client(),
        "owner-a",
        { [DAY]: [assignment("quest-a")] },
        device,
      ),
    ).rejects.toMatchObject({ code: "40001" });
    expect(server.rows).toEqual([]);
    expect(server.revision).toBe(0);

    await writeDailyQuestAssignments(
      server.client(),
      "owner-a",
      { [DAY]: [assignment("quest-a")] },
      device,
    );
    expect(server.calls[1].p_request_id).toBe(server.calls[0].p_request_id);
    expect(server.rows).toHaveLength(1);
  });

  it("persists a canonical base so a reopened stale device honors deletion", async () => {
    const storage = new FakeStorage();
    const original = assignment("unfinished");
    const observed = createDailyQuestSyncContext(() => "observed-request");
    restoreDailyQuestSyncContext(observed, "owner-a", false, storage);
    reconcileDailyQuestPull(
      observed,
      { [DAY]: [original] },
      { [DAY]: [original] },
      [{ assigned_date: DAY, revision: 1 }],
      true,
    );

    const reopened = createDailyQuestSyncContext(() => "reopened-request");
    restoreDailyQuestSyncContext(reopened, "owner-a", true, storage);
    const merged = reconcileDailyQuestPull(
      reopened,
      { [DAY]: [original] },
      { [DAY]: [] },
      [{ assigned_date: DAY, revision: 2 }],
      true,
    );

    expect(merged[DAY]).toEqual([]);
    expect(reopened.revisions.get(DAY)).toBe(2);
  });

  it("does not repeat a committed request after an offline reload", async () => {
    const storage = new FakeStorage();
    const server = new FakeCasServer();
    const original = assignment("quest-a");
    const first = createDailyQuestSyncContext(() => "persisted-request");
    restoreDailyQuestSyncContext(first, "owner-a", false, storage);
    reconcileDailyQuestPull(
      first,
      { [DAY]: [original] },
      { [DAY]: [] },
      [{ assigned_date: DAY, revision: 0 }],
      true,
    );
    server.loseNextResponse = true;
    await expect(
      writeDailyQuestAssignments(
        server.client(),
        "owner-a",
        { [DAY]: [original] },
        first,
      ),
    ).rejects.toMatchObject({ code: "503" });

    const reopened = createDailyQuestSyncContext(() => "new-request");
    restoreDailyQuestSyncContext(reopened, "owner-a", true, storage);
    const merged = reconcileDailyQuestPull(
      reopened,
      { [DAY]: [original] },
      { [DAY]: [original] },
      [{ assigned_date: DAY, revision: 1 }],
      true,
    );
    await writeDailyQuestAssignments(
      server.client(),
      "owner-a",
      merged,
      reopened,
    );

    expect(server.calls).toHaveLength(1);
    expect(server.revision).toBe(1);
  });

  it("keeps old cached clients on the legacy path only when the RPC is absent", async () => {
    const operations: string[] = [];
    const inserted: unknown[] = [];
    const query = {
      delete: () => {
        operations.push("delete");
        return query;
      },
      eq: () => query,
      in: async () => ({ data: null, error: null }),
      insert: async (rows: unknown) => {
        operations.push("insert");
        inserted.push(rows);
        return { data: null, error: null };
      },
    };
    const client = {
      rpc: async () => ({
        data: null,
        error: {
          code: "PGRST202",
          message:
            "Could not find the function public.replace_user_daily_quests in the schema cache",
        },
      }),
      from: () => query,
    } as unknown as SupabaseClient;

    const result = await writeDailyQuestAssignments(
      client,
      "owner-a",
      { [DAY]: [assignment("quest-a")] },
      context("aaaaaaaa"),
    );

    expect(result.usedLegacy).toBe(true);
    expect(operations).toEqual(["delete", "insert"]);
    expect(inserted).toHaveLength(1);
    expect(isMissingDailyQuestRpc({
      code: "42501",
      message: "permission denied for replace_user_daily_quests",
    })).toBe(false);
  });

  it("fails closed when a v3 engine loses the transactional RPC", async () => {
    const query = {
      delete: () => query,
      eq: () => query,
      insert: async () => ({ data: null, error: null }),
    };
    const client = {
      rpc: async () => ({
        data: null,
        error: {
          code: "PGRST202",
          message:
            "Could not find the function public.replace_user_daily_quests in the schema cache",
        },
      }),
      from: () => query,
    } as unknown as SupabaseClient;

    await expect(
      writeDailyQuestAssignments(
        client,
        "owner-a",
        { [DAY]: [assignment("quest-a")] },
        context("aaaaaaaa"),
        0,
        false,
      ),
    ).rejects.toMatchObject({ code: "PGRST202" });
  });

  it("never sends a caller-controlled owner or day inside the row payload", async () => {
    const server = new FakeCasServer();
    await writeDailyQuestAssignments(
      server.client(),
      "owner-a",
      { [DAY]: [assignment("quest-a")] },
      context("aaaaaaaa"),
    );

    expect(server.calls[0]).not.toHaveProperty("p_user_id");
    expect(server.calls[0]).toMatchObject({
      p_expected_user_id: "owner-a",
      p_expected_generation: 0,
    });
    expect(server.calls[0].p_rows[0]).not.toHaveProperty("user_id");
    expect(server.calls[0].p_rows[0]).not.toHaveProperty("assigned_date");
  });

  it("fails closed on a malformed canonical RPC row", async () => {
    const client = {
      rpc: async () => ({
        data: {
          status: "applied",
          revision: 1,
          duplicate: false,
          generation: 0,
          rows: [{ quest_slug: "missing-required-fields" }],
        },
        error: null,
      }),
    } as unknown as SupabaseClient;

    await expect(
      writeDailyQuestAssignments(
        client,
        "owner-a",
        { [DAY]: [assignment("quest-a")] },
        context("aaaaaaaa"),
      ),
    ).rejects.toThrow("Invalid daily quest transaction response.");
  });

  it("fails closed on an expanded canonical RPC response", async () => {
    const client = {
      rpc: async () => ({
        data: {
          status: "applied",
          revision: 1,
          duplicate: false,
          generation: 0,
          rows: [],
          diagnostic: "not part of the bounded contract",
        },
        error: null,
      }),
    } as unknown as SupabaseClient;

    await expect(
      writeDailyQuestAssignments(
        client,
        "owner-a",
        { [DAY]: [assignment("quest-a")] },
        context("aaaaaaaa"),
      ),
    ).rejects.toThrow("Invalid daily quest transaction response.");
  });
});
