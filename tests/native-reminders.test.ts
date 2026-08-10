import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PushReminderPreferences } from "@/lib/push/validation";

const mocks = vi.hoisted(() => ({
  addListener: vi.fn(),
  cancel: vi.fn(),
  checkPermissions: vi.fn(),
  getDeliveredNotifications: vi.fn(),
  getPending: vi.fn(),
  removeDeliveredNotifications: vi.fn(),
  requestPermissions: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: mocks,
}));

import {
  effectiveReminderDelivery,
  enableNativeReminders,
  listenForNativeReminderOpen,
  nativeReminderPlan,
  purgeNativeReminders,
  readNativeReminderPreferences,
  reconcileNativeReminders,
} from "@/lib/native/reminders";

const PREFERENCES: PushReminderPreferences = {
  dailyVerse: true,
  dailyQuest: true,
  prayerReminders: true,
  weeklyRecap: true,
  deliveryTime: "08:00",
  timezone: "America/New_York",
  quietHoursStart: "21:00",
  quietHoursEnd: "07:00",
};

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_PLATFORM", "native");
  const storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage });
  mocks.cancel.mockResolvedValue(undefined);
  mocks.schedule.mockResolvedValue({ notifications: [] });
  mocks.getDeliveredNotifications.mockResolvedValue({ notifications: [] });
  mocks.getPending.mockResolvedValue({ notifications: [] });
  mocks.removeDeliveredNotifications.mockResolvedValue(undefined);
  mocks.checkPermissions.mockResolvedValue({ display: "granted" });
  mocks.requestPermissions.mockResolvedValue({ display: "granted" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("native reminder plan", () => {
  it("moves clocks inside overnight and daytime quiet windows", () => {
    expect(effectiveReminderDelivery("22:00", "21:00", "07:00")).toEqual({
      time: "07:00",
      dayOffset: 1,
    });
    expect(effectiveReminderDelivery("06:45", "21:00", "07:00")).toEqual({
      time: "07:00",
      dayOffset: 0,
    });
    expect(effectiveReminderDelivery("12:00", "09:00", "17:00")).toEqual({
      time: "17:00",
      dayOffset: 0,
    });
    expect(effectiveReminderDelivery("08:00", "21:00", "07:00")).toEqual({
      time: "08:00",
      dayOffset: 0,
    });
  });

  it("collapses daily choices into one alert and keeps Sunday separate", () => {
    const plan = nativeReminderPlan(PREFERENCES);

    expect(plan).toHaveLength(2);
    expect(plan[0].schedule.on).toEqual({ hour: 8, minute: 0 });
    expect(plan[1].schedule.on).toEqual({ weekday: 1, hour: 8, minute: 0 });
    expect(new Set(plan.map((item) => item.id)).size).toBe(2);
  });

  it("rolls a late-Sunday weekly reminder into Monday after quiet hours", () => {
    const plan = nativeReminderPlan({ ...PREFERENCES, deliveryTime: "22:00" });

    expect(plan[1].schedule.on).toEqual({ weekday: 2, hour: 7, minute: 0 });
  });

  it("keeps an early-Sunday weekly reminder on Sunday after quiet hours", () => {
    const plan = nativeReminderPlan({ ...PREFERENCES, deliveryTime: "06:45" });

    expect(plan[1].schedule.on).toEqual({ weekday: 1, hour: 7, minute: 0 });
  });

  it("uses only neutral copy and one allowlisted destination", () => {
    const plan = nativeReminderPlan(PREFERENCES);
    const bodies = plan.map((item) => item.body).join(" ");

    expect(bodies).not.toMatch(/prayer|journal|quest|scripture/i);
    expect(plan.every((item) => item.extra.path === "/app")).toBe(true);
  });

  it("falls back cleanly when stored preferences are corrupt", () => {
    localStorage.setItem("biblequest:native-reminders:v1", "{bad json");

    expect(readNativeReminderPreferences(PREFERENCES)).toEqual(PREFERENCES);
  });
});

describe("native reminder orchestration", () => {
  it("requests permission only from an explicit enable operation", async () => {
    mocks.checkPermissions.mockResolvedValueOnce({ display: "prompt" });

    await enableNativeReminders(PREFERENCES);

    expect(mocks.requestPermissions).toHaveBeenCalledOnce();
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(mocks.schedule).toHaveBeenCalledOnce();
  });

  it("does not keep asking after iOS has denied permission", async () => {
    mocks.checkPermissions.mockResolvedValueOnce({ display: "denied" });

    await expect(enableNativeReminders(PREFERENCES)).rejects.toThrow(
      "permission",
    );
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("reconciles only the three BibleQuest-owned notification IDs", async () => {
    await reconcileNativeReminders(PREFERENCES);

    const ids = mocks.cancel.mock.calls[0][0].notifications.map(
      ({ id }: { id: number }) => id,
    );
    expect(ids).toEqual([271_001, 271_002, 271_099]);
  });

  it("purges owned pending and delivered reminders with their preferences", async () => {
    localStorage.setItem(
      "biblequest:native-reminders:v1",
      JSON.stringify(PREFERENCES),
    );
    mocks.getDeliveredNotifications.mockResolvedValueOnce({
      notifications: [
        { id: 271_001, title: "BibleQuest" },
        { id: 88, title: "Other feature" },
      ],
    });

    await purgeNativeReminders();

    expect(mocks.cancel).toHaveBeenCalledWith({
      notifications: [{ id: 271_001 }, { id: 271_002 }, { id: 271_099 }],
    });
    expect(mocks.removeDeliveredNotifications).toHaveBeenCalledWith({
      notifications: [{ id: 271_001, title: "BibleQuest" }],
    });
    expect(localStorage.getItem("biblequest:native-reminders:v1")).toBeNull();
  });

  it("still removes local preferences when native notification cleanup fails", async () => {
    localStorage.setItem(
      "biblequest:native-reminders:v1",
      JSON.stringify(PREFERENCES),
    );
    mocks.cancel.mockRejectedValueOnce(new Error("native unavailable"));

    await expect(purgeNativeReminders()).rejects.toThrow("fully purged");

    expect(mocks.getDeliveredNotifications).toHaveBeenCalledOnce();
    expect(localStorage.getItem("biblequest:native-reminders:v1")).toBeNull();
  });

  it("opens home only for an owned notification with the exact path", async () => {
    let listener: ((event: unknown) => void) | undefined;
    const remove = vi.fn().mockResolvedValue(undefined);
    mocks.addListener.mockImplementation(async (_name, callback) => {
      listener = callback;
      return { remove };
    });
    const onOpen = vi.fn();
    const unsubscribe = await listenForNativeReminderOpen(onOpen);

    listener?.({ notification: { id: 9, extra: { path: "/app" } } });
    listener?.({
      notification: { id: 271_001, extra: { path: "/app/settings" } },
    });
    listener?.({ notification: { id: 271_001, extra: { path: "/app" } } });

    expect(onOpen).toHaveBeenCalledOnce();
    await unsubscribe();
    expect(remove).toHaveBeenCalledOnce();
  });
});
