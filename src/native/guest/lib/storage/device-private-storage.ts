"use client";

/** Keeps the guest journey on its original device-only storage key. */
export const DEVICE_JOURNEY_STORAGE_KEY = "biblequest:v1";
export const PROTECTED_JOURNEY_STORAGE_KEY = DEVICE_JOURNEY_STORAGE_KEY;
export const DEVICE_JOURNAL_DRAFT_PREFIX = "biblequest:journal-draft";
export const PROTECTED_JOURNAL_DRAFT_PREFIX = DEVICE_JOURNAL_DRAFT_PREFIX;
export const DEVICE_JOURNAL_DRAFTS_CLEARED_KEY =
  "biblequest:journal-drafts-cleared-at";
export const PROTECTED_JOURNAL_DRAFTS_CLEARED_KEY =
  DEVICE_JOURNAL_DRAFTS_CLEARED_KEY;
export const DEVICE_RHYTHM_STORAGE_KEY = "biblequest:rhythm:v1";
export const PROTECTED_RHYTHM_STORAGE_KEY = DEVICE_RHYTHM_STORAGE_KEY;
export const DEVICE_GAME_STORAGE_KEY = "biblequest:scripture-games:v1";
export const PROTECTED_GAME_STORAGE_KEY = DEVICE_GAME_STORAGE_KEY;
export const DEVICE_SEVEN_DAYS_STORAGE_KEY =
  "biblequest:seven-days-match:v1";
export const PROTECTED_SEVEN_DAYS_STORAGE_KEY =
  DEVICE_SEVEN_DAYS_STORAGE_KEY;
export const DEVICE_SEVEN_DAYS_TUTORIAL_STORAGE_KEY =
  "biblequest:seven-days-match:tutorial:v1";
export const PROTECTED_SEVEN_DAYS_TUTORIAL_STORAGE_KEY =
  DEVICE_SEVEN_DAYS_TUTORIAL_STORAGE_KEY;
export const DEVICE_ARCADE_BOOST_STORAGE_KEY =
  "biblequest:arcade-boosts:v1";
export const PROTECTED_ARCADE_BOOST_STORAGE_KEY =
  DEVICE_ARCADE_BOOST_STORAGE_KEY;
export const DEVICE_AVATAR_DATABASE_NAME = "biblequest-media";
export const PROTECTED_AVATAR_DATABASE_NAME = DEVICE_AVATAR_DATABASE_NAME;

type DeviceStorage = Pick<Storage, "getItem">;
export type DevicePrivateStorageState = "legacy" | "unavailable" | "v2";

/** Proves the device storage surface can be read without inspecting private data. */
function deviceStorageIsReadable(storage: DeviceStorage): boolean {
  try {
    void storage.getItem(DEVICE_JOURNEY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Guest releases use only the original device namespace. */
export function readDevicePrivateStorageState(
  storage: DeviceStorage,
): DevicePrivateStorageState {
  return deviceStorageIsReadable(storage) ? "legacy" : "unavailable";
}

/** Selects only a nonempty device key in readable storage. */
export function selectDevicePrivateStorageKey(
  storage: DeviceStorage,
  deviceKey: string,
  protectedKey: string,
): string | null {
  void protectedKey;
  return deviceKey && readDevicePrivateStorageState(storage) === "legacy"
    ? deviceKey
    : null;
}

/** Keeps guest avatar bytes in the original device database. */
export function selectDevicePrivateAvatarDatabase(
  storage: DeviceStorage,
): string | null {
  return readDevicePrivateStorageState(storage) === "legacy"
    ? DEVICE_AVATAR_DATABASE_NAME
    : null;
}
