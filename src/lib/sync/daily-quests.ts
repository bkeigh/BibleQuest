/**
 * Revision-guarded daily-quest writes. The browser calls an authenticated RPC;
 * it never receives a database or service credential.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyQuestAssignment } from "@/lib/questos/types";
import {
  assignmentToRow,
  rowToAssignment,
  type DailyQuestRow,
} from "./mapping";

type DailyQuestPayloadRow = Omit<
  DailyQuestRow,
  "user_id" | "assigned_date"
>;

export interface DailyQuestRevisionRow {
  assigned_date: string;
  revision: number;
}

interface PendingDailyQuestRequest {
  payload: string;
  requestId: string;
}

export interface DailyQuestSyncContext {
  mode: "unknown" | "transactional" | "legacy";
  revisions: Map<string, number>;
  pending: Map<string, PendingDailyQuestRequest>;
  requestId: () => string;
}

export interface DailyQuestWriteResult {
  conflicts: Record<string, DailyQuestAssignment[]>;
  usedLegacy: boolean;
}

interface DailyQuestRpcResponse {
  status: "applied" | "conflict";
  revision: number;
  duplicate: boolean;
  rows: DailyQuestPayloadRow[];
}

/** A bounded CAS conflict is safe to retry after the canonical day is merged. */
export class DailyQuestConflictError extends Error {
  constructor() {
    super("Daily quest state changed on another device.");
    this.name = "DailyQuestConflictError";
  }
}

/** Create isolated protocol state so tests and account handoffs cannot share revisions. */
export function createDailyQuestSyncContext(
  requestId: () => string = () => crypto.randomUUID(),
): DailyQuestSyncContext {
  return {
    mode: "unknown",
    revisions: new Map(),
    pending: new Map(),
    requestId,
  };
}

/** Reset revision and idempotency state when the authenticated owner changes. */
export function resetDailyQuestSyncContext(context: DailyQuestSyncContext) {
  context.mode = "unknown";
  context.revisions.clear();
  context.pending.clear();
}

/** Adopt the revision snapshot from the same pull that supplied quest rows. */
export function configureDailyQuestSyncContext(
  context: DailyQuestSyncContext,
  rows: DailyQuestRevisionRow[],
  transactionalAvailable: boolean,
) {
  context.mode = transactionalAvailable ? "transactional" : "legacy";
  context.revisions.clear();
  context.pending.clear();
  if (!transactionalAvailable) return;
  for (const row of rows) {
    if (
      typeof row.assigned_date !== "string" ||
      !Number.isSafeInteger(row.revision) ||
      row.revision < 0
    ) {
      throw new Error("Invalid daily quest revision response.");
    }
    context.revisions.set(row.assigned_date, row.revision);
  }
}

/** Recognize only the additive revision table as an old-schema fallback. */
export function isMissingDailyQuestRevisionTable(error: unknown): boolean {
  return isMissingResource(
    error,
    "user_daily_quest_days",
    new Set(["42P01", "PGRST205"]),
  );
}

/** Recognize only the additive CAS RPC as an old-bundle rollout fallback. */
export function isMissingDailyQuestRpc(error: unknown): boolean {
  return isMissingResource(
    error,
    "replace_user_daily_quests",
    new Set(["42883", "PGRST202"]),
  );
}

/** Push each changed day through CAS, falling back only when migration 0015 is absent. */
export async function writeDailyQuestAssignments(
  supabase: SupabaseClient,
  userId: string,
  assignments: Record<string, DailyQuestAssignment[]>,
  context: DailyQuestSyncContext,
): Promise<DailyQuestWriteResult> {
  if (context.mode === "legacy") {
    await writeLegacyDailyQuestAssignments(supabase, userId, assignments);
    return { conflicts: {}, usedLegacy: true };
  }

  const conflicts: Record<string, DailyQuestAssignment[]> = {};
  for (const day of Object.keys(assignments).sort()) {
    const local = assignments[day] ?? [];
    const payloadRows = local
      .map((assignment) => assignmentPayload(userId, assignment))
      .sort((a, b) => a.quest_slug.localeCompare(b.quest_slug));
    const payload = JSON.stringify(payloadRows);
    const previous = context.pending.get(day);
    const pending =
      previous?.payload === payload
        ? previous
        : { payload, requestId: context.requestId() };
    context.pending.set(day, pending);

    const result = await supabase.rpc("replace_user_daily_quests", {
      p_assigned_date: day,
      p_expected_revision: context.revisions.get(day) ?? 0,
      p_request_id: pending.requestId,
      p_rows: payloadRows,
    });
    if (result.error) {
      if (!isMissingDailyQuestRpc(result.error)) throw result.error;
      context.mode = "legacy";
      context.revisions.clear();
      context.pending.clear();
      await writeLegacyDailyQuestAssignments(supabase, userId, assignments);
      return { conflicts: {}, usedLegacy: true };
    }

    const response = parseRpcResponse(result.data);
    context.revisions.set(day, response.revision);
    context.pending.delete(day);
    if (response.status === "conflict") {
      const remote = response.rows.map((row) =>
        rowToAssignment({
          ...row,
          user_id: userId,
          assigned_date: day,
        }),
      );
      conflicts[day] = mergeDailyQuestDay(local, remote);
    }
  }

  context.mode = "transactional";
  return { conflicts, usedLegacy: false };
}

