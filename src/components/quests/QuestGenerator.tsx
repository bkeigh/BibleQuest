"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { seedQuests } from "@/data/seed/quests";
import {
  createReviewedQuestProvider,
  QUEST_GENERATION_FOCUSES,
  type QuestGenerationFocus,
  type QuestGenerationResult,
} from "@/lib/quest-generation/provider";
import {
  QUEST_CATEGORIES,
  type QuestCategory,
  type QuestDuration,
  type QuestTemplate,
} from "@/lib/questos/types";
import { activeQuestAssignments } from "@/lib/questos/quest-engine";
import { selectMyQuests, useQuestOS } from "@/lib/questos/store";
import { toDateKey } from "@/lib/utils/dates";
import { GentleButton } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import { QuestSlip, CATEGORY_LABEL, formatDuration } from "./QuestSlip";
import { IconPlus } from "@/components/design-system/icons";
import { apiFetch } from "@/lib/platform/api";

const DURATIONS: QuestDuration[] = [5, 10, 15, 30, 60, 240, 480];
const provider = createReviewedQuestProvider(seedQuests);

export function QuestGenerator({
  isPlus,
  onAdd,
}: {
  isPlus: boolean;
  onAdd: (quest: QuestTemplate) => void;
}) {
  const [category, setCategory] = useState<QuestCategory | "">("");
  const [duration, setDuration] = useState<QuestDuration | "">("");
  const [focus, setFocus] = useState<QuestGenerationFocus | "">("");
  const [result, setResult] = useState<QuestGenerationResult | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const variation = useRef(0);
  const assignments = useQuestOS((state) => state.assignments);
  const completions = useQuestOS((state) => state.completions);
  const myQuests = useQuestOS(selectMyQuests);

  if (!isPlus) {
    return (
      <PaperCard variant="quiet" padding="md">
        <p className="font-display text-[1.125rem] text-graphite">
          Generate a reviewed quest
        </p>
        <p className="mt-1 text-small leading-relaxed text-ash">
          BibleQuest Plus can build a recommendation around your time and
          focus. It stays on this device and uses the human-reviewed catalog.
        </p>
        <Link
          href="/app/plus"
          className="mt-3 inline-flex min-h-11 items-center text-small font-medium text-accent hover:underline"
        >
          Explore BibleQuest Plus
        </Link>
      </PaperCard>
    );
  }

  async function generate() {
    setWorking(true);
    setError(null);
    variation.current += 1;
    const request = {
      category: category || undefined,
      duration: duration || undefined,
      focus: focus || undefined,
      variation: variation.current,
    };
    try {
      const response = await apiFetch("/api/ai/quest", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error("provider");
      const next = (await response.json()) as QuestGenerationResult;
      setResult(next);
    } catch {
      // The reviewed local matcher preserves the feature when AI is unavailable.
      const next = await provider.generate(request);
      setResult(next);
      setError("Haiku is resting, so BibleQuest used its reviewed on-device matcher.");
    } finally {
      setWorking(false);
    }
  }

  function resetGeneratedResult() {
    variation.current = 0;
    setResult(null);
    setError(null);
  }

  const selectClass =
    "min-h-11 w-full rounded-[var(--radius-button)] border border-mist bg-paper px-3 py-2.5 text-small text-charcoal outline-none focus:border-accent/50";
  const resultAssignment = result
    ? activeQuestAssignments(assignments).find(
        (item) => item.questSlug === result.quest.slug
      )
    : undefined;
  const resultCompleted = Boolean(
    result &&
      (resultAssignment?.status === "completed" ||
        completions.some(
          (item) =>
            item.questSlug === result.quest.slug && item.dateKey === toDateKey()
        ))
  );
  const resultPicked = Boolean(resultAssignment) && !resultCompleted;
  const resultShelfStatus = result ? myQuests[result.quest.slug]?.status : undefined;
  const resultSaved =
    !resultPicked &&
    !resultCompleted &&
    (resultShelfStatus === "saved" || resultShelfStatus === "paused");

  return (
    <PaperCard variant="quiet" padding="md">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-caption text-ash">
          Focus
          <select
            value={focus}
            onChange={(event) => {
              setFocus(event.target.value as QuestGenerationFocus | "");
              resetGeneratedResult();
            }}
            className={`${selectClass} mt-1`}
          >
            <option value="">Surprise me</option>
            {QUEST_GENERATION_FOCUSES.map((value) => (
              <option key={value} value={value} className="capitalize">
                {value[0].toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-caption text-ash">
          Category
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value as QuestCategory | "");
              resetGeneratedResult();
            }}
            className={`${selectClass} mt-1`}
          >
            <option value="">Any category</option>
            {QUEST_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-caption text-ash">
          Time
          <select
            value={duration}
            onChange={(event) => {
              setDuration(
                event.target.value
                  ? (Number(event.target.value) as QuestDuration)
                  : ""
              );
              resetGeneratedResult();
            }}
            className={`${selectClass} mt-1`}
          >
            <option value="">Any length</option>
            {DURATIONS.map((value) => (
              <option key={value} value={value}>
                {formatDuration(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <GentleButton
        type="button"
        variant="primary"
        fullWidth
        className="mt-4"
        disabled={working}
        onClick={generate}
        aria-busy={working}
      >
        {working ? "Building…" : result ? "Generate another" : "Generate quest"}
      </GentleButton>

      {error && (
        <p role="alert" className="mt-3 text-caption leading-relaxed text-rose-700">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-4">
          <QuestSlip
            quest={result.quest}
            href={`/app/quests/${result.quest.slug}`}
            compact
            picked={resultPicked}
            completed={resultCompleted}
            saved={resultSaved}
            action={
              !resultPicked && !resultCompleted ? (
                <button
                  type="button"
                  onClick={() => onAdd(result.quest)}
                  aria-label={`Add ${result.quest.title} to Ready`}
                  title="Add to Ready"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-accent/50 bg-paper text-accent transition-colors hover:bg-accent-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <IconPlus size={17} />
                </button>
              ) : undefined
            }
          />
          <p role="status" className="mt-2 text-caption text-ash">
            {result.notice}
          </p>
          {result.reason && (
            <p className="mt-2 text-small leading-relaxed text-charcoal">
              <span className="font-medium">Why this match: </span>
              {result.reason}
            </p>
          )}
        </div>
      )}
    </PaperCard>
  );
}
