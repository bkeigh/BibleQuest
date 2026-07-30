"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePlus } from "@/lib/billing/usePlus";
import { GREEN_FEATURES } from "@/lib/features/green";
import {
  FREE_RHYTHM_BLOCK_LIMIT,
  PLUS_RHYTHM_BLOCK_LIMIT,
  RHYTHM_DAY_LABELS,
  RHYTHM_DAYS,
  RHYTHM_PRACTICE_LABELS,
  RHYTHM_PRACTICES,
  type RhythmBlock,
  type RhythmDay,
  type RhythmPractice,
} from "@/lib/rhythm/types";
import {
  removeRhythmBlock,
  saveRhythmBlock,
  useRhythmState,
} from "@/lib/rhythm/client";
import { useToast } from "@/components/design-system/Toast";
import { GentleButton } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { PlusFeatureDialog } from "@/components/plus/PlusFeatureDialog";
import { track } from "@/lib/analytics/events";

const DEFAULT_DAYS: RhythmDay[] = [1, 2, 3, 4, 5];

/** Creates an opaque local identifier without sending schedule details away. */
function rhythmId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `rhythm_${crypto.randomUUID().replaceAll("-", "")}`;
  }
  return `rhythm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** Builds one valid first draft that remains private to the current device. */
function newBlock(): RhythmBlock {
  const now = new Date().toISOString();
  const defaultPractices: RhythmPractice[] = [
    "quest",
    ...(GREEN_FEATURES.guidedScripture ? (["guided_scripture"] as const) : []),
  ];
  return {
    id: rhythmId(),
    label: "My daily rhythm",
    time: "08:00",
    days: DEFAULT_DAYS,
    practices: defaultPractices,
    fallbackPractice: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** One editable rhythm card; all fields save together through strict validation. */
function RhythmEditor({
  initial,
  isPlus,
  onDone,
}: {
  initial: RhythmBlock;
  isPlus: boolean;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(initial);
  const practiceAvailable = (practice: RhythmPractice) =>
    practice === "guided_scripture"
      ? GREEN_FEATURES.guidedScripture
      : practice === "today_game"
        ? GREEN_FEATURES.games
        : true;

  const toggleDay = (day: RhythmDay) => {
    setDraft((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((entry) => entry !== day)
        : [...current.days, day].sort((left, right) => left - right),
    }));
  };

  const togglePractice = (practice: RhythmPractice) => {
    setDraft((current) => ({
      ...current,
      practices: current.practices.includes(practice)
        ? current.practices.filter((entry) => entry !== practice)
        : [...current.practices, practice],
      fallbackPractice:
        current.fallbackPractice === practice
          ? null
          : current.fallbackPractice,
    }));
  };

  const save = () => {
    if (!draft.label.trim() || draft.days.length === 0) {
      toast("Choose a name and at least one day.");
      return;
    }
    const availablePractices = draft.practices.filter(practiceAvailable);
    if (availablePractices.length === 0) {
      toast("Choose at least one gentle practice.");
      return;
    }
    const saved = saveRhythmBlock(
      {
        ...draft,
        label: draft.label.trim(),
        practices: availablePractices,
        fallbackPractice:
          isPlus
            ? draft.fallbackPractice &&
              practiceAvailable(draft.fallbackPractice)
              ? draft.fallbackPractice
              : null
            : initial.fallbackPractice,
        updatedAt: new Date().toISOString(),
      },
      isPlus,
    );
    if (!saved) {
      toast("This rhythm could not be saved. Nothing changed.");
      return;
    }
    toast("Rhythm saved.", { variant: "success" });
    track("rhythm_saved");
    onDone();
  };

  return (
    <PaperCard variant="paper" padding="md">
      <label className="block text-caption text-ash">
        Rhythm name
        <input
          value={draft.label}
          maxLength={40}
          onChange={(event) =>
            setDraft((current) => ({ ...current, label: event.target.value }))
          }
          className="mt-1 min-h-11 w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3 text-body text-graphite"
        />
      </label>

      <label className="mt-4 block text-caption text-ash">
        Gentle start time
        <input
          type="time"
          step={900}
          value={draft.time}
          onChange={(event) =>
            setDraft((current) => ({ ...current, time: event.target.value }))
          }
          className="mt-1 min-h-11 w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3 text-body text-graphite"
        />
      </label>

      <fieldset className="mt-4">
        <legend className="text-caption text-ash">Days</legend>
        <div className="mt-2 grid grid-cols-7 gap-1.5">
          {RHYTHM_DAYS.map((day) => {
            const selected = draft.days.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleDay(day)}
                className={`min-h-11 rounded-[var(--radius-button)] border px-1 text-caption ${
                  selected
                    ? "border-accent bg-accent text-paper"
                    : "border-mist bg-linen text-charcoal"
                }`}
              >
                {RHYTHM_DAY_LABELS[day]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-caption text-ash">Practices</legend>
        <div className="mt-2 space-y-2">
          {RHYTHM_PRACTICES.map((practice) => (
            <label
              key={practice}
              className="flex min-h-11 items-center gap-3 rounded-[var(--radius-button)] border border-mist px-3 py-2 has-disabled:opacity-55"
            >
              <input
                type="checkbox"
                checked={draft.practices.includes(practice)}
                disabled={!practiceAvailable(practice)}
                onChange={() => togglePractice(practice)}
                className="h-4 w-4 accent-accent"
              />
              <span className="text-small text-graphite">
                {RHYTHM_PRACTICE_LABELS[practice]}
                {!practiceAvailable(practice) && " · unavailable"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 block text-caption text-ash">
        Busy-day alternative{" "}
        <span className="text-gilt">{isPlus ? "Plus" : "Plus preview"}</span>
        <select
          value={draft.fallbackPractice ?? ""}
          disabled={!isPlus}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              fallbackPractice:
                (event.target.value as RhythmPractice) || null,
            }))
          }
          className="mt-1 min-h-11 w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3 text-body text-graphite disabled:opacity-55"
        >
          <option value="">No alternative</option>
          {RHYTHM_PRACTICES.filter(
            (practice) =>
              practiceAvailable(practice) &&
              !draft.practices.includes(practice),
          ).map((practice) => (
              <option key={practice} value={practice}>
                {RHYTHM_PRACTICE_LABELS[practice]}
              </option>
            ))}
        </select>
      </label>
      {!isPlus && (
        <p className="mt-2 text-caption leading-relaxed text-ash">
          Plus can keep multiple rhythms and offer one lighter practice when
          the day changes.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2.5">
        <GentleButton variant="primary" size="sm" onClick={save}>
          Save rhythm
        </GentleButton>
        <GentleButton variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </GentleButton>
      </div>
    </PaperCard>
  );
}

/** Keeps one rhythm available and lets Plus members keep several. */
export function RhythmBuilder() {
  const plus = usePlus();
  const state = useRhythmState();
  const { toast } = useToast();
  const [editing, setEditing] = useState<RhythmBlock | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [plusDialogOpen, setPlusDialogOpen] = useState(false);
  const limit = plus.isPlus
    ? PLUS_RHYTHM_BLOCK_LIMIT
    : FREE_RHYTHM_BLOCK_LIMIT;
  const ordered = useMemo(
    () =>
      [...state.blocks].sort(
        (left, right) =>
          left.time.localeCompare(right.time) ||
          left.label.localeCompare(right.label),
      ),
    [state.blocks],
  );
  const freeActiveIds = useMemo(
    () =>
      new Set(
        [...state.blocks]
          .sort(
            (left, right) =>
              left.createdAt.localeCompare(right.createdAt) ||
              left.id.localeCompare(right.id),
          )
          .slice(0, FREE_RHYTHM_BLOCK_LIMIT)
          .map((block) => block.id),
      ),
    [state.blocks],
  );

  if (!GREEN_FEATURES.rhythmBuilder) {
    return (
      <p className="text-small leading-relaxed text-ash">
        Rhythm Builder is resting while this preview is disabled.
      </p>
    );
  }

  // Wait for the authoritative entitlement before exposing plan-bound edits.
  if (plus.loading) {
    return (
      <PaperCard variant="quiet" padding="md" aria-busy="true">
        <p className="text-small text-ash">Checking rhythm access…</p>
      </PaperCard>
    );
  }

  if (editing) {
    return (
      <RhythmEditor
        initial={editing}
        isPlus={plus.isPlus}
        onDone={() => setEditing(null)}
      />
    );
  }

  return (
    <div>
      <p className="text-small leading-relaxed text-ash">
        Choose when and how you want to return. Missing a day changes nothing;
        your rhythm waits without judgment.
      </p>

      <div className="mt-4 space-y-3">
        {ordered.map((block) => {
          const pausedByPlan = !plus.isPlus && !freeActiveIds.has(block.id);
          return (
            <PaperCard key={block.id} variant="quiet" padding="md">
              <div className="flex items-start gap-3">
                <PixelIcon name="lantern" size={4} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-[1.125rem] text-graphite">
                    {block.label}
                  </h2>
                  {pausedByPlan && (
                    <p className="mt-1 text-caption font-medium text-gilt">
                      Paused Plus rhythm
                    </p>
                  )}
                  <p className="mt-1 text-caption text-ash">
                    {block.time} ·{" "}
                    {block.days.map((day) => RHYTHM_DAY_LABELS[day]).join(", ")}
                  </p>
                  <p className="mt-2 text-small leading-relaxed text-charcoal">
                    {block.practices
                      .map((practice) => RHYTHM_PRACTICE_LABELS[practice])
                      .join(" · ")}
                  </p>
                  {block.fallbackPractice && (
                    <p className="mt-1 text-caption text-ash">
                      Busy day:{" "}
                      {RHYTHM_PRACTICE_LABELS[block.fallbackPractice]}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <GentleButton
                  variant="outline"
                  size="sm"
                  disabled={pausedByPlan}
                  onClick={() => setEditing(block)}
                >
                  Edit
                </GentleButton>
                <GentleButton
                  variant="ghost"
                  size="sm"
                  aria-expanded={removingId === block.id}
                  aria-controls={
                    removingId === block.id
                      ? `remove-${block.id}`
                      : undefined
                  }
                  onClick={() =>
                    setRemovingId((current) =>
                      current === block.id ? null : block.id,
                    )
                  }
                >
                  {removingId === block.id ? "Cancel removal" : "Remove"}
                </GentleButton>
              </div>
              {removingId === block.id && (
                <div
                  id={`remove-${block.id}`}
                  role="group"
                  aria-label={`Confirm removal of ${block.label}`}
                  className="mt-3 rounded-[var(--radius-button)] border border-rose-300/60 bg-rose-50/60 p-3"
                >
                  <p className="text-small text-charcoal">
                    Remove this rhythm from this device?
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <GentleButton
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        if (removeRhythmBlock(block.id)) {
                          setRemovingId(null);
                          toast("Rhythm removed.", { variant: "success" });
                        } else {
                          toast("Rhythm could not be removed.");
                        }
                      }}
                    >
                      Remove rhythm
                    </GentleButton>
                    <GentleButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemovingId(null)}
                    >
                      Keep it
                    </GentleButton>
                  </div>
                </div>
              )}
            </PaperCard>
          );
        })}
      </div>

      {state.blocks.length < limit ? (
        <GentleButton
          variant="primary"
          size="sm"
          className="mt-4"
          onClick={() => setEditing(newBlock())}
        >
          {state.blocks.length === 0 ? "Create my rhythm" : "Add another rhythm"}
        </GentleButton>
      ) : !plus.isPlus ? (
        <div className="mt-4 rounded-[var(--radius-card)] border border-gold-500/35 bg-gold-500/10 p-3.5">
          <p className="text-small leading-relaxed text-charcoal">
            One rhythm is included. Plus can hold morning, evening, and busy-day
            rhythms.
          </p>
          <GentleButton
            variant="text"
            size="sm"
            className="mt-2"
            onClick={() => setPlusDialogOpen(true)}
          >
            Add another rhythm · Plus
          </GentleButton>
        </div>
      ) : (
        <p className="mt-4 text-caption text-ash">
          Three rhythms keep the day clear without becoming another checklist.
        </p>
      )}

      <p className="mt-4 text-caption leading-relaxed text-ash">
        Rhythm choices stay on this device. Enable neutral lock-screen
        invitations separately in{" "}
        <Link href="/app/settings" className="text-accent underline">
          Reminder settings
        </Link>
        .
      </p>
      <PlusFeatureDialog
        open={plusDialogOpen}
        onClose={() => setPlusDialogOpen(false)}
        title="Add another rhythm"
        description="Multiple daily rhythms and a busy-day alternative are included with BibleQuest Plus."
      />
    </div>
  );
}
