"use client";

/** Native local-reminder UI; it never requires an account or remote push. */
import { useEffect, useState } from "react";
import { GentleButton } from "@/components/design-system/GentleButton";
import { useToast } from "@/components/design-system/Toast";
import { ReminderPreferenceFields } from "./ReminderPreferenceFields";
import {
  disableNativeReminders,
  enableNativeReminders,
  nativeReminderStatus,
  readNativeReminderPreferences,
  reconcileNativeReminders,
  sendNativeReminderTest,
  type NativeReminderPermission,
} from "@/lib/native/reminders";
import {
  anyPushReminderEnabled,
  broadRhythmForClock,
  DEFAULT_PUSH_REMINDER_PREFERENCES,
  parsePushReminderPreferences,
  type PushReminderPreferences,
} from "@/lib/push/validation";
import { useQuestOS } from "@/lib/questos/store";

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function NativeReminderSettings() {
  const legacy = useQuestOS((state) => state.settings.notifications);
  const updateSettings = useQuestOS((state) => state.updateSettings);
  const { toast } = useToast();
  const fallback: PushReminderPreferences = {
    ...DEFAULT_PUSH_REMINDER_PREFERENCES,
    dailyVerse: legacy.dailyVerse,
    dailyQuest: legacy.dailyQuest,
    prayerReminders: legacy.prayerReminders,
    weeklyRecap: legacy.weeklyRecap,
    deliveryTime:
      legacy.preferredTime === "afternoon"
        ? "13:00"
        : legacy.preferredTime === "evening"
          ? "19:00"
          : "08:00",
    timezone: deviceTimezone(),
  };
  const [preferences, setPreferences] = useState(() => ({
    ...readNativeReminderPreferences(fallback),
    timezone: deviceTimezone(),
  }));
  const [permission, setPermission] =
    useState<NativeReminderPermission>("prompt");
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const valid = parsePushReminderPreferences(preferences) !== null;

  useEffect(() => {
    void nativeReminderStatus()
      .then((status) => {
        setPermission(status.permission);
        setEnabled(status.enabled);
      })
      .catch(() => setPermission("denied"))
      .finally(() => setChecking(false));
  }, []);

  function mirrorLegacy(value: PushReminderPreferences) {
    updateSettings({
      notifications: {
        dailyVerse: value.dailyVerse,
        dailyQuest: value.dailyQuest,
        prayerReminders: value.prayerReminders,
        weeklyRecap: value.weeklyRecap,
        preferredTime: broadRhythmForClock(value.deliveryTime),
      },
    });
  }

  async function enable() {
    if (busy || !valid || !anyPushReminderEnabled(preferences)) return;
    setBusy(true);
    try {
      await enableNativeReminders(preferences);
      mirrorLegacy(preferences);
      setPermission("granted");
      setEnabled(true);
      toast("Gentle reminders are on.", { variant: "success" });
    } catch {
      const status = await nativeReminderStatus().catch(() => ({
        permission: "denied" as const,
        enabled: false,
      }));
      setPermission(status.permission);
      setEnabled(status.enabled);
      toast(
        status.permission === "denied"
          ? "Notifications are blocked in iOS Settings."
          : "Reminders couldn’t be enabled. Nothing was changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (busy || !valid) return;
    setBusy(true);
    try {
      await reconcileNativeReminders(preferences);
      mirrorLegacy(preferences);
      setEnabled(anyPushReminderEnabled(preferences));
      toast("Reminder choices saved.", { variant: "success" });
    } catch {
      toast("Reminder choices couldn’t be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (busy) return;
    const disabled = {
      ...preferences,
      dailyVerse: false,
      dailyQuest: false,
      prayerReminders: false,
      weeklyRecap: false,
    };
    setBusy(true);
    try {
      await disableNativeReminders(preferences);
      setPreferences(disabled);
      mirrorLegacy(disabled);
      setEnabled(false);
      toast("Reminders are off.", { variant: "success" });
    } catch {
      toast("Reminders couldn’t be disabled just now.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (busy || !enabled) return;
    setBusy(true);
    try {
      await sendNativeReminderTest();
      toast("A neutral test will arrive in a few seconds.", {
        variant: "success",
      });
    } catch {
      toast("The test reminder couldn’t be scheduled.");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return <p className="text-small text-ash">Checking reminder support…</p>;
  }

  return (
    <div>
      <p className="text-small leading-relaxed text-ash">
        Reminders stay on this iPhone and work without an account. Permission
        is requested only after you press Enable; lock-screen copy never
        includes prayer, journal, quest, or Scripture details.
      </p>
      <ReminderPreferenceFields
        preferences={preferences}
        busy={busy}
        valid={valid}
        onChange={setPreferences}
      />
      <div className="mt-4 flex flex-wrap gap-2.5">
        {!enabled ? (
          <GentleButton
            variant="primary"
            size="sm"
            disabled={
              busy || !valid || !anyPushReminderEnabled(preferences)
            }
            onClick={() => void enable()}
          >
            {busy ? "Enabling…" : "Enable gentle reminders"}
          </GentleButton>
        ) : (
          <>
            <GentleButton
              variant="primary"
              size="sm"
              disabled={busy || !valid}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save reminder choices"}
            </GentleButton>
            <GentleButton
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void test()}
            >
              Send neutral test
            </GentleButton>
            <GentleButton
              variant="text"
              size="sm"
              disabled={busy}
              onClick={() => void disable()}
            >
              Turn off reminders
            </GentleButton>
          </>
        )}
      </div>
      {permission === "denied" && (
        <p role="alert" className="mt-3 text-caption text-rose-700">
          Notifications are blocked. Re-enable them in iOS Settings; BibleQuest
          will not keep asking.
        </p>
      )}
    </div>
  );
}
