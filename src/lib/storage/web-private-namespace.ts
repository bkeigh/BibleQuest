"use client";

export const WEB_PRIVATE_NAMESPACE_V2_MARKER =
  "biblequest:web-private:namespace:v2";
export const WEB_PRIVATE_NAMESPACE_V2_COMPLETE = "complete";
export const WEB_PRIVATE_CUTOVER_JOURNAL_KEY =
  "biblequest:web-private:v2:cutover";
export const WEB_PRIVATE_CUTOVER_STAGING = "staging";
export const WEB_PRIVATE_CUTOVER_PREPARED = "prepared";
export const WEB_PRIVATE_GUEST_CLEAR_JOURNAL_KEY =
  "biblequest:web-private:legacy-guest-clear:v1";
export const WEB_PRIVATE_GUEST_CLEAR_IN_PROGRESS = "clearing";
export const WEB_PRIVATE_NEVER_OWNED_VALUE = "never-owned";
export const WEB_PRIVATE_HANDOFF_CONTRACT_COMPLETE = "complete";

export const LEGACY_QUEST_JOURNEY_STORAGE_KEY = "biblequest:v1";
export const WEB_V2_QUEST_JOURNEY_STORAGE_KEY =
  "biblequest:web-private:v2:journey";

export const LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX =
  "biblequest:journal-draft";
export const WEB_V2_JOURNAL_DRAFT_STORAGE_PREFIX =
  "biblequest:web-private:v2:journal-draft";
export const LEGACY_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY =
  "biblequest:journal-drafts-cleared-at";
export const WEB_V2_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY =
  "biblequest:web-private:v2:journal-drafts-cleared-at";

export const LEGACY_RHYTHM_STORAGE_KEY = "biblequest:rhythm:v1";
export const WEB_V2_RHYTHM_STORAGE_KEY =
  "biblequest:web-private:v2:rhythm";
export const LEGACY_GAME_STORAGE_KEY = "biblequest:scripture-games:v1";
export const WEB_V2_GAME_STORAGE_KEY =
  "biblequest:web-private:v2:scripture-games";
export const LEGACY_SEVEN_DAYS_STORAGE_KEY =
  "biblequest:seven-days-match:v1";
export const WEB_V2_SEVEN_DAYS_STORAGE_KEY =
  "biblequest:web-private:v2:seven-days-match";
export const LEGACY_SEVEN_DAYS_TUTORIAL_STORAGE_KEY =
  "biblequest:seven-days-match:tutorial:v1";
export const WEB_V2_SEVEN_DAYS_TUTORIAL_STORAGE_KEY =
  "biblequest:web-private:v2:seven-days-match:tutorial";
export const LEGACY_ARCADE_BOOST_STORAGE_KEY =
  "biblequest:arcade-boosts:v1";
export const WEB_V2_ARCADE_BOOST_STORAGE_KEY =
  "biblequest:web-private:v2:arcade-boosts";

export const LEGACY_LAST_SYNC_USER_STORAGE_KEY =
  "biblequest:last-sync-user";
export const WEB_V2_LAST_SYNC_USER_STORAGE_KEY =
  "biblequest:web-private:v2:last-sync-user";
export const LEGACY_INITIAL_SYNC_PENDING_STORAGE_KEY =
  "biblequest:initial-sync-pending-user";
export const WEB_V2_INITIAL_SYNC_PENDING_STORAGE_KEY =
  "biblequest:web-private:v2:initial-sync-pending-user";
export const LEGACY_LOCAL_CLAIM_PENDING_STORAGE_KEY =
  "biblequest:local-claim-pending-user";
export const WEB_V2_LOCAL_CLAIM_PENDING_STORAGE_KEY =
  "biblequest:web-private:v2:local-claim-pending-user";
export const WEB_V2_HANDOFF_CONTRACT_STORAGE_KEY =
  "biblequest:web-private:v2:handoff-contract";
export const LEGACY_GUEST_PROVENANCE_STORAGE_KEY =
  "biblequest:web-private:legacy-guest:v1";
