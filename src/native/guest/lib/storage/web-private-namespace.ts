"use client";

/** Keeps the guest overlay free of account and cutover storage markers. */
const DISABLED_ACCOUNT_STORAGE_KEY = "";

/** Retains the original device-local keys used by guest journeys. */
export const LEGACY_QUEST_JOURNEY_STORAGE_KEY = "biblequest:v1";
export const LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX =
  "biblequest:journal-draft";
export const LEGACY_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY =
  "biblequest:journal-drafts-cleared-at";
export const LEGACY_RHYTHM_STORAGE_KEY = "biblequest:rhythm:v1";
export const LEGACY_GAME_STORAGE_KEY = "biblequest:scripture-games:v1";
export const LEGACY_SEVEN_DAYS_STORAGE_KEY =
  "biblequest:seven-days-match:v1";
export const LEGACY_SEVEN_DAYS_TUTORIAL_STORAGE_KEY =
  "biblequest:seven-days-match:tutorial:v1";
export const LEGACY_ARCADE_BOOST_STORAGE_KEY =
  "biblequest:arcade-boosts:v1";
export const LEGACY_AVATAR_DATABASE_NAME = "biblequest-media";

/** Routes every guest v2 alias back to the same local-only storage key. */
export const WEB_V2_QUEST_JOURNEY_STORAGE_KEY =
  LEGACY_QUEST_JOURNEY_STORAGE_KEY;
export const WEB_V2_JOURNAL_DRAFT_STORAGE_PREFIX =
  LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX;
export const WEB_V2_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY =
  LEGACY_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY;
export const WEB_V2_RHYTHM_STORAGE_KEY = LEGACY_RHYTHM_STORAGE_KEY;
export const WEB_V2_GAME_STORAGE_KEY = LEGACY_GAME_STORAGE_KEY;
export const WEB_V2_SEVEN_DAYS_STORAGE_KEY =
  LEGACY_SEVEN_DAYS_STORAGE_KEY;
export const WEB_V2_SEVEN_DAYS_TUTORIAL_STORAGE_KEY =
  LEGACY_SEVEN_DAYS_TUTORIAL_STORAGE_KEY;
export const WEB_V2_ARCADE_BOOST_STORAGE_KEY =
  LEGACY_ARCADE_BOOST_STORAGE_KEY;
export const WEB_V2_AVATAR_DATABASE_NAME = LEGACY_AVATAR_DATABASE_NAME;

/** Makes every account-only key unusable without shipping its old literal. */
export const WEB_PRIVATE_NAMESPACE_V2_MARKER = DISABLED_ACCOUNT_STORAGE_KEY;
export const WEB_PRIVATE_CUTOVER_JOURNAL_KEY = DISABLED_ACCOUNT_STORAGE_KEY;
export const WEB_PRIVATE_GUEST_CLEAR_JOURNAL_KEY =
  DISABLED_ACCOUNT_STORAGE_KEY;
export const LEGACY_LAST_SYNC_USER_STORAGE_KEY =
  DISABLED_ACCOUNT_STORAGE_KEY;
export const WEB_V2_LAST_SYNC_USER_STORAGE_KEY =
  DISABLED_ACCOUNT_STORAGE_KEY;
export const LEGACY_INITIAL_SYNC_PENDING_STORAGE_KEY =
  DISABLED_ACCOUNT_STORAGE_KEY;
export const WEB_V2_INITIAL_SYNC_PENDING_STORAGE_KEY =
  DISABLED_ACCOUNT_STORAGE_KEY;
export const LEGACY_LOCAL_CLAIM_PENDING_STORAGE_KEY =
  DISABLED_ACCOUNT_STORAGE_KEY;
export const WEB_V2_LOCAL_CLAIM_PENDING_STORAGE_KEY =
  DISABLED_ACCOUNT_STORAGE_KEY;
export const WEB_V2_HANDOFF_CONTRACT_STORAGE_KEY =
  DISABLED_ACCOUNT_STORAGE_KEY;
export const LEGACY_GUEST_PROVENANCE_STORAGE_KEY =
  DISABLED_ACCOUNT_STORAGE_KEY;
