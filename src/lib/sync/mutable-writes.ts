import type { SupabaseClient } from "@supabase/supabase-js";

export type MutableAccountTable =
  | "profiles"
  | "user_settings"
  | "notification_preferences"
  | "prayers"
  | "reflections"
  | "user_quests"
  | "reading_progress";

export interface MutableAccountWriteResult {
  applied: number;
  stale: number;
  generation: number;
}

/** Identify a malformed or unavailable server contract without falling back. */
export class MutableAccountSyncContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MutableAccountSyncContractError";
  }
}

/** Signal that the account copy won a timestamp race and needs a fresh pull. */
export class MutableAccountSyncConflictError extends Error {
  readonly stale: number;

  constructor(stale: number) {
    super("Mutable account data changed on another device");
    this.name = "MutableAccountSyncConflictError";
    this.stale = stale;
  }
}

/** Remove caller-supplied ownership fields because the RPC derives them from auth. */
function withoutOwnership(
  table: MutableAccountTable,
  row: object,
): Record<string, unknown> {
  const sanitized = Object.fromEntries(Object.entries(row));
  delete sanitized.user_id;
  if (table === "profiles") delete sanitized.id;
  return sanitized;
}

/** Accept only the complete, generation-bound acknowledgement promised by 0018. */
function parseWriteResult(
  value: unknown,
  expectedRows: number,
  expectedGeneration: number,
): MutableAccountWriteResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MutableAccountSyncContractError(
      "Mutable account sync returned an invalid acknowledgement",
    );
  }

  const candidate = value as {
    applied?: unknown;
    stale?: unknown;
    generation?: unknown;
  };
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== "applied" ||
    keys[1] !== "generation" ||
    keys[2] !== "stale" ||
    !Number.isInteger(candidate.applied) ||
    !Number.isInteger(candidate.stale) ||
    (candidate.applied as number) < 0 ||
    (candidate.stale as number) < 0 ||
    (candidate.applied as number) + (candidate.stale as number) !== expectedRows ||
    candidate.generation !== expectedGeneration
  ) {
    throw new MutableAccountSyncContractError(
      "Mutable account sync returned an invalid acknowledgement",
    );
  }

  return {
    applied: candidate.applied as number,
    stale: candidate.stale as number,
    generation: candidate.generation as number,
  };
}

/** Conditionally write mutable account rows through the guarded server RPC only. */
export async function writeMutableAccountRows<Row extends object>(
  supabase: SupabaseClient,
  expectedUserId: string,
  expectedGeneration: number,
  table: MutableAccountTable,
  rows: readonly Readonly<Row>[],
): Promise<MutableAccountWriteResult> {
  if (rows.length > 200) {
    throw new MutableAccountSyncContractError(
      "Mutable account sync accepts at most 200 rows",
    );
  }
  if (rows.length === 0) {
    return { applied: 0, stale: 0, generation: expectedGeneration };
  }

  const result = await supabase.rpc("upsert_mutable_account_rows", {
    p_expected_user_id: expectedUserId,
    p_expected_generation: expectedGeneration,
    p_resource: table,
    p_rows: rows.map((row) => withoutOwnership(table, row)),
  });
  if (result.error) throw result.error;
  return parseWriteResult(result.data, rows.length, expectedGeneration);
}
