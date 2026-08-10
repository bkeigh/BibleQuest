"use client";

/** Shared reminder choices; web push and iOS local scheduling use one form. */
import type { PushReminderPreferences } from "@/lib/push/validation";

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

export function ReminderPreferenceFields({
  preferences,
  busy,
  valid,
  onChange,
}: {
  preferences: PushReminderPreferences;
  busy: boolean;
  valid: boolean;
  onChange: (preferences: PushReminderPreferences) => void;
}) {
  return (
    <>
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
                onChange({
                  ...preferences,
                  [option.key]: event.target.checked,
                })
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
        <ClockField
          label="Delivery time"
          value={preferences.deliveryTime}
          busy={busy}
          onChange={(deliveryTime) => onChange({ ...preferences, deliveryTime })}
        />
        <ClockField
          label="Quiet hours start"
          value={preferences.quietHoursStart}
          busy={busy}
          onChange={(quietHoursStart) =>
            onChange({ ...preferences, quietHoursStart })
          }
        />
        <ClockField
          label="Quiet hours end"
          value={preferences.quietHoursEnd}
          busy={busy}
          onChange={(quietHoursEnd) =>
            onChange({ ...preferences, quietHoursEnd })
          }
        />
      </div>
      <p className="mt-2 text-caption text-ash">
        Time zone: {preferences.timezone}. Choices inside quiet hours move to
        quiet-hours end.
      </p>
      {!valid && (
        <p role="alert" className="mt-2 text-caption text-rose-700">
          Choose valid 15-minute times, with different quiet-hours start and
          end.
        </p>
      )}
    </>
  );
}

function ClockField({
  label,
  value,
  busy,
  onChange,
}: {
  label: string;
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-caption text-ash">
      {label}
      <input
        type="time"
        step={900}
        value={value}
        disabled={busy}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block min-h-11 w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3 text-small text-graphite"
      />
    </label>
  );
}
