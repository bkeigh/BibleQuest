"use client";

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

interface DailyQuestSyncStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface StoredDailyQuestDay {
  assignedDate: string;
  revision: number;
  rows: DailyQuestAssignment[];
}

interface StoredDailyQuestSyncState {
  userId: string;
  version: 1;
  days: StoredDailyQuestDay[];
  pending: Array<PendingDailyQuestRequest & { assignedDate: string }>;
}

const DAILY_QUEST_SYNC_STORAGE_KEY = "biblequest:daily-quest-cas:v1";
const MAX_OBSERVED_DAYS = 120;
const MAX_ROWS_PER_DAY = 200;

export interface DailyQuestSyncContext {
  mode: "unknown" | "transactional" | "legacy";
  revisions: Map<string, number>;
  bases: Map<string, DailyQuestAssignment[]>;
  pending: Map<string, PendingDailyQuestRequest>;
  requestId: () => string;
  storage: DailyQuestSyncStorage | null;
  userId: string | null;
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
  generation: number;
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
    bases: new Map(),
    pending: new Map(),
    requestId,
    storage: null,
    userId: null,
  };
}

/** Reset in-memory protocol state without deleting safe retry metadata. */
export function resetDailyQuestSyncContext(context: DailyQuestSyncContext) {
  context.mode = "unknown";
  context.revisions.clear();
  context.bases.clear();
  context.pending.clear();
  context.storage = null;
  context.userId = null;
}

/** Remove persisted daily CAS bases with a deleted device journey. */
export function clearStoredDailyQuestSyncContext(
  storage: DailyQuestSyncStorage | null = browserDailyQuestSyncStorage(),
) {
  if (!storage) return;
  try {
    storage.removeItem(DAILY_QUEST_SYNC_STORAGE_KEY);
  } catch {
    // Private browsing may make local storage unavailable.
  }
}

/** Restore bounded per-owner CAS observations after an offline reload. */
export function restoreDailyQuestSyncContext(
  context: DailyQuestSyncContext,
  userId: string,
  allowStoredState: boolean,
  storage: DailyQuestSyncStorage | null = browserDailyQuestSyncStorage(),
) {
  resetDailyQuestSyncContext(context);
  context.storage = storage;
  context.userId = userId;
  if (!allowStoredState || !storage) return;

  try {
    const raw = storage.getItem(DAILY_QUEST_SYNC_STORAGE_KEY);
    if (!raw) return;
    const parsed = parseStoredDailyQuestSyncState(JSON.parse(raw), userId);
    if (!parsed) return;
    for (const day of parsed.days) {
      context.revisions.set(day.assignedDate, day.revision);
      context.bases.set(day.assignedDate, day.rows);
    }
    for (const pending of parsed.pending) {
      context.pending.set(pending.assignedDate, {
        payload: pending.payload,
        requestId: pending.requestId,
      });
    }
  } catch {
    // Corrupt or unavailable local metadata must never block local-first use.
  }
}

/** Adopt a revision fixture without browser persistence. */
export function configureDailyQuestSyncContext(
  context: DailyQuestSyncContext,
  rows: DailyQuestRevisionRow[],
  transactionalAvailable: boolean,
  bases: Record<string, DailyQuestAssignment[]> = {},
) {
  context.mode = transactionalAvailable ? "transactional" : "legacy";
  context.revisions.clear();
  context.bases.clear();
  context.pending.clear();
  if (!transactionalAvailable) return;
  for (const row of rows) {
    validateRevisionRow(row);
    context.revisions.set(row.assigned_date, row.revision);
  }
  for (const [day, assignments] of Object.entries(bases)) {
    context.bases.set(day, cloneAssignments(assignments));
  }
  persistDailyQuestSyncContext(context);
}

