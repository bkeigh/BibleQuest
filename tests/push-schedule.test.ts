import { describe, expect, it } from "vitest";
import {
  dueReminderDate,
  dueReminderKinds,
} from "@/lib/push/schedule";
import {
  DEFAULT_PUSH_REMINDER_PREFERENCES,
  type PushReminderPreferences,
} from "@/lib/push/validation";

function preferences(
  patch: Partial<PushReminderPreferences> = {},
): PushReminderPreferences {
  return {
    ...DEFAULT_PUSH_REMINDER_PREFERENCES,
    dailyVerse: true,
    timezone: "America/New_York",
    ...patch,
  };
}

describe("timezone-safe push scheduling", () => {
  it("delivers inside the bounded local-time window, independent of UTC day", () => {
    const value = preferences({ deliveryTime: "08:00" });

    expect(
      dueReminderDate(new Date("2026-07-24T12:07:00.000Z"), value),
    ).toBe("2026-07-24");
    expect(
      dueReminderDate(new Date("2026-07-24T11:59:00.000Z"), value),
    ).toBeNull();
    expect(
      dueReminderDate(new Date("2026-07-24T14:00:00.000Z"), value),
    ).toBeNull();
  });

  it("shifts early and late quiet-hour choices to quiet-hours end", () => {
    const early = preferences({ deliveryTime: "06:30" });
    expect(
      dueReminderDate(new Date("2026-07-24T11:00:00.000Z"), early),
    ).toBe("2026-07-24");

    const late = preferences({ deliveryTime: "22:00" });
    expect(
      dueReminderDate(new Date("2026-07-25T11:00:00.000Z"), late),
    ).toBe("2026-07-24");
  });

  it("survives spring-forward gaps and fall-back duplicates", () => {
    const spring = preferences({
      deliveryTime: "02:30",
      quietHoursStart: "23:45",
      quietHoursEnd: "00:15",
    });
    expect(
      dueReminderDate(new Date("2026-03-08T07:00:00.000Z"), spring),
    ).toBe("2026-03-08");

    const fall = preferences({
      deliveryTime: "01:30",
      quietHoursStart: "23:45",
      quietHoursEnd: "00:15",
    });
    expect(
      dueReminderDate(new Date("2026-11-01T05:30:00.000Z"), fall),
    ).toBe("2026-11-01");
    expect(
      dueReminderDate(new Date("2026-11-01T06:30:00.000Z"), fall),
    ).toBe("2026-11-01");
  });

  it("includes weekly recap only for the reminder's local Sunday", () => {
    const value = preferences({
      dailyQuest: true,
      prayerReminders: true,
      weeklyRecap: true,
    });
    expect(dueReminderKinds(value, "2026-07-26")).toEqual([
      "daily_verse",
      "daily_quest",
      "prayer_reminder",
      "weekly_recap",
    ]);
    expect(dueReminderKinds(value, "2026-07-27")).not.toContain(
      "weekly_recap",
    );
  });
});
