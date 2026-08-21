/** The guest contract uses invalid empty header names so leaks fail locally. */
export const NATIVE_ACCOUNT_BETA_CONTRACT = "disabled";
export const NATIVE_ACCOUNT_BETA_HEADER = "";
export const EXPECTED_ACCOUNT_USER_HEADER = "";
export const ACCOUNT_DELETION_CLEANUP_HEADER = "";
export const ACCOUNT_SYNC_GENERATION_HEADER = "";
export const WEB_AUTH_PROTOCOL_HEADER = "";
export const AVATAR_VERSION_HEADER = "";
export const AVATAR_UPDATED_AT_HEADER = "";
export const NATIVE_ACCOUNT_BETA_AVAILABILITY_RPC = "";
export const NATIVE_ACCOUNT_BETA_UNAVAILABLE_CODE = "unavailable";

/** The build imports the canonical scan list before staging this module. */
export const GUEST_FORBIDDEN_NATIVE_ACCOUNT_MARKERS = Object.freeze([]);

/** Rejects every staged account header before a dormant path can use it. */
export function requireAccountWireHeader(header) {
  if (typeof header !== "string" || header.length === 0) {
    throw new Error("Account wire header is unavailable.");
  }
  return header;
}
