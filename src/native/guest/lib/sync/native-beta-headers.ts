/** Re-exports markerless names from the staged guest account contract. */
export {
  ACCOUNT_DELETION_CLEANUP_HEADER,
  EXPECTED_ACCOUNT_USER_HEADER,
  NATIVE_ACCOUNT_BETA_CONTRACT,
  NATIVE_ACCOUNT_BETA_HEADER,
} from "./native-account-markers.mjs";

/** Empty values pair with invalid guest header names and cannot grant authority. */
export const NATIVE_ACCOUNT_BETA_HEADER_VALUE = "";
export const ACCOUNT_DELETION_CLEANUP_HEADER_VALUE = "";
