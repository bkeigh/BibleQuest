import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_PUSH_REMINDER_PREFERENCES,
  PUSH_REMINDER_CONTRACT,
  type PushReminderPreferences,
} from "./validation";

export interface PushPreferenceRow {
  user_id: string;
  daily_verse_enabled: boolean;
  daily_quest_enabled: boolean;
  prayer_reminders_enabled: boolean;
  weekly_recap_enabled: boolean;
  delivery_time: string;
  timezone: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
  updated_at: string;
}

export interface EncryptedSubscriptionRow {
  id: string;
  user_id: string;
  endpoint_fingerprint: string;
  encrypted_subscription: string;
  encryption_key_version: number;
  expiration_time: string | null;
  transient_failures: number;
}

export function pushFeatureEnabled(): boolean {
  return process.env.BIBLEQUEST_PUSH_ENABLED === "true";
}

function isPushContract(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === "contract,ok" &&
    (value as { contract?: unknown }).contract === PUSH_REMINDER_CONTRACT &&
    (value as { ok?: unknown }).ok === true
  );
}

/** Proves live migration/RLS posture through a content-free user-bound RPC. */
export async function pushContractReady(
  client: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await client.rpc("push_reminder_contract");
  return !error && isPushContract(data);
}

/** Maps database clocks to the exact browser preference contract. */
export function pushPreferencesFromRow(
  row: PushPreferenceRow | null,
): PushReminderPreferences {
  if (!row) return { ...DEFAULT_PUSH_REMINDER_PREFERENCES };
  return {
    dailyVerse: row.daily_verse_enabled,
    dailyQuest: row.daily_quest_enabled,
    prayerReminders: row.prayer_reminders_enabled,
    weeklyRecap: row.weekly_recap_enabled,
    deliveryTime: row.delivery_time.slice(0, 5),
    timezone: row.timezone,
    quietHoursStart: row.quiet_hours_start.slice(0, 5),
    quietHoursEnd: row.quiet_hours_end.slice(0, 5),
  };
}

/** Produces the sealed service-row shape for one validated preference update. */
export function pushPreferencesToRow(
  userId: string,
  preferences: PushReminderPreferences,
) {
  return {
    user_id: userId,
    daily_verse_enabled: preferences.dailyVerse,
    daily_quest_enabled: preferences.dailyQuest,
    prayer_reminders_enabled: preferences.prayerReminders,
    weekly_recap_enabled: preferences.weeklyRecap,
    delivery_time: preferences.deliveryTime,
    timezone: preferences.timezone,
    quiet_hours_start: preferences.quietHoursStart,
    quiet_hours_end: preferences.quietHoursEnd,
    updated_at: new Date().toISOString(),
  };
}
