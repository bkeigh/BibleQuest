/** Re-exports the canonical names owned by the shared account marker contract. */
export {
  ACCOUNT_DELETION_CLEANUP_HEADER,
  EXPECTED_ACCOUNT_USER_HEADER,
  NATIVE_ACCOUNT_BETA_CONTRACT,
  NATIVE_ACCOUNT_BETA_HEADER,
} from "./native-account-markers.mjs";

/** Public request values for the isolated native account-beta cohort. */
export const NATIVE_ACCOUNT_BETA_HEADER_VALUE = "v1";

/** Narrows the disabled-beta exception to owned avatar deletion cleanup. */
export const ACCOUNT_DELETION_CLEANUP_HEADER_VALUE = "v1";
