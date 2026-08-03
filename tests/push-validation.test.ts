import { describe, expect, it, vi } from "vitest";
import {
  anyPushReminderEnabled,
  broadRhythmForClock,
  DEFAULT_PUSH_REMINDER_PREFERENCES,
  isValidPushEndpoint,
  parsePushReminderPreferences,
  parseSerializedPushSubscription,
} from "@/lib/push/validation";

const P256DH = "A".repeat(87);
const AUTH = "B".repeat(22);

describe("push reminder input validation", () => {
  it("accepts exact account preferences and rejects unknown or unsafe values", () => {
    const valid = {
      ...DEFAULT_PUSH_REMINDER_PREFERENCES,
      dailyVerse: true,
      timezone: "America/New_York",
    };
    expect(parsePushReminderPreferences(valid)).toEqual(valid);
    expect(
      parsePushReminderPreferences({ ...valid, extra: true }),
    ).toBeNull();
    expect(
      parsePushReminderPreferences({ ...valid, deliveryTime: "08:07" }),
    ).toBeNull();
    expect(
      parsePushReminderPreferences({
        ...valid,
        quietHoursEnd: valid.quietHoursStart,
      }),
    ).toBeNull();
    expect(
      parsePushReminderPreferences({ ...valid, timezone: "../private" }),
    ).toBeNull();
  });

  it("requires one explicit invitation choice before enrollment", () => {
    expect(
      anyPushReminderEnabled(DEFAULT_PUSH_REMINDER_PREFERENCES),
    ).toBe(false);
    expect(
      anyPushReminderEnabled({
        ...DEFAULT_PUSH_REMINDER_PREFERENCES,
        prayerReminders: true,
      }),
    ).toBe(true);
  });

  it("accepts supported HTTPS providers and exact browser key sizes", () => {
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/opaque?token=allowed",
      expirationTime: null,
      keys: { p256dh: P256DH, auth: AUTH },
    };
    expect(parseSerializedPushSubscription(subscription)).toEqual(
      subscription,
    );
    expect(isValidPushEndpoint(subscription.endpoint)).toBe(true);
    expect(
      parseSerializedPushSubscription({
        ...subscription,
        endpoint: "http://fcm.googleapis.com/fcm/send/opaque",
      }),
    ).toBeNull();
    expect(
      parseSerializedPushSubscription({
        ...subscription,
        endpoint: "https://user:pass@fcm.googleapis.com/fcm/send",
      }),
    ).toBeNull();
    expect(
      parseSerializedPushSubscription({
        ...subscription,
        endpoint: "https://push.example.test/send/opaque",
      }),
    ).toBeNull();
    expect(
      isValidPushEndpoint(
        "https://biblequest.notify.windows.com/?token=opaque",
      ),
    ).toBe(true);
    expect(
      isValidPushEndpoint(
        "https://notify.windows.com.attacker.example/?token=opaque",
      ),
    ).toBe(false);
    expect(
      parseSerializedPushSubscription({
        ...subscription,
        keys: { ...subscription.keys, auth: "too-short" },
      }),
    ).toBeNull();
  });

  it("maps exact delivery clocks to the legacy broad rhythm", () => {
    expect(broadRhythmForClock("08:00")).toBe("morning");
    expect(broadRhythmForClock("13:15")).toBe("afternoon");
    expect(broadRhythmForClock("20:30")).toBe("evening");
  });

  it("does not depend on the process timezone when validating IANA zones", () => {
    vi.stubEnv("TZ", "Pacific/Honolulu");
    expect(
      parsePushReminderPreferences({
        ...DEFAULT_PUSH_REMINDER_PREFERENCES,
        timezone: "Europe/Berlin",
      }),
    ).not.toBeNull();
  });
});
