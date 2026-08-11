import type { SupabaseClient } from "@supabase/supabase-js";
import { withSyncRequestDeadline } from "./request";

/** Report a retained-generation mismatch that requires a fresh account pull. */
export class AccountSyncGenerationConflictError extends Error {
  constructor() {
    super("The account sync generation changed on another device.");
    this.name = "AccountSyncGenerationConflictError";
  }
}

/** Convert only PostgreSQL's serialization boundary into a reconciliation. */
export function throwAccountSyncError(error: unknown): never {
  if (isAccountSyncGenerationConflict(error)) {
    throw new AccountSyncGenerationConflictError();
  }
  throw error;
}

/** Recognize either the local wrapper or PostgreSQL's serialization code. */
export function isAccountSyncGenerationConflict(error: unknown): boolean {
  return (
    error instanceof AccountSyncGenerationConflictError ||
    Boolean(
      error &&
        typeof error === "object" &&
        (error as { code?: unknown }).code === "40001",
    )
  );
}

/** Read the one RLS-scoped retained generation without requesting its owner. */
export async function readAccountSyncGeneration(
  supabase: SupabaseClient,
  expectedUserId: string,
): Promise<number> {
  const result = await withSyncRequestDeadline(
    supabase.rpc("account_sync_generation", {
      p_expected_user_id: expectedUserId,
    }),
    "Account sync generation",
  );
  if (result.error) throwAccountSyncError(result.error);
  const value = result.data;
  const generation = (value as { generation?: unknown } | null)?.generation;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).join(",") !== "generation" ||
    !Number.isSafeInteger(generation) ||
    (generation as number) < 0
  ) {
    throw new Error("The account sync generation is unavailable.");
  }
  return generation as number;
}

/** Derive a stable UUID so a lost destructive response can be retried exactly. */
export async function accountSyncRequestId(
  userId: string,
  expectedGeneration: number,
  operation: "delete" | "purge",
  payload: unknown,
): Promise<string> {
  if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0) {
    throw new Error("The account sync request boundary is unavailable.");
  }
  const source = JSON.stringify(
    ["biblequest-account-sync-v3", userId, expectedGeneration, operation, payload],
  );
  const words = stableHash128(source);
  const uuid = new Uint8Array(16);
  const view = new DataView(uuid.buffer);
  words.forEach((word, index) => view.setUint32(index * 4, word));
  uuid[6] = (uuid[6] & 0x0f) | 0x40;
  uuid[8] = (uuid[8] & 0x3f) | 0x80;
  const hex = [...uuid].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Produce four mixed 32-bit words; collisions fail closed at the server hash. */
function stableHash128(value: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
}

export interface AccountDeletion {
  resource: "prayers" | "reflections" | "bookmarks" | "user_quests" | "recent_verses";
  id?: string;
  book_slug?: string;
  chapter?: number;
  verse?: number;
  translation_key?: string;
  quest_slug?: string;
  verse_start?: number;
  verse_end?: number;
}

export interface DestructiveSyncResult {
  generation: number;
  duplicate: boolean;
  deleted?: number;
}

/** Accept only the fixed metadata response from a destructive sync RPC. */
function parseDestructiveResult(
  value: unknown,
  operation: "delete" | "purge",
): DestructiveSyncResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid destructive account sync response.");
  }
  const candidate = value as {
    generation?: unknown;
    duplicate?: unknown;
    deleted?: unknown;
  };
  const expectedKeys = operation === "delete"
    ? "deleted,duplicate,generation"
    : "duplicate,generation";
  if (
    Object.keys(value).sort().join(",") !== expectedKeys ||
    !Number.isSafeInteger(candidate.generation) ||
    (candidate.generation as number) < 0 ||
    typeof candidate.duplicate !== "boolean" ||
    (operation === "delete" &&
      (!Number.isSafeInteger(candidate.deleted) || (candidate.deleted as number) < 0))
  ) {
    throw new Error("Invalid destructive account sync response.");
  }
  return {
    generation: candidate.generation as number,
    duplicate: candidate.duplicate,
    ...(operation === "delete" ? { deleted: candidate.deleted as number } : {}),
  };
}

/** Delete one bounded tombstone batch and advance the retained generation. */
export async function deleteAccountSyncRows(
  supabase: SupabaseClient,
  expectedUserId: string,
  expectedGeneration: number,
  deletions: readonly AccountDeletion[],
): Promise<DestructiveSyncResult> {
  if (deletions.length === 0 || deletions.length > 200) {
    throw new Error("Account sync deletion batches must contain 1 to 200 rows.");
  }
  const requestId = await accountSyncRequestId(
    expectedUserId,
    expectedGeneration,
    "delete",
    deletions,
  );
  const result = await withSyncRequestDeadline(
    supabase.rpc("delete_user_sync_rows", {
      p_expected_user_id: expectedUserId,
      p_expected_generation: expectedGeneration,
      p_request_id: requestId,
      p_deletions: deletions,
    }),
    "Account sync deletion",
  );
  if (result.error) throwAccountSyncError(result.error);
  return parseDestructiveResult(result.data, "delete");
}

/** Purge the account copy once and retain only its generation boundary. */
export async function purgeAccountSyncRows(
  supabase: SupabaseClient,
  expectedUserId: string,
  expectedGeneration: number,
): Promise<DestructiveSyncResult> {
  const requestId = await accountSyncRequestId(
    expectedUserId,
    expectedGeneration,
    "purge",
    null,
  );
  const result = await withSyncRequestDeadline(
    supabase.rpc("purge_user_data", {
      p_expected_user_id: expectedUserId,
      p_expected_generation: expectedGeneration,
      p_request_id: requestId,
    }),
    "Account sync purge",
  );
  if (result.error) throwAccountSyncError(result.error);
  return parseDestructiveResult(result.data, "purge");
}
