/** Canonical wire markers shared by native account clients and release checks. */
const ACTIVE_NATIVE_ACCOUNT_MARKERS = Object.freeze({
  betaContract: "biblequest_native_account_beta_v1",
  betaHeader: "x-biblequest-native-account-beta",
  expectedUserHeader: "x-biblequest-expected-user",
  deletionCleanupHeader: "x-biblequest-account-deletion-cleanup",
  availabilityRpc: "native_account_beta_availability",
  unavailableCode: "native_account_beta_unavailable",
});

/** Retired markers remain forbidden so an old guest shim cannot return. */
const RETIRED_NATIVE_ACCOUNT_MARKERS = Object.freeze([
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "x-biblequest-disabled",
]);

export const NATIVE_ACCOUNT_BETA_CONTRACT =
  ACTIVE_NATIVE_ACCOUNT_MARKERS.betaContract;
export const NATIVE_ACCOUNT_BETA_HEADER =
  ACTIVE_NATIVE_ACCOUNT_MARKERS.betaHeader;
export const EXPECTED_ACCOUNT_USER_HEADER =
  ACTIVE_NATIVE_ACCOUNT_MARKERS.expectedUserHeader;
export const ACCOUNT_DELETION_CLEANUP_HEADER =
  ACTIVE_NATIVE_ACCOUNT_MARKERS.deletionCleanupHeader;
export const NATIVE_ACCOUNT_BETA_AVAILABILITY_RPC =
  ACTIVE_NATIVE_ACCOUNT_MARKERS.availabilityRpc;
export const NATIVE_ACCOUNT_BETA_UNAVAILABLE_CODE =
  ACTIVE_NATIVE_ACCOUNT_MARKERS.unavailableCode;

/** Lists the reviewed active and retired markers for the guest artifact gate. */
export const GUEST_FORBIDDEN_NATIVE_ACCOUNT_MARKERS = Object.freeze([
  ...Object.values(ACTIVE_NATIVE_ACCOUNT_MARKERS),
  ...RETIRED_NATIVE_ACCOUNT_MARKERS,
]);
