"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GentleButton } from "@/components/design-system/GentleButton";
import { useToast } from "@/components/design-system/Toast";
import {
  currentPushSubscription,
  disablePushReminders,
  enablePushReminders,
  fetchPushConfig,
  pushClientPosture,
  savePushPreferences,
  sendTestPush,
  type PushConfig,
} from "@/lib/push/client";
import {
  anyPushReminderEnabled,
  broadRhythmForClock,
  DEFAULT_PUSH_REMINDER_PREFERENCES,
  parsePushReminderPreferences,
  type PushReminderPreferences,
} from "@/lib/push/validation";
import { useQuestOS } from "@/lib/questos/store";
import { useSession } from "@/lib/supabase/useSession";

const REMINDER_OPTIONS = [
  {
    key: "dailyVerse",
    label: "Daily invitation",
    description: "One gentle invitation to open BibleQuest.",
  },
  {
    key: "dailyQuest",
    label: "Daily quest rhythm",
    description: "A neutral nudge when your chosen time arrives.",
  },
  {
    key: "prayerReminders",
    label: "Prayer rhythm",
    description: "A private, content-free invitation—never prayer text.",
  },
  {
    key: "weeklyRecap",
    label: "Weekly reflection",
    description: "One Sunday invitation to revisit your week.",
  },
] as const;

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Full opt-in reminder UI; permission is requested only in enable(). */
export function ReminderSettings() {
  const { user, configured, loading } = useSession();
  const updateSettings = useQuestOS((state) => state.updateSettings);
  const { toast } = useToast();
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [preferences, setPreferences] = useState<PushReminderPreferences>({
    ...DEFAULT_PUSH_REMINDER_PREFERENCES,
    timezone: deviceTimezone(),
  });
  const [subscription, setSubscription] =
    useState<PushSubscription | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const posture = pushClientPosture();
  const validPreferences = parsePushReminderPreferences(preferences) !== null;

  useEffect(() => {
    if (loading) return;
    if (!configured || !user) return;
    const controller = new AbortController();
    void Promise.all([
      fetchPushConfig(controller.signal),
      currentPushSubscription(),
    ])
      .then(([nextConfig, current]) => {
        if (controller.signal.aborted) return;
        const nextPreferences = nextConfig.preferencesConfigured
          ? nextConfig.preferences
          : {
              ...nextConfig.preferences,
              timezone: deviceTimezone(),
            };
        setConfig(nextConfig);
        setPreferences(nextPreferences);
        setSubscription(current);
        setUnavailable(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setUnavailable(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [configured, loading, user]);

  const mirrorLegacySettings = (value: PushReminderPreferences) => {
    updateSettings({
      notifications: {
        dailyVerse: value.dailyVerse,
        dailyQuest: value.dailyQuest,
        prayerReminders: value.prayerReminders,
        weeklyRecap: value.weeklyRecap,
        preferredTime: broadRhythmForClock(value.deliveryTime),
      },
    });
  };

  const enable = async () => {
    if (
      !config ||
      busy ||
      !validPreferences ||
      !anyPushReminderEnabled(preferences)
    ) {
      return;
    }
    setBusy(true);
    try {
      const next = await enablePushReminders(config, preferences);
      setSubscription(next);
      mirrorLegacySettings(preferences);
      toast("Gentle reminders are on.", { variant: "success" });
    } catch {
      toast(
        Notification.permission === "denied"
          ? "Notifications are blocked in browser settings."
          : "Reminders couldn’t be enabled. Nothing was changed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (busy || !validPreferences) return;
    setBusy(true);
    try {
      await savePushPreferences(preferences);
      mirrorLegacySettings(preferences);
      toast("Reminder choices saved.", { variant: "success" });
    } catch {
      toast("Reminder choices couldn’t be saved.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
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
      await disablePushReminders(subscription, disabled);
      setSubscription(null);
      setPreferences(disabled);
      mirrorLegacySettings(disabled);
      toast("Reminders are off.", { variant: "success" });
    } catch {
      toast("Reminders couldn’t be disabled just now.");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!subscription || busy) return;
    setBusy(true);
    try {
      await sendTestPush(subscription);
      toast("Test reminder sent.", { variant: "success" });
    } catch {
      toast("The test reminder couldn’t be sent. Wait a few minutes and retry.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-small text-ash">Checking reminder support…</p>;
  }
  if (!configured || !user) {
    return (
      <p className="text-small leading-relaxed text-ash">
        Reminders follow your account across devices.{" "}
        <Link href="/app/account" className="text-accent underline">
          Sign in first
        </Link>
        .
      </p>
    );
  }
  if (checking) {
    return <p className="text-small text-ash">Checking reminder support…</p>;
  }
  if (posture.iosHomeScreenRequired) {
    return (
      <p className="text-small leading-relaxed text-ash">
        On iPhone and iPad, add BibleQuest to your Home Screen, open the
        installed app, then return here to enable reminders.
      </p>
    );
  }
  if (!posture.supported) {
    return (
      <p className="text-small leading-relaxed text-ash">
        This browser does not support secure app reminders. BibleQuest still
        works fully without them.
      </p>
    );
  }
  if (unavailable || !config) {
    return (
      <p className="text-small leading-relaxed text-ash">
        Reminders are not available just now. Your existing choices remain
        unchanged.
      </p>
    );
  }

  return (
    <div>
      <p className="text-small leading-relaxed text-ash">
        Choose first. BibleQuest asks browser permission only after you press
        Enable. Lock-screen copy stays neutral and never includes prayer,
        journal, quest, or Scripture details.
      </p>
      <div className="mt-4 space-y-3">
        {REMINDER_OPTIONS.map((option) => (
          <label
            key={option.key}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius-button)] border border-mist/80 px-3.5 py-3"
          >
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-accent"
              checked={preferences[option.key]}
              disabled={busy}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  [option.key]: event.target.checked,
                }))
              }
            />
            <span>
              <span className="block text-small text-graphite">
                {option.label}
              </span>
              <span className="mt-0.5 block text-caption leading-relaxed text-ash">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-caption text-ash">
          Delivery time
          <input
            type="time"
            step={900}
            value={preferences.deliveryTime}
            disabled={busy}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                deliveryTime: event.target.value,
              }))
            }
            className="mt-1 block min-h-11 w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3 text-small text-graphite"
          />
        </label>
        <label className="text-caption text-ash">
          Quiet hours start
          <input
            type="time"
            step={900}
            value={preferences.quietHoursStart}
            disabled={busy}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                quietHoursStart: event.target.value,
              }))
            }
            className="mt-1 block min-h-11 w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3 text-small text-graphite"
          />
        </label>
        <label className="text-caption text-ash">
          Quiet hours end
          <input
            type="time"
            step={900}
            value={preferences.quietHoursEnd}
            disabled={busy}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                quietHoursEnd: event.target.value,
              }))
            }
            className="mt-1 block min-h-11 w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3 text-small text-graphite"
          />
        </label>
      </div>
      <p className="mt-2 text-caption text-ash">
        Time zone: {preferences.timezone}. Choices inside quiet hours move to
        quiet-hours end.
      </p>
      {!validPreferences && (
        <p role="alert" className="mt-2 text-caption text-rose-700">
          Choose valid 15-minute times, with different quiet-hours start and
          end.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2.5">
        {!subscription ? (
          <GentleButton
            variant="primary"
            size="sm"
            disabled={
              busy ||
              !validPreferences ||
              !anyPushReminderEnabled(preferences)
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
              disabled={
                busy ||
                !validPreferences ||
                !anyPushReminderEnabled(preferences)
              }
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
      {typeof Notification !== "undefined" &&
        Notification.permission === "denied" && (
          <p role="alert" className="mt-3 text-caption text-rose-700">
            Notifications are blocked. Re-enable them in browser or system
            settings; BibleQuest will not keep asking.
          </p>
        )}
    </div>
  );
}
