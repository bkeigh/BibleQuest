import type {
  PushReminderKind,
  PushReminderPreferences,
} from "./validation";

const DUE_WINDOW_MINUTES = 90;

interface LocalParts {
  date: string;
  weekday: string;
  minuteOfDay: number;
}

function clockMinute(clock: string): number {
  return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
}

function localParts(now: Date, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    weekday: value("weekday"),
    minuteOfDay: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function previousDate(date: string): string {
  const instant = new Date(`${date}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() - 1);
  return instant.toISOString().slice(0, 10);
}

function isQuiet(
  minute: number,
  quietStart: number,
  quietEnd: number,
): boolean {
  return quietStart < quietEnd
    ? minute >= quietStart && minute < quietEnd
    : minute >= quietStart || minute < quietEnd;
}

/** Returns the reminder date due now, shifting quiet-hour choices to quiet end. */
export function dueReminderDate(
  now: Date,
  preferences: PushReminderPreferences,
): string | null {
  const local = localParts(now, preferences.timezone);
  const desired = clockMinute(preferences.deliveryTime);
  const quietStart = clockMinute(preferences.quietHoursStart);
  const quietEnd = clockMinute(preferences.quietHoursEnd);
  let dueMinute = desired;
  let reminderDate = local.date;

  if (isQuiet(desired, quietStart, quietEnd)) {
    dueMinute = quietEnd;
    if (quietStart > quietEnd && desired >= quietStart) {
      reminderDate = previousDate(local.date);
    }
  }

  const lateBy = local.minuteOfDay - dueMinute;
  return lateBy >= 0 && lateBy <= DUE_WINDOW_MINUTES
    ? reminderDate
    : null;
}

/** Selects only enabled neutral reminder kinds, with recap on local Sunday. */
export function dueReminderKinds(
  preferences: PushReminderPreferences,
  reminderDate: string,
): PushReminderKind[] {
  const kinds: PushReminderKind[] = [];
  if (preferences.dailyVerse) kinds.push("daily_verse");
  if (preferences.dailyQuest) kinds.push("daily_quest");
  if (preferences.prayerReminders) kinds.push("prayer_reminder");
  const weekday = new Date(`${reminderDate}T00:00:00.000Z`).getUTCDay();
  if (preferences.weeklyRecap && weekday === 0) kinds.push("weekly_recap");
  return kinds;
}