export const WEB_V2_GUEST_PROVENANCE_STORAGE_KEY =
  DISABLED_ACCOUNT_STORAGE_KEY;
export const LEGACY_ACCOUNT_SYNC_GENERATION_STORAGE_KEY =
  DISABLED_ACCOUNT_STORAGE_KEY;
export const WEB_V2_ACCOUNT_SYNC_GENERATION_STORAGE_KEY =
  DISABLED_ACCOUNT_STORAGE_KEY;
export const LEGACY_DAILY_QUEST_SYNC_STORAGE_KEY =
  DISABLED_ACCOUNT_STORAGE_KEY;
export const WEB_V2_DAILY_QUEST_SYNC_STORAGE_KEY =
  DISABLED_ACCOUNT_STORAGE_KEY;
export const LEGACY_MUTABLE_REVISION_STORAGE_KEY =
  DISABLED_ACCOUNT_STORAGE_KEY;
export const WEB_V2_MUTABLE_REVISION_STORAGE_KEY =
  DISABLED_ACCOUNT_STORAGE_KEY;
export const LEGACY_SIGN_IN_TRACKING_STAMP_KEY =
  DISABLED_ACCOUNT_STORAGE_KEY;
export const WEB_V2_SIGN_IN_TRACKING_STAMP_KEY =
  DISABLED_ACCOUNT_STORAGE_KEY;

/** Preserves public constant types while disabling every account transition. */
export const WEB_PRIVATE_NAMESPACE_V2_COMPLETE = "complete";
export const WEB_PRIVATE_CUTOVER_STAGING = "staging";
export const WEB_PRIVATE_CUTOVER_PREPARED = "prepared";
export const WEB_PRIVATE_GUEST_CLEAR_IN_PROGRESS = "clearing";
export const WEB_PRIVATE_NEVER_OWNED_VALUE = "never-owned";
export const WEB_PRIVATE_HANDOFF_CONTRACT_COMPLETE = "complete";

export type WebPrivateNamespaceState = "legacy" | "unavailable" | "v2";
export type WebPrivateGuestClearState =
  | "clearing"
  | "none"
  | "unavailable";

type NamespaceStorage = Pick<Storage, "getItem">;

/** Probes the legacy guest key without reading an account journal. */
function guestStorageIsReadable(storage: NamespaceStorage): boolean {
  try {
    void storage.getItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Guest builds never enter an account-clear recovery phase. */
export function readWebPrivateGuestClearState(
  storage: NamespaceStorage,
): WebPrivateGuestClearState {
  return guestStorageIsReadable(storage) ? "none" : "unavailable";
}

/** Selects only the legacy device-local namespace in a guest build. */
export function readWebPrivateNamespaceState(
  storage: NamespaceStorage,
): WebPrivateNamespaceState {
  return guestStorageIsReadable(storage) ? "legacy" : "unavailable";
}

/** Returns a usable legacy key and refuses every disabled account key. */
export function selectedWebPrivateStorageKey(
  storage: NamespaceStorage,
  legacyKey: string,
  _v2Key: string,
): string | null {
  void _v2Key;
  if (!legacyKey || readWebPrivateNamespaceState(storage) !== "legacy") {
    return null;
  }
  return legacyKey;
}

/** Keeps guest avatar bytes in the original local database. */
export function selectedWebPrivateAvatarDatabase(
  storage: NamespaceStorage,
): string | null {
  return readWebPrivateNamespaceState(storage) === "legacy"
    ? LEGACY_AVATAR_DATABASE_NAME
    : null;
}

/** Guest builds perform no account namespace copy or removal. */
export const WEB_PRIVATE_FIXED_STORAGE_KEY_PAIRS: ReadonlyArray<
  readonly [string, string]
> = Object.freeze([]);
export const WEB_PRIVATE_LEGACY_REMOVAL_ONLY_KEYS: readonly string[] =
  Object.freeze([]);
export const WEB_PRIVATE_V2_REMOVAL_ONLY_KEYS: readonly string[] =
  Object.freeze([]);

/** No guest-local key is an account-boundary mutation marker. */
export function isWebPrivateBoundaryStorageKey(_key: string | null): boolean {
  void _key;
  return false;
}