/** Three-way merge a pull, then remember its canonical base for safe retries. */
export function reconcileDailyQuestPull(
  context: DailyQuestSyncContext,
  local: Record<string, DailyQuestAssignment[]>,
  remote: Record<string, DailyQuestAssignment[]>,
  revisionRows: DailyQuestRevisionRow[],
  transactionalAvailable: boolean,
): Record<string, DailyQuestAssignment[]> {
  if (!transactionalAvailable) {
    context.mode = "legacy";
    context.revisions.clear();
    context.bases.clear();
    context.pending.clear();
    persistDailyQuestSyncContext(context);
    return mergeDailyQuestRecords(local, remote);
  }

  const pulledRevisions = new Map<string, number>();
  for (const row of revisionRows) {
    validateRevisionRow(row);
    pulledRevisions.set(row.assigned_date, row.revision);
  }

  const previousRevisions = new Map(context.revisions);
  const previousBases = new Map(context.bases);
  const days = new Set([
    ...Object.keys(local),
    ...Object.keys(remote),
    ...pulledRevisions.keys(),
  ]);
  const merged: Record<string, DailyQuestAssignment[]> = {};
  context.revisions.clear();
  context.bases.clear();

  for (const day of [...days].sort()) {
    const localRows = local[day] ?? [];
    const remoteRows = remote[day] ?? [];
    const previousBase = previousRevisions.has(day)
      ? previousBases.get(day) ?? []
      : undefined;
    merged[day] = mergeDailyQuestDay(localRows, remoteRows, previousBase);
    context.revisions.set(day, pulledRevisions.get(day) ?? 0);
    context.bases.set(day, cloneAssignments(remoteRows));

    const pending = context.pending.get(day);
    if (
      pending &&
      (pending.payload === serializeAssignments(remoteRows) ||
        pending.payload !== serializeAssignments(localRows))
    ) {
      context.pending.delete(day);
    }
  }

  for (const day of [...context.pending.keys()]) {
    if (!days.has(day)) context.pending.delete(day);
  }
  context.mode = "transactional";
  persistDailyQuestSyncContext(context);
  return merged;
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
  expectedGeneration = 0,
  allowLegacyFallback = true,
): Promise<DailyQuestWriteResult> {
  if (context.mode === "legacy") {
    if (!allowLegacyFallback) {
      throw new Error("The transactional daily quest contract is unavailable.");
    }
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
    if (!previous && payload === serializeAssignments(context.bases.get(day) ?? [])) {
      continue;
    }
    const pending =
      previous?.payload === payload
        ? previous
        : { payload, requestId: context.requestId() };
    context.pending.set(day, pending);
    persistDailyQuestSyncContext(context);

    const result = await supabase.rpc("replace_user_daily_quests", {
      p_expected_user_id: userId,
      p_expected_generation: expectedGeneration,
      p_assigned_date: day,
      p_expected_revision: context.revisions.get(day) ?? 0,
      p_request_id: pending.requestId,
      p_rows: payloadRows,
    });
    if (result.error) {
      if (!isMissingDailyQuestRpc(result.error) || !allowLegacyFallback) {
        throw result.error;
      }
      context.mode = "legacy";
      context.revisions.clear();
      context.bases.clear();
      context.pending.clear();
      persistDailyQuestSyncContext(context);
      await writeLegacyDailyQuestAssignments(supabase, userId, assignments);
      return { conflicts: {}, usedLegacy: true };
    }

    const response = parseRpcResponse(result.data, expectedGeneration);
    const previousBase = context.bases.get(day) ?? [];
    const canonical = response.rows.map((row) =>
      rowToAssignment({
        ...row,
        user_id: userId,
        assigned_date: day,
      }),
    );
    context.revisions.set(day, response.revision);
    context.bases.set(day, cloneAssignments(canonical));
    context.pending.delete(day);
    persistDailyQuestSyncContext(context);
    if (
      response.status === "conflict" ||
      payload !== serializeAssignments(canonical)
    ) {
      conflicts[day] = mergeDailyQuestDay(local, canonical, previousBase);
    }
  }

  context.mode = "transactional";
  persistDailyQuestSyncContext(context);
  return { conflicts, usedLegacy: false };
}

/** Three-way merge one day so deletion and completion both remain durable. */
export function mergeDailyQuestDay(
  local: DailyQuestAssignment[],
  remote: DailyQuestAssignment[],
  base: DailyQuestAssignment[] = [],
): DailyQuestAssignment[] {
  const localBySlug = assignmentsBySlug(local);
  const remoteBySlug = assignmentsBySlug(remote);
  const baseBySlug = assignmentsBySlug(base);
  const slugs = new Set([
    ...localBySlug.keys(),
    ...remoteBySlug.keys(),
    ...baseBySlug.keys(),
  ]);
  const merged: DailyQuestAssignment[] = [];

  for (const slug of [...slugs].sort()) {
    const localAssignment = localBySlug.get(slug);
    const remoteAssignment = remoteBySlug.get(slug);
    const baseAssignment = baseBySlug.get(slug);
    const winner = mergeDailyQuestAssignment(
      localAssignment,
      remoteAssignment,
      baseAssignment,
    );
    if (winner) merged.push(winner);
  }
  return merged;
}