/** Merge a conflicting day without losing a completion from either device. */
export function mergeDailyQuestDay(
  local: DailyQuestAssignment[],
  remote: DailyQuestAssignment[],
): DailyQuestAssignment[] {
  const bySlug = new Map(remote.map((assignment) => [assignment.questSlug, assignment]));
  for (const localAssignment of local) {
    const remoteAssignment = bySlug.get(localAssignment.questSlug);
    if (!remoteAssignment) {
      bySlug.set(localAssignment.questSlug, localAssignment);
      continue;
    }
    if (remoteAssignment.status === "completed") continue;
    bySlug.set(localAssignment.questSlug, localAssignment);
  }
  return [...bySlug.values()].sort((a, b) =>
    a.questSlug.localeCompare(b.questSlug),
  );
}

/** Convert an assignment without transmitting a caller-controlled owner or day. */
function assignmentPayload(
  userId: string,
  assignment: DailyQuestAssignment,
): DailyQuestPayloadRow {
  const { user_id: _owner, assigned_date: _day, ...payload } = assignmentToRow(
    userId,
    assignment,
  );
  void _owner;
  void _day;
  return payload;
}

/** Validate the narrow JSON contract returned by the transactional RPC. */
function parseRpcResponse(data: unknown): DailyQuestRpcResponse {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid daily quest transaction response.");
  }
  const candidate = data as Partial<DailyQuestRpcResponse>;
  if (
    (candidate.status !== "applied" && candidate.status !== "conflict") ||
    !Number.isSafeInteger(candidate.revision) ||
    (candidate.revision ?? -1) < 0 ||
    typeof candidate.duplicate !== "boolean" ||
    !Array.isArray(candidate.rows)
  ) {
    throw new Error("Invalid daily quest transaction response.");
  }
  return candidate as DailyQuestRpcResponse;
}

/** Keep a compatible app usable until the additive RPC migration is deployed. */
async function writeLegacyDailyQuestAssignments(
  supabase: SupabaseClient,
  userId: string,
  assignments: Record<string, DailyQuestAssignment[]>,
) {
  const days = Object.keys(assignments);
  if (!days.length) return;
  const rows = Object.values(assignments)
    .flat()
    .map((assignment) => assignmentToRow(userId, assignment));
  const deleted = await supabase
    .from("user_daily_quests")
    .delete()
    .eq("user_id", userId)
    .in("assigned_date", days);
  if (deleted.error) throw deleted.error;
  if (!rows.length) return;

  const current = await supabase.from("user_daily_quests").insert(rows);
  if (!current.error) return;
  if (!isMissingQuestWindowColumn(current.error)) throw current.error;
  const legacyRows = rows.map(
    ({ picked_at: _pickedAt, expires_at: _expiresAt, ...row }) => {
      void _pickedAt;
      void _expiresAt;
      return row;
    },
  );
  const legacy = await supabase.from("user_daily_quests").insert(legacyRows);
  if (legacy.error) throw legacy.error;
}

/** Recognize the two rolling-window columns only during a pre-0010 fallback. */
function isMissingQuestWindowColumn(error: unknown): boolean {
  return (
    isMissingResource(error, "picked_at", new Set(["42703", "PGRST204"])) ||
    isMissingResource(error, "expires_at", new Set(["42703", "PGRST204"]))
  );
}

/** Match an exact optional identifier and a bounded set of missing-resource codes. */
function isMissingResource(
  error: unknown,
  identifier: string,
  codes: Set<string>,
): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    codes.has(code) &&
    new RegExp(`(^|[^a-z0-9_])${escaped}(?![a-z0-9_])`, "i").test(message)
  );
}
