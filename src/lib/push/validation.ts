export const PUSH_REMINDER_CONTRACT = "biblequest_private_push_v1";
export const MAX_PUSH_REQUEST_BYTES = 16 * 1024;

export const PUSH_REMINDER_KINDS = [
  "daily_verse",
  "daily_quest",
  "prayer_reminder",
  "weekly_recap",
] as const;

export type PushReminderKind = (typeof PUSH_REMINDER_KINDS)[number];

export interface PushReminderPreferences {
  dailyVerse: boolean;
  dailyQuest: boolean;
  prayerReminders: boolean;
  weeklyRecap: boolean;
  deliveryTime: string;
  timezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface SerializedPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export const DEFAULT_PUSH_REMINDER_PREFERENCES: PushReminderPreferences = {
  dailyVerse: false,
  dailyQuest: false,
  prayerReminders: false,
  weeklyRecap: false,
  deliveryTime: "08:00",
  timezone: "UTC",
  quietHoursStart: "21:00",
  quietHoursEnd: "07:00",
};

const CLOCK = /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/;
const BASE64_URL = /^[A-Za-z0-9_-]+={0,2}$/;
const PUSH_PROVIDER_HOSTS = new Set([
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
]);

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  return (
    Object.keys(value).sort().join(",") ===
    [...expected].sort().join(",")
  );
}

function objectValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Proves one IANA timezone without exposing it to provider logs. */
export function isSupportedTimezone(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 64 ||
    !/^[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)*$/.test(value)
  ) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Accepts exact 15-minute reminder and quiet-hour clock values. */
export function isPushClock(value: unknown): value is string {
  return typeof value === "string" && CLOCK.test(value);
}

/** Parses the exact account-level reminder preference payload. */
export function parsePushReminderPreferences(
  value: unknown,
): PushReminderPreferences | null {
  if (
    !objectValue(value) ||
    !exactKeys(value, [
      "dailyVerse",
      "dailyQuest",
      "prayerReminders",
      "weeklyRecap",
      "deliveryTime",
      "timezone",
      "quietHoursStart",
      "quietHoursEnd",
    ]) ||
    typeof value.dailyVerse !== "boolean" ||
    typeof value.dailyQuest !== "boolean" ||
    typeof value.prayerReminders !== "boolean" ||
    typeof value.weeklyRecap !== "boolean" ||
    !isPushClock(value.deliveryTime) ||
    !isSupportedTimezone(value.timezone) ||
    !isPushClock(value.quietHoursStart) ||
    !isPushClock(value.quietHoursEnd) ||
    value.quietHoursStart === value.quietHoursEnd
  ) {
    return null;
  }
  return value as unknown as PushReminderPreferences;
}

/** Requires at least one user-selected invitation before browser enrollment. */
export function anyPushReminderEnabled(
  preferences: PushReminderPreferences,
): boolean {
  return (
    preferences.dailyVerse ||
    preferences.dailyQuest ||
    preferences.prayerReminders ||
    preferences.weeklyRecap
  );
}

function decodedBase64UrlLength(value: string): number {
  const unpadded = value.replace(/=+$/, "");
  return Math.floor((unpadded.length * 3) / 4);
}

/** Limits outbound delivery to browser push providers instead of arbitrary hosts. */
export function isValidPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const endpoint = new URL(value);
    const providerHost =
      PUSH_PROVIDER_HOSTS.has(endpoint.hostname) ||
      endpoint.hostname === "notify.windows.com" ||
      endpoint.hostname.endsWith(".notify.windows.com");
    return (
      endpoint.protocol === "https:" &&
      providerHost &&
      !endpoint.port &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.hash
    );
  } catch {
    return false;
  }
}

/** Validates one browser subscription against supported provider boundaries. */
export function parseSerializedPushSubscription(
  value: unknown,
): SerializedPushSubscription | null {
  if (
    !objectValue(value) ||
    !exactKeys(value, ["endpoint", "expirationTime", "keys"]) ||
    !isValidPushEndpoint(value.endpoint) ||
    !objectValue(value.keys) ||
    !exactKeys(value.keys, ["p256dh", "auth"]) ||
    typeof value.keys.p256dh !== "string" ||
    typeof value.keys.auth !== "string" ||
    !BASE64_URL.test(value.keys.p256dh) ||
    !BASE64_URL.test(value.keys.auth) ||
    decodedBase64UrlLength(value.keys.p256dh) !== 65 ||
    decodedBase64UrlLength(value.keys.auth) !== 16 ||
    !(
      value.expirationTime === null ||
      (typeof value.expirationTime === "number" &&
        Number.isSafeInteger(value.expirationTime) &&
        value.expirationTime > Date.now() - 86_400_000 &&
        value.expirationTime < Date.now() + 5 * 366 * 86_400_000)
    )
  ) {
    return null;
  }
  return value as unknown as SerializedPushSubscription;
}

/** Maps an exact clock to the legacy broad rhythm without losing server time. */
export function broadRhythmForClock(
  value: string,
): "morning" | "afternoon" | "evening" {
  const hour = Number(value.slice(0, 2));
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