/** Merge every known day with union behavior when no prior base exists. */
function mergeDailyQuestRecords(
  local: Record<string, DailyQuestAssignment[]>,
  remote: Record<string, DailyQuestAssignment[]>,
) {
  const merged: Record<string, DailyQuestAssignment[]> = {};
  const days = new Set([...Object.keys(local), ...Object.keys(remote)]);
  for (const day of [...days].sort()) {
    merged[day] = mergeDailyQuestDay(local[day] ?? [], remote[day] ?? []);
  }
  return merged;
}

/** Resolve one slug relative to the last canonical base. */
function mergeDailyQuestAssignment(
  local: DailyQuestAssignment | undefined,
  remote: DailyQuestAssignment | undefined,
  base: DailyQuestAssignment | undefined,
): DailyQuestAssignment | undefined {
  if (local?.status === "completed" || remote?.status === "completed") {
    if (local?.status !== "completed") return remote;
    if (remote?.status !== "completed") return local;
    return (local.completedAt ?? "") >= (remote.completedAt ?? "")
      ? local
      : remote;
  }

  if (!base) return local ?? remote;
  if (!local || !remote) return undefined;
  const localChanged = !sameAssignment(local, base);
  const remoteChanged = !sameAssignment(remote, base);
  if (!localChanged && remoteChanged) return remote;
  return local;
}

/** Index a day by its database uniqueness key. */
function assignmentsBySlug(assignments: DailyQuestAssignment[]) {
  return new Map(
    assignments.map((assignment) => [assignment.questSlug, assignment]),
  );
}

/** Compare every synced assignment field without relying on object key order. */
function sameAssignment(
  left: DailyQuestAssignment,
  right: DailyQuestAssignment,
) {
  return (
    left.dateKey === right.dateKey &&
    left.questSlug === right.questSlug &&
    left.status === right.status &&
    left.rerolls === right.rerolls &&
    (left.startedAt ?? null) === (right.startedAt ?? null) &&
    (left.completedAt ?? null) === (right.completedAt ?? null) &&
    left.pickedAt === right.pickedAt &&
    left.expiresAt === right.expiresAt
  );
}

/** Serialize a day exactly as the RPC hashes it. */
function serializeAssignments(assignments: DailyQuestAssignment[]) {
  return JSON.stringify(
    assignments
      .map((assignment) => assignmentPayload("", assignment))
      .sort((left, right) => left.quest_slug.localeCompare(right.quest_slug)),
  );
}

/** Copy protocol bases so later Zustand mutations cannot alter observations. */
function cloneAssignments(assignments: DailyQuestAssignment[]) {
  return assignments.map((assignment) => ({ ...assignment }));
}

/** Reject malformed or unsafe revision values before they reach CAS state. */
function validateRevisionRow(row: DailyQuestRevisionRow) {
  if (
    typeof row.assigned_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(row.assigned_date) ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 0
  ) {
    throw new Error("Invalid daily quest revision response.");
  }
}

