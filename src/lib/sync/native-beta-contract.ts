import type { SupabaseClient } from "@supabase/supabase-js";
import { isNativeTarget } from "@/lib/platform/target";
import { NATIVE_ACCOUNT_BETA_ENABLED } from "./containment";
import { withSyncRequestDeadline } from "./request";
import { NATIVE_ACCOUNT_BETA_CONTRACT } from "./native-beta-headers";

export {
  NATIVE_ACCOUNT_BETA_CONTRACT,
  NATIVE_ACCOUNT_BETA_HEADER,
  NATIVE_ACCOUNT_BETA_HEADER_VALUE,
} from "./native-beta-headers";
export const ACCOUNT_AVAILABILITY_DEADLINE_MS = 12_000;

/** Reports a bounded failure without exposing provider details or identifiers. */
export class NativeAccountBetaUnavailableError extends Error {
  readonly code = "native_account_beta_unavailable";

  constructor() {
    super("Native account access is temporarily unavailable.");
    this.name = "NativeAccountBetaUnavailableError";
  }
}

/** Accept only the fixed two-field remote availability contract. */
export function parseNativeAccountBetaAvailability(
  value: unknown,
): boolean | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as { available?: unknown; contract?: unknown };
  if (
    Object.keys(value).sort().join(",") !== "available,contract" ||
    candidate.contract !== NATIVE_ACCOUNT_BETA_CONTRACT ||
    typeof candidate.available !== "boolean"
  ) {
    return null;
  }
  return candidate.available;
}

/** Validate the remote flag inside an authenticated native sync request. */
export async function assertNativeAccountBetaAvailability(
  client: SupabaseClient,
): Promise<void> {
  if (!isNativeTarget() || !NATIVE_ACCOUNT_BETA_ENABLED) return;
  const result = await withSyncRequestDeadline(
    client.rpc("native_account_beta_availability"),
    "Native account availability",
  );
  if (
    result.error ||
    parseNativeAccountBetaAvailability(result.data) !== true
  ) {
    throw new NativeAccountBetaUnavailableError();
  }
}