export const WEB_V2_GUEST_PROVENANCE_STORAGE_KEY =
  "biblequest:web-private:v2:guest-provenance";
export const LEGACY_ACCOUNT_SYNC_GENERATION_STORAGE_KEY =
  "biblequest:account-sync-generation:v1";
export const WEB_V2_ACCOUNT_SYNC_GENERATION_STORAGE_KEY =
  "biblequest:web-private:v2:account-sync-generation";
export const LEGACY_DAILY_QUEST_SYNC_STORAGE_KEY =
  "biblequest:daily-quest-cas:v1";
export const WEB_V2_DAILY_QUEST_SYNC_STORAGE_KEY =
  "biblequest:web-private:v2:daily-quest-cas";
export const LEGACY_MUTABLE_REVISION_STORAGE_KEY =
  "biblequest:mutable-account-cas:v1";
export const WEB_V2_MUTABLE_REVISION_STORAGE_KEY =
  "biblequest:web-private:v2:mutable-account-cas";
export const LEGACY_SIGN_IN_TRACKING_STAMP_KEY =
  "biblequest:signin-tracked";
export const WEB_V2_SIGN_IN_TRACKING_STAMP_KEY =
  "biblequest:web-private:v2:signin-tracked";

export const LEGACY_AVATAR_DATABASE_NAME = "biblequest-media";
export const WEB_V2_AVATAR_DATABASE_NAME = "biblequest-media-v2";

type NamespaceStorage = Pick<Storage, "getItem">;

export type WebPrivateNamespaceState = "legacy" | "unavailable" | "v2";
export type WebPrivateGuestClearState =
  | "clearing"
  | "none"
  | "unavailable";

/** Reads only the content-free explicit guest-clear crash phase. */
export function readWebPrivateGuestClearState(
  storage: NamespaceStorage,
): WebPrivateGuestClearState {
  try {
    const phase = storage.getItem(WEB_PRIVATE_GUEST_CLEAR_JOURNAL_KEY);
    if (phase === null) return "none";
    return phase === WEB_PRIVATE_GUEST_CLEAR_IN_PROGRESS
      ? "clearing"
      : "unavailable";
  } catch {
    return "unavailable";
  }
}

/** Distinguishes genuine legacy state from committed or interrupted cutover. */
export function readWebPrivateNamespaceState(
  storage: NamespaceStorage,
): WebPrivateNamespaceState {
  try {
    if (readWebPrivateGuestClearState(storage) !== "none") {
      return "unavailable";
    }
    const marker = storage.getItem(WEB_PRIVATE_NAMESPACE_V2_MARKER);
    if (marker === WEB_PRIVATE_NAMESPACE_V2_COMPLETE) return "v2";
    if (marker !== null) return "unavailable";
    return storage.getItem(WEB_PRIVATE_CUTOVER_JOURNAL_KEY) === null
      ? "legacy"
      : "unavailable";
  } catch {
    return "unavailable";
  }
}

/** Keeps genuine pre-cutover guests on legacy storage and installed owners on v2. */
export function selectedWebPrivateStorageKey(
  storage: NamespaceStorage,
  legacyKey: string,
  v2Key: string,
): string | null {
  const state = readWebPrivateNamespaceState(storage);
  if (state === "unavailable") return null;
  return state === "v2" ? v2Key : legacyKey;
}

/** Chooses the avatar database through the same atomic namespace marker. */
export function selectedWebPrivateAvatarDatabase(
  storage: NamespaceStorage,
): string | null {
  const state = readWebPrivateNamespaceState(storage);
  if (state === "unavailable") return null;
  return state === "v2"
    ? WEB_V2_AVATAR_DATABASE_NAME
    : LEGACY_AVATAR_DATABASE_NAME;
}

