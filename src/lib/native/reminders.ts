/**
 * Guest-safe local reminders for the installed app.
 *
 * Preferences stay on this device, notification text is deliberately neutral,
 * and BibleQuest owns a tiny fixed ID range so reconciliation never cancels a
 * notification scheduled by another feature. Multiple daily choices collapse
 * into one invitation to avoid three simultaneous lock-screen alerts.
 */
import type { PushReminderPreferences } from "@/lib/push/validation";
import {
  anyPushReminderEnabled,
  parsePushReminderPreferences,
} from "@/lib/push/validation";
import { withDeadline } from "@/lib/async/deadline";
import { isNativeTarget } from "@/lib/platform/target";

const STORAGE_KEY = "biblequest:native-reminders:v1";
const DAILY_REMINDER_ID = 271_001;
const WEEKLY_REMINDER_ID = 271_002;
const TEST_REMINDER_ID = 271_099;
const RECURRING_IDS = [DAILY_REMINDER_ID, WEEKLY_REMINDER_ID];
const OWNED_IDS = [...RECURRING_IDS, TEST_REMINDER_ID];
const NATIVE_PURGE_DEADLINE_MS = 5_000;

export type NativeReminderPermission =
  | "prompt"
  | "prompt-with-rationale"
  | "granted"
  | "denied";

export interface NativeReminderPlanItem {
  id: number;
  title: string;
  body: string;
  schedule: {
    on: { weekday?: 1 | 2; hour: number; minute: number };
    repeats: true;
  };
  extra: { path: "/app" };
  interruptionLevel: "passive";
}

export interface NativeReminderStatus {
  permission: NativeReminderPermission;
  enabled: boolean;
}

export class NativeReminderPermissionError extends Error {
  constructor() {
    super("Native notification permission is not available.");
    this.name = "NativeReminderPermissionError";
  }
}

function clockMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

/** Moves a delivery through quiet hours and records any midnight rollover. */
export function effectiveReminderDelivery(
  deliveryTime: string,
  quietHoursStart: string,
  quietHoursEnd: string,
): { time: string; dayOffset: 0 | 1 } {
  const delivery = clockMinutes(deliveryTime);
  const start = clockMinutes(quietHoursStart);
  const end = clockMinutes(quietHoursEnd);
  const crossesMidnight = start > end;
  const inside =
    start < end
      ? delivery >= start && delivery < end
      : delivery >= start || delivery < end;
  if (!inside) return { time: deliveryTime, dayOffset: 0 };
  return {
    time: quietHoursEnd,
    dayOffset: crossesMidnight && delivery >= start ? 1 : 0,
  };
}

/** Builds the complete fixed-ID schedule without touching native APIs. */
export function nativeReminderPlan(
  preferences: PushReminderPreferences,
): NativeReminderPlanItem[] {
  if (!parsePushReminderPreferences(preferences)) return [];
  const effective = effectiveReminderDelivery(
    preferences.deliveryTime,
    preferences.quietHoursStart,
    preferences.quietHoursEnd,
  );
  const [hour, minute] = effective.time.split(":").map(Number);
  const dailyEnabled =
    preferences.dailyVerse ||
    preferences.dailyQuest ||
    preferences.prayerReminders;
  const common = {
    title: "BibleQuest",
    extra: { path: "/app" as const },
    interruptionLevel: "passive" as const,
  };
  const plan: NativeReminderPlanItem[] = [];

  if (dailyEnabled) {
    plan.push({
      ...common,
      id: DAILY_REMINDER_ID,
      body: "A quiet moment is waiting when you’re ready.",
      schedule: { on: { hour, minute }, repeats: true },
    });
  }
  if (preferences.weeklyRecap) {
    plan.push({
      ...common,
      id: WEEKLY_REMINDER_ID,
      body: "A gentle weekly reflection is ready.",
      // Capacitor follows Apple's calendar convention: Sunday is weekday 1.
      schedule: {
        on: {
          weekday: effective.dayOffset === 1 ? 2 : 1,
          hour,
          minute,
        },
        repeats: true,
      },
    });
  }
  return plan;
}

