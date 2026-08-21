"use client";

import { NativeAccountBetaUnavailableError } from "./native-beta-contract";

export {
  ACCOUNT_AVAILABILITY_DEADLINE_MS,
  NATIVE_ACCOUNT_BETA_CONTRACT,
  NATIVE_ACCOUNT_BETA_HEADER,
  NATIVE_ACCOUNT_BETA_HEADER_VALUE,
  NativeAccountBetaUnavailableError,
  assertNativeAccountBetaAvailability,
  parseNativeAccountBetaAvailability,
} from "./native-beta-contract";

interface AvailabilityRequestOptions {
  fetcher?: typeof fetch;
  publishableKey?: string;
  supabaseOrigin?: string;
}

/** Rejects a direct probe without touching the network. */
export async function fetchNativeAccountBetaAvailability(
  _options: AvailabilityRequestOptions = {},
): Promise<boolean> {
  void _options;
  throw new NativeAccountBetaUnavailableError();
}

/** Keeps the shared availability snapshot closed. */
export function refreshNativeAccountBetaAvailability(): Promise<boolean> {
  return Promise.resolve(false);
}

/** Rejects any unexpected attempt to cross the guest account boundary. */
export async function requireNativeAccountBetaAvailability(): Promise<void> {
  throw new NativeAccountBetaUnavailableError();
}

/** Gives every guest consumer one stable unavailable result. */
export function useAccountAvailability(): {
  available: boolean;
  loading: boolean;
} {
  return { available: false, loading: false };
}
