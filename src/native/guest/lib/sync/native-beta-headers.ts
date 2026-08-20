/** Uses server-invalid sentinels if a contained guest path is called by mistake. */
export const NATIVE_ACCOUNT_BETA_CONTRACT = "disabled";
export const NATIVE_ACCOUNT_BETA_HEADER = "x-biblequest-disabled";
export const NATIVE_ACCOUNT_BETA_HEADER_VALUE = "0";

/** Preserves the neutral exact-user header used by local account cleanup code. */
export const EXPECTED_ACCOUNT_USER_HEADER = "x-biblequest-expected-user";

/** Preserves the narrow deletion-cleanup marker without enabling account sync. */
export const ACCOUNT_DELETION_CLEANUP_HEADER =
  "x-biblequest-account-deletion-cleanup";
export const ACCOUNT_DELETION_CLEANUP_HEADER_VALUE = "v1";
