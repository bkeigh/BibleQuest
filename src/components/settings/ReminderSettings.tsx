"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GentleButton } from "@/components/design-system/GentleButton";
import { useToast } from "@/components/design-system/Toast";
import {
  currentPushSubscription,
  currentNotificationPermission,
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
import { ACCOUNT_SYNC_CONTAINED } from "@/lib/sync/containment";
import { isNativeTarget } from "@/lib/platform/target";
import { NativeReminderSettings } from "./NativeReminderSettings";
import { ReminderPreferenceFields } from "./ReminderPreferenceFields";

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Selects local iOS reminders or account-bound web push without overlap. */
export function ReminderSettings() {
  return isNativeTarget() ? (
    <NativeReminderSettings />
  ) : (
    <WebReminderSettings />
  );
}

/** Remounts account-bound reminder state whenever the session subject changes. */
function WebReminderSettings() {
  const { user, configured, loading } = useSession();
  return (
    <SubjectBoundWebReminderSettings
      key={loading ? "loading" : user?.id ?? "guest"}
      userId={user?.id ?? null}
      configured={configured}
      loading={loading}
    />
  );
}

/** Full web-push UI; permission is requested only in enable(). */
function SubjectBoundWebReminderSettings({
  userId,
  configured,
  loading,
}: {
  userId: string | null;
  configured: boolean;
  loading: boolean;
}) {
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
    if (!configured || !userId) return;
    const controller = new AbortController();
    void Promise.all([
      fetchPushConfig(userId, controller.signal),
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
  }, [configured, loading, userId]);

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
    if (!userId) return;
    setBusy(true);
    try {
      const next = await enablePushReminders(userId, config, preferences);
      setSubscription(next);
      mirrorLegacySettings(preferences);
      toast("Gentle reminders are on.", { variant: "success" });
    } catch {
      toast(
        currentNotificationPermission() === "denied"
          ? "Notifications are blocked in browser settings."
          : "Reminders couldn’t be enabled. Nothing was changed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (busy || !validPreferences || !userId) return;
    setBusy(true);
    try {
      await savePushPreferences(userId, preferences);
      mirrorLegacySettings(preferences);
      toast("Reminder choices saved.", { variant: "success" });
    } catch {
      toast("Reminder choices couldn’t be saved.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (busy || !userId) return;
    const disabled = {
      ...preferences,
      dailyVerse: false,
      dailyQuest: false,
      prayerReminders: false,
      weeklyRecap: false,
    };
    setBusy(true);
    try {
      await disablePushReminders(userId, subscription, disabled);
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
    if (!subscription || busy || !userId) return;
    setBusy(true);
    try {
      await sendTestPush(userId, subscription);
      toast("Test reminder sent.", { variant: "success" });
    } catch {
      toast("The test reminder couldn’t be sent. Wait a few minutes and retry.");
    } finally {
      setBusy(false);
    }
  };

  // Push reminders are account-bound. Do not advertise sign-in while the
  // release is intentionally guest-only.
  if (ACCOUNT_SYNC_CONTAINED) {
    return (
      <p className="text-small leading-relaxed text-ash">
        Reminders are not included in this release. BibleQuest works fully
        without notifications.
      </p>
    );
  }
  if (loading) {
    return <p className="text-small text-ash">Checking reminder support…</p>;
  }
  if (!configured || !userId) {
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
      <ReminderPreferenceFields
        preferences={preferences}
        busy={busy}
        valid={validPreferences}
        onChange={setPreferences}
      />

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
      {currentNotificationPermission() === "denied" && (
        <p role="alert" className="mt-3 text-caption text-rose-700">
          Notifications are blocked. Re-enable them in browser or system
          settings; BibleQuest will not keep asking.
        </p>
      )}
    </div>
  );
}