/** Reads only a fully valid preference record and otherwise uses the fallback. */
export function readNativeReminderPreferences(
  fallback: PushReminderPreferences,
): PushReminderPreferences {
  try {
    const parsed = parsePushReminderPreferences(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null"),
    );
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function storeNativeReminderPreferences(
  preferences: PushReminderPreferences,
): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

async function plugin() {
  return (await import("@capacitor/local-notifications")).LocalNotifications;
}

/** Reports permission and whether one BibleQuest-owned schedule is pending. */
export async function nativeReminderStatus(): Promise<NativeReminderStatus> {
  const notifications = await plugin();
  const [{ display }, pending] = await Promise.all([
    notifications.checkPermissions(),
    notifications.getPending(),
  ]);
  return {
    permission: display,
    enabled: pending.notifications.some((item) =>
      RECURRING_IDS.includes(item.id),
    ),
  };
}

/** Replaces only BibleQuest's schedules and persists after native success. */
export async function reconcileNativeReminders(
  preferences: PushReminderPreferences,
): Promise<void> {
  const valid = parsePushReminderPreferences(preferences);
  if (!valid) throw new Error("Invalid native reminder preferences.");
  const notifications = await plugin();
  await notifications.cancel({
    notifications: OWNED_IDS.map((id) => ({ id })),
  });
  const plan = nativeReminderPlan(valid);
  if (plan.length > 0) {
    await notifications.schedule({ notifications: plan });
  }
  storeNativeReminderPreferences(valid);
}

/** Requests iOS permission only after the user's explicit Enable action. */
export async function enableNativeReminders(
  preferences: PushReminderPreferences,
): Promise<void> {
  if (!anyPushReminderEnabled(preferences)) return;
  const notifications = await plugin();
  let { display } = await notifications.checkPermissions();
  if (display === "prompt" || display === "prompt-with-rationale") {
    ({ display } = await notifications.requestPermissions());
  }
  if (display !== "granted") throw new NativeReminderPermissionError();
  await reconcileNativeReminders(preferences);
}

/** Cancels all owned schedules and retains the user's explicit off choices. */
export async function disableNativeReminders(
  preferences: PushReminderPreferences,
): Promise<void> {
  await reconcileNativeReminders({
    ...preferences,
    dailyVerse: false,
    dailyQuest: false,
    prayerReminders: false,
    weeklyRecap: false,
  });
}

/** Removes every owned schedule, delivered alert, and local preference. */
export async function purgeNativeReminders(): Promise<void> {
  if (!isNativeTarget()) return;

  // Remove the device preference first so a stalled native bridge can never
  // leave reminders enabled in BibleQuest's own state.
  let storageFailed = false;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    storageFailed = true;
  }

  const notifications = await plugin();
  // Both native calls are independent and bounded. Clearing this app's whole
  // Notification Center avoids iOS's callback-based delivered-alert lookup.
  const outcomes = await Promise.allSettled([
    withDeadline(
      notifications.cancel({
        notifications: OWNED_IDS.map((id) => ({ id })),
      }),
      NATIVE_PURGE_DEADLINE_MS,
      "Native reminder cancellation",
    ),
    withDeadline(
      notifications.removeAllDeliveredNotifications(),
      NATIVE_PURGE_DEADLINE_MS,
      "Delivered reminder cleanup",
    ),
  ]);

  const nativeCleanupFailed = outcomes.some(
    (outcome) => outcome.status === "rejected",
  );
  if (storageFailed || nativeCleanupFailed) {
    throw new Error("Native reminders could not be fully purged.");
  }
}

/** Schedules one neutral five-second test after permission is already granted. */
export async function sendNativeReminderTest(): Promise<void> {
  const notifications = await plugin();
  const { display } = await notifications.checkPermissions();
  if (display !== "granted") throw new NativeReminderPermissionError();
  await notifications.cancel({ notifications: [{ id: TEST_REMINDER_ID }] });
  await notifications.schedule({
    notifications: [
      {
        id: TEST_REMINDER_ID,
        title: "BibleQuest",
        body: "Your gentle reminders are ready.",
        schedule: { at: new Date(Date.now() + 5_000) },
        extra: { path: "/app" },
        interruptionLevel: "passive",
      },
    ],
  });
}

/** Routes taps from BibleQuest-owned reminders to the app home only. */
export async function listenForNativeReminderOpen(
  onOpen: () => void,
): Promise<() => Promise<void>> {
  const notifications = await plugin();
  const listener = await notifications.addListener(
    "localNotificationActionPerformed",
    ({ notification }) => {
      if (
        OWNED_IDS.includes(notification.id) &&
        notification.extra?.path === "/app"
      ) {
        onOpen();
      }
    },
  );
  return () => listener.remove();
}
