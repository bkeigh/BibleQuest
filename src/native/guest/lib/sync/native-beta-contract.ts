import type { SupabaseClient } from "@supabase/supabase-js";

export {
  NATIVE_ACCOUNT_BETA_CONTRACT,
  NATIVE_ACCOUNT_BETA_HEADER,
  NATIVE_ACCOUNT_BETA_HEADER_VALUE,
} from "./native-beta-headers";

export const ACCOUNT_AVAILABILITY_DEADLINE_MS = 12_000;

/** Reports the same bounded error without exposing provider details. */
export class NativeAccountBetaUnavailableError extends Error {
  readonly code = "native_account_beta_unavailable";

  constructor() {
    super("Native account access is temporarily unavailable.");
    this.name = "NativeAccountBetaUnavailableError";
  }
}

/** Rejects every remote contract in the guest export. */
export function parseNativeAccountBetaAvailability(
  _value: unknown,
): boolean | null {
  void _value;
  return null;
}

/** Fails closed if guest code reaches an authenticated sync contract check. */
export async function assertNativeAccountBetaAvailability(
  _client: SupabaseClient,
): Promise<void> {
  void _client;
  throw new NativeAccountBetaUnavailableError();
}