/** Lists fixed legacy/v2 pairs without storing private values in the journal. */
export const WEB_PRIVATE_FIXED_STORAGE_KEY_PAIRS = Object.freeze([
  [LEGACY_QUEST_JOURNEY_STORAGE_KEY, WEB_V2_QUEST_JOURNEY_STORAGE_KEY],
  [
    LEGACY_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY,
    WEB_V2_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY,
  ],
  [LEGACY_RHYTHM_STORAGE_KEY, WEB_V2_RHYTHM_STORAGE_KEY],
  [LEGACY_GAME_STORAGE_KEY, WEB_V2_GAME_STORAGE_KEY],
  [LEGACY_SEVEN_DAYS_STORAGE_KEY, WEB_V2_SEVEN_DAYS_STORAGE_KEY],
  [
    LEGACY_SEVEN_DAYS_TUTORIAL_STORAGE_KEY,
    WEB_V2_SEVEN_DAYS_TUTORIAL_STORAGE_KEY,
  ],
  [LEGACY_ARCADE_BOOST_STORAGE_KEY, WEB_V2_ARCADE_BOOST_STORAGE_KEY],
  [LEGACY_LAST_SYNC_USER_STORAGE_KEY, WEB_V2_LAST_SYNC_USER_STORAGE_KEY],
  [
    LEGACY_INITIAL_SYNC_PENDING_STORAGE_KEY,
    WEB_V2_INITIAL_SYNC_PENDING_STORAGE_KEY,
  ],
  [
    LEGACY_LOCAL_CLAIM_PENDING_STORAGE_KEY,
    WEB_V2_LOCAL_CLAIM_PENDING_STORAGE_KEY,
  ],
  [
    LEGACY_GUEST_PROVENANCE_STORAGE_KEY,
    WEB_V2_GUEST_PROVENANCE_STORAGE_KEY,
  ],
  [
    LEGACY_ACCOUNT_SYNC_GENERATION_STORAGE_KEY,
    WEB_V2_ACCOUNT_SYNC_GENERATION_STORAGE_KEY,
  ],
  [LEGACY_DAILY_QUEST_SYNC_STORAGE_KEY, WEB_V2_DAILY_QUEST_SYNC_STORAGE_KEY],
  [
    LEGACY_MUTABLE_REVISION_STORAGE_KEY,
    WEB_V2_MUTABLE_REVISION_STORAGE_KEY,
  ],
] as const);

/** Removes obsolete identity-bearing ephemera instead of copying it forward. */
export const WEB_PRIVATE_LEGACY_REMOVAL_ONLY_KEYS = Object.freeze([
  LEGACY_SIGN_IN_TRACKING_STAMP_KEY,
] as const);

/** Lists v2-only metadata that a reset must remove without a legacy copy. */
export const WEB_PRIVATE_V2_REMOVAL_ONLY_KEYS = Object.freeze([
  WEB_V2_SIGN_IN_TRACKING_STAMP_KEY,
  WEB_V2_HANDOFF_CONTRACT_STORAGE_KEY,
] as const);

const WEB_PRIVATE_BOUNDARY_FIXED_KEYS = new Set<string>([
  ...WEB_PRIVATE_FIXED_STORAGE_KEY_PAIRS.flatMap(([legacyKey, v2Key]) => [
    legacyKey,
    v2Key,
  ]),
  ...WEB_PRIVATE_LEGACY_REMOVAL_ONLY_KEYS,
  ...WEB_PRIVATE_V2_REMOVAL_ONLY_KEYS,
  WEB_PRIVATE_NAMESPACE_V2_MARKER,
  WEB_PRIVATE_CUTOVER_JOURNAL_KEY,
  WEB_PRIVATE_GUEST_CLEAR_JOURNAL_KEY,
]);

/** Identifies every private namespace mutation that revokes in-memory reads. */
export function isWebPrivateBoundaryStorageKey(key: string | null): boolean {
  if (key === null) return true;
  if (key.length > 512) return false;
  return (
    WEB_PRIVATE_BOUNDARY_FIXED_KEYS.has(key) ||
    key.startsWith(`${LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX}:`) ||
    key.startsWith(`${WEB_V2_JOURNAL_DRAFT_STORAGE_PREFIX}:`)
  );
}