/** Return browser storage only inside the client boundary. */
function browserDailyQuestSyncStorage(): DailyQuestSyncStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Persist only bounded canonical bases and in-flight idempotency requests. */
function persistDailyQuestSyncContext(context: DailyQuestSyncContext) {
  if (!context.storage || !context.userId) return;
  try {
    if (context.mode === "legacy") {
      context.storage.removeItem(DAILY_QUEST_SYNC_STORAGE_KEY);
      return;
    }
    const assignedDates = [...context.revisions.keys()]
      .sort((left, right) => right.localeCompare(left))
      .slice(0, MAX_OBSERVED_DAYS);
    const state: StoredDailyQuestSyncState = {
      userId: context.userId,
      version: 1,
      days: assignedDates.map((assignedDate) => ({
        assignedDate,
        revision: context.revisions.get(assignedDate) ?? 0,
        rows: cloneAssignments(context.bases.get(assignedDate) ?? []).slice(
          0,
          MAX_ROWS_PER_DAY,
        ),
      })),
      pending: [...context.pending.entries()]
        .filter(([assignedDate]) => assignedDates.includes(assignedDate))
        .map(([assignedDate, pending]) => ({ assignedDate, ...pending })),
    };
    context.storage.setItem(DAILY_QUEST_SYNC_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Never leave an older daily CAS base behind after a failed rewrite.
    try {
      context.storage.removeItem(DAILY_QUEST_SYNC_STORAGE_KEY);
    } catch {
      // Storage can be wholly unavailable; this session still uses memory.
    }
  }
}

/** Parse only metadata written by this protocol version and account owner. */
function parseStoredDailyQuestSyncState(
  value: unknown,
  userId: string,
): StoredDailyQuestSyncState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<StoredDailyQuestSyncState>;
  if (
    candidate.version !== 1 ||
    candidate.userId !== userId ||
    !Array.isArray(candidate.days) ||
    !Array.isArray(candidate.pending)
  ) {
    return null;
  }

  const days: StoredDailyQuestDay[] = [];
  for (const valueDay of candidate.days.slice(0, MAX_OBSERVED_DAYS)) {
    if (!valueDay || typeof valueDay !== "object" || Array.isArray(valueDay)) {
      return null;
    }
    const day = valueDay as Partial<StoredDailyQuestDay>;
    const revisionRow = {
      assigned_date: day.assignedDate ?? "",
      revision: day.revision ?? -1,
    };
    validateRevisionRow(revisionRow);
    if (!Array.isArray(day.rows) || day.rows.length > MAX_ROWS_PER_DAY) {
      return null;
    }
    const rows = day.rows.map((row) =>
      parseStoredAssignment(row, revisionRow.assigned_date),
    );
    if (rows.some((row) => row === null)) return null;
    days.push({
      assignedDate: revisionRow.assigned_date,
      revision: revisionRow.revision,
      rows: rows as DailyQuestAssignment[],
    });
  }

  const pending: StoredDailyQuestSyncState["pending"] = [];
  for (const valuePending of candidate.pending.slice(0, MAX_OBSERVED_DAYS)) {
    if (
      !valuePending ||
      typeof valuePending !== "object" ||
      Array.isArray(valuePending)
    ) {
      return null;
    }
    const request = valuePending as Partial<
      PendingDailyQuestRequest & { assignedDate: string }
    >;
    if (
      typeof request.assignedDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(request.assignedDate) ||
      typeof request.payload !== "string" ||
      request.payload.length > 250_000 ||
      typeof request.requestId !== "string" ||
      request.requestId.length > 100
    ) {
      return null;
    }
    pending.push(request as PendingDailyQuestRequest & { assignedDate: string });
  }
  return { userId, version: 1, days, pending };
}

/** Rebuild one validated local assignment from persisted JSON. */
function parseStoredAssignment(
  value: unknown,
  assignedDate: string,
): DailyQuestAssignment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Partial<DailyQuestAssignment>;
  if (
    row.dateKey !== assignedDate ||
    typeof row.questSlug !== "string" ||
    !row.questSlug ||
    !["assigned", "started", "completed", "released"].includes(
      row.status ?? "",
    ) ||
    !Number.isSafeInteger(row.rerolls) ||
    (row.rerolls ?? -1) < 0 ||
    typeof row.pickedAt !== "string" ||
    typeof row.expiresAt !== "string" ||
    (row.startedAt != null && typeof row.startedAt !== "string") ||
    (row.completedAt != null && typeof row.completedAt !== "string")
  ) {
    return null;
  }
  return row as DailyQuestAssignment;
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
function parseRpcResponse(
  data: unknown,
  expectedGeneration: number,
): DailyQuestRpcResponse {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid daily quest transaction response.");
  }
  const candidate = data as Partial<DailyQuestRpcResponse>;
  const keys = Object.keys(data).sort().join(",");
  if (
    keys !== "duplicate,generation,revision,rows,status" ||
    (candidate.status !== "applied" && candidate.status !== "conflict") ||
    !Number.isSafeInteger(candidate.revision) ||
    (candidate.revision ?? -1) < 0 ||
    typeof candidate.duplicate !== "boolean" ||
    candidate.generation !== expectedGeneration ||
    !Array.isArray(candidate.rows) ||
    !candidate.rows.every(isDailyQuestPayloadRow)
  ) {
    throw new Error("Invalid daily quest transaction response.");
  }
  return candidate as DailyQuestRpcResponse;
}

/** Validate every field in a canonical RPC row before adopting it locally. */
function isDailyQuestPayloadRow(value: unknown): value is DailyQuestPayloadRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<DailyQuestPayloadRow>;
  const allowedKeys = new Set([
    "quest_slug",
    "status",
    "rerolls",
    "started_at",
    "completed_at",
    "picked_at",
    "expires_at",
  ]);
  return (
    Object.keys(row).every((key) => allowedKeys.has(key)) &&
    typeof row.quest_slug === "string" &&
    row.quest_slug.length > 0 &&
    ["assigned", "started", "completed", "released"].includes(
      row.status ?? "",
    ) &&
    Number.isSafeInteger(row.rerolls) &&
    (row.rerolls ?? -1) >= 0 &&
    (row.started_at == null || typeof row.started_at === "string") &&
    (row.completed_at == null || typeof row.completed_at === "string") &&
    typeof row.picked_at === "string" &&
    typeof row.expires_at === "string"
  );
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
