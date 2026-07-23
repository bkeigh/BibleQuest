import type { SupabaseClient } from "@supabase/supabase-js";
import {
  acknowledgeMutableWrites,
  prepareMutableWrites,
  type MutableAccountResource,
  type MutableRevisionAcknowledgement,
  type MutableRevisionContext,
  type MutableResourceKey,
} from "./mutable-revisions";

export type MutableAccountTable = MutableAccountResource;

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

/** Signal that another device advanced one or more server revisions. */
export class MutableAccountSyncConflictError extends Error {
  readonly stale: number;

  constructor(stale: number) {
    super("Mutable account data changed on another device");
    this.name = "MutableAccountSyncConflictError";
    this.stale = stale;
  }
}

/** Accept only the attributable, generation-bound acknowledgement promised by v4. */
function parseWriteResult(
  value: unknown,
  expectedRows: number,
  expectedGeneration: number,
): MutableRevisionAcknowledgement[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MutableAccountSyncContractError(
      "Mutable account sync returned an invalid acknowledgement",
    );
  }

  const candidate = value as { generation?: unknown; results?: unknown };
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== "generation" ||
    keys[1] !== "results" ||
    candidate.generation !== expectedGeneration ||
    !Array.isArray(candidate.results) ||
    candidate.results.length !== expectedRows
  ) {
    throw new MutableAccountSyncContractError(
      "Mutable account sync returned an invalid acknowledgement",
    );
  }

  return candidate.results.map((valueResult) => {
    if (!valueResult || typeof valueResult !== "object" || Array.isArray(valueResult)) {
      throw new MutableAccountSyncContractError(
        "Mutable account sync returned an invalid acknowledgement",
      );
    }
    const result = valueResult as {
      key?: unknown;
      revision?: unknown;
      status?: unknown;
    };
    if (
      Object.keys(valueResult).sort().join(",") !== "key,revision,status" ||
      !result.key ||
      typeof result.key !== "object" ||
      Array.isArray(result.key) ||
      !Number.isSafeInteger(result.revision) ||
      (result.revision as number) < 0 ||
      (result.status !== "applied" && result.status !== "conflict")
    ) {
      throw new MutableAccountSyncContractError(
        "Mutable account sync returned an invalid acknowledgement",
      );
    }
    return {
      key: result.key as MutableResourceKey,
      revision: result.revision as number,
      status: result.status,
    };
  });
}

/** Write only locally changed mutable rows through the revision CAS RPC. */
export async function writeMutableAccountRows<Row extends object>(
  supabase: SupabaseClient,
  expectedUserId: string,
  expectedGeneration: number,
  table: MutableAccountTable,
  rows: readonly Readonly<Row>[],
  context: MutableRevisionContext,
): Promise<MutableAccountWriteResult> {
  if (rows.length > 200) {
    throw new MutableAccountSyncContractError(
      "Mutable account sync accepts at most 200 rows",
    );
  }
  const prepared = await prepareMutableWrites(
    context,
    table,
    rows as readonly Record<string, unknown>[],
    expectedUserId,
  );
  if (prepared.length === 0) {
    return { applied: 0, stale: 0, generation: expectedGeneration };
  }

  const result = await supabase.rpc("upsert_mutable_account_rows", {
    p_expected_user_id: expectedUserId,
    p_expected_generation: expectedGeneration,
    p_resource: table,
    p_rows: prepared.map((row) => row.envelope),
  });
  if (result.error) throw result.error;
  const acknowledgement = parseWriteResult(
    result.data,
    prepared.length,
    expectedGeneration,
  );
  let stale: number;
  try {
    stale = acknowledgeMutableWrites(
      context,
      table,
      prepared,
      acknowledgement,
    );
  } catch (error) {
    throw new MutableAccountSyncContractError(
      error instanceof Error
        ? error.message
        : "Mutable account sync returned an invalid acknowledgement",
    );
  }
  return {
    applied: prepared.length - stale,
    stale,
    generation: expectedGeneration,
  };
}
