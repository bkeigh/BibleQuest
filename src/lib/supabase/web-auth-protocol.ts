/** Identifies requests made only by the browser-owned customer auth protocol. */
export const WEB_AUTH_PROTOCOL_HEADER = "x-biblequest-web-auth";

/** Pins the currently reviewed browser customer-auth transport. */
export const WEB_AUTH_PROTOCOL_VERSION = "v2";

/** Seals the database adoption response without exposing schema detail. */
export const WEB_AUTH_PROTOCOL_CONTRACT =
  "biblequest_web_auth_protocol_v1";
