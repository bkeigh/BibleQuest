"use client";

/**
 * Full quest workflow for a single seed quest. It translates the saved/daily
 * quest lifecycle into clear actions, tracks the four walk steps, and routes
 * completion reflections back through the QuestOS store.
 */
import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type {
  GrowthType,
  QuestStepKey,
  QuestTemplate,
  ReflectionMood,
} from "@/lib/questos/types";
import {
  useQuestOS,
  selectMyQuests,
} from "@/lib/questos/store";
import {
  activeQuestAssignments,
  formatQuestWindowRemaining,
  nextQuestSlotAt,
} from "@/lib/questos/quest-engine";
import {
  QUEST_STEP_KEYS,
  checklistItemsForQuest,
  hasBegun,
  isQuestChecklistComplete,
} from "@/lib/questos/quest-steps";
import { useToast } from "@/components/design-system/Toast";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import {
  PixelIcon,
  CATEGORY_SPRITE,
  type PixelSpriteName,
} from "@/components/design-system/PixelIcon";
import {
  IconArrowLeft,
  IconClock,
  IconCheck,
  IconPlus,
} from "@/components/design-system/icons";
import { MoodPicker } from "@/components/reflection/MoodPicker";
import { formatDuration, CATEGORY_LABEL } from "@/components/quests/QuestSlip";
import { completionLine } from "@/lib/questos/copy";
import { useStrings } from "@/lib/i18n";
import { gentleEase, celebrationScale, pixelSparkle } from "@/lib/motion";
import { cleanVerseText } from "@/lib/utils/scripture";
import { hashString } from "@/lib/utils/dates";
import { track } from "@/lib/analytics/events";
import { usePlus } from "@/lib/revenuecat/usePlus";

type Phase = "detail" | "reflect" | "done";

/** Star positions for the small done-moment flourish. */
const SPARKLES = ["-right-2 -top-1", "-left-3 bottom-2", "right-1 -bottom-2"];

/** Quest completion mirrors the exact facet the action tended in Journey. */
const GROWTH_COMPLETION: Record<
  GrowthType,
  { sprite: PixelSpriteName; line: string }
> = {
  roots: { sprite: "praying-hands", line: "You tended the roots." },
  branches: { sprite: "open-book", line: "You strengthened the branches." },
  leaves: { sprite: "leaf", line: "You grew new leaves." },
  fruit: { sprite: "service-basket", line: "You helped the tree bear fruit." },
  sunlight: { sprite: "sun", line: "You brought the tree sunlight." },
  flowers: { sprite: "flower", line: "You helped the tree flower." },
};

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.75rem] uppercase tracking-wide text-ash">{label}</dt>
      <dd className="mt-0.5 text-small capitalize text-charcoal">{value}</dd>
    </div>
  );
}

function QuestDetailInner({ quest }: { quest: QuestTemplate }) {
  const { toast } = useToast();
  const router = useRouter();
  const t = useStrings();
  const completeQuestBySlug = useQuestOS((s) => s.completeQuestBySlug);
  const pickQuest = useQuestOS((s) => s.pickQuest);
  const startQuest = useQuestOS((s) => s.startQuest);
  const saveQuestForLater = useQuestOS((s) => s.saveQuestForLater);
  const markQuestStep = useQuestOS((s) => s.markQuestStep);
  const assignments = useQuestOS((s) => s.assignments);
  const myQuests = useQuestOS(selectMyQuests);
  const { isPlus } = usePlus();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const picks = useMemo(
    () => activeQuestAssignments(assignments, now),
    [assignments, now]
  );

  const [phase, setPhase] = useState<Phase>("detail");
  const [reflection, setReflection] = useState("");
  const [mood, setMood] = useState<ReflectionMood | undefined>();
  const reflectionFieldId = useId();
  const completionHelpId = useId();

  const todayPick = picks.find((a) => a.questSlug === quest.slug);
  const entry = myQuests[quest.slug];
  // Mid-walk from another day (or paused): the shelf remembers.
  const walking =
    entry &&
    (entry.status === "active" || entry.status === "paused") &&
    hasBegun(entry);
  const completedInWindow = todayPick?.status === "completed";
  const nextSlot = nextQuestSlotAt(assignments, isPlus, now);
  const checklistItems = checklistItemsForQuest(quest);
  const genericStepLabels: Record<QuestStepKey, string> = {
    scripture: t.myQuests.stepScripture,
    live: t.myQuests.stepLive,
    reflect: t.myQuests.stepReflect,
    pray: t.myQuests.stepPray,
  };
  const displayedSteps =
    checklistItems.length > 0
      ? checklistItems
      : QUEST_STEP_KEYS.map((key) => ({
          key,
          label: genericStepLabels[key],
        }));
  const hasRequiredChecklist = checklistItems.length > 0;
  const checklistComplete = isQuestChecklistComplete(quest, entry);
  const checklistRemaining = checklistItems.filter(
    (item) => !entry?.stepsDone.includes(item.key)
  ).length;
  const inProgress = todayPick?.status === "started" || Boolean(walking);

  useEffect(() => {
    track("quest_viewed", { category: quest.category });
  }, [quest.slug, quest.category]);

  useEffect(() => {
    if (phase === "reflect") track("reflection_started", { source: "quest" });
  }, [phase]);

  function addToToday() {
    if (pickQuest(quest.slug, isPlus)) {
      toast(t.quests.added, { variant: "success" });
    } else {
      toast(
        nextSlot
          ? `Your next slot opens in ${formatQuestWindowRemaining(nextSlot, now).replace(" left", "")}.`
          : t.quests.capReached
      );
    }
  }

  function saveForLater() {
    if (saveQuestForLater(quest.slug)) {
      toast(t.myQuests.savedToast, { variant: "success" });
    }
  }

  function begin() {
    if (startQuest(quest.slug, isPlus)) {
      toast("Quest started. Return whenever you’re ready.", {
        variant: "success",
      });
      router.push("/app#active-quests");
      return;
    }
    toast(
      nextSlot
        ? `Your next slot opens in ${formatQuestWindowRemaining(nextSlot, now).replace(" left", "")}. Save this quest and return then.`
        : "This quest window is no longer available. Choose it again to continue."
    );
  }

  /**
   * Pick up a saved or expired walk. startQuest atomically claims a fresh
   * rolling slot when needed, so no begin path can bypass the free limit.
   */
  function continueWalk() {
    begin();
  }

  function finish(withReflection: boolean) {
    const hasText = withReflection && reflection.trim().length > 0;
    const result = completeQuestBySlug(
      quest.slug,
      hasText ? { body: reflection, mood } : undefined
    );
    if (!result.completed) {
      if (result.reason === "checklist_incomplete") {
        toast("Finish the quest checklist before marking it complete.");
      } else if (result.reason === "already_completed") {
        toast("This quest is already complete.");
      } else if (result.reason === "unknown_quest") {
        toast("This quest is no longer available.");
      } else if (result.reason === "not_started") {
        toast("Start this quest before marking it complete.");
        setPhase("detail");
      } else {
        toast("That 24-hour window ended. Choose the quest again to finish it.");
        setPhase("detail");
      }
      return;
    }
    toast(hasText ? "Done. Reflection saved." : "Quest complete.", {
      variant: "celebrate",
    });
    setPhase("done");
  }

  const doneLine = completionLine(hashString(quest.slug));
  const growthCompletion = GROWTH_COMPLETION[quest.growthType];
  const doneBody = growthCompletion.line;

  return (
    <PageContainer className="pt-safe">
      <div className="pt-6">
        <Link
          href={inProgress ? "/app#active-quests" : "/app/quests"}
          className="inline-flex items-center gap-1.5 text-[0.875rem] text-ash transition-colors hover:text-charcoal"
        >
          <IconArrowLeft size={16} /> {inProgress ? "Active quests" : "Quests"}
        </Link>
      </div>

      <AnimatePresence mode="wait">
        {phase === "detail" && (
          <motion.div
            key="detail"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: gentleEase }}
            className="pb-8"
          >
            <div className="mt-5 flex items-center gap-3">
              <span className="rounded-[12px] bg-linen p-2.5 ring-1 ring-mist">
                <PixelIcon name={CATEGORY_SPRITE[quest.category] ?? "leaf"} size={6} />
              </span>
              <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ash">
                <IconClock size={14} /> {formatDuration(quest.durationMinutes)}
                <span className="text-mist">·</span>
                <span className="font-pixel text-[0.875rem] text-accent">
                  {CATEGORY_LABEL[quest.category]}
                </span>
              </span>
            </div>

            <h1 className="mt-4 font-display text-editorial text-graphite">
              {quest.title}
            </h1>
            <p className="mt-3 text-[1.0625rem] leading-relaxed text-charcoal">
              {quest.invitation}
            </p>

            <PaperCard variant="quiet" padding="md" className="mt-5">
              <p className="text-[0.75rem] uppercase tracking-wide text-accent">
                Why it matters
              </p>
              <p className="mt-1.5 text-small leading-relaxed text-charcoal">
                {quest.whyItMatters}
              </p>
            </PaperCard>

            {/* Scripture */}
            <PaperCard variant="atmospheric" padding="md" className="mt-4">
              {quest.scriptureText && (
                <blockquote className="verse-text">
                  “{cleanVerseText(quest.scriptureText)}”
                </blockquote>
              )}
              <cite className="mt-2 block text-[0.875rem] not-italic text-ash">
                — {quest.scriptureReference}
                <span className="text-fog"> · World English Bible</span>
              </cite>
            </PaperCard>

            {/* Metadata */}
            <dl className="mt-5 grid grid-cols-3 gap-4">
              <Meta label="Difficulty" value={quest.difficulty} />
              <Meta label="Energy" value={quest.energyLevel} />
              <Meta label="Setting" value={quest.soloOrSocial} />
            </dl>

            {/* Sensitivity note — safety framing */}
            {quest.sensitivityTags.length > 0 && (
              <SensitivityNote tags={quest.sensitivityTags} />
            )}

            {/* Prayer before starting */}
            <PaperCard variant="linen" padding="md" className="mt-5">
              <p className="text-[0.75rem] uppercase tracking-wide text-gilt">
                A prayer to begin
              </p>
              <p className="mt-1.5 text-[1rem] italic text-charcoal">
                “{quest.prayerPrompt}”
              </p>
            </PaperCard>

            {todayPick && (
              <p className="mt-3 text-center text-caption text-accent">
                {completedInWindow ? "Slot resets" : "Quest window"} ·{" "}
                <time
                  dateTime={todayPick.expiresAt}
                  title={new Date(todayPick.expiresAt).toLocaleString()}
                >
                  {formatQuestWindowRemaining(todayPick.expiresAt, now)}
                </time>
              </p>
            )}

            {/* Quest-specific checklists gate completion. Quests without one
                keep the original four optional movements as resumable
                bookmarks, so this workflow does not erase existing progress. */}
            {inProgress && entry && !completedInWindow && (
              <PaperCard variant="quiet" padding="md" className="mt-5">
                <p className="text-[0.75rem] uppercase tracking-wide text-accent">
                  {hasRequiredChecklist
                    ? "Quest checklist"
                    : "Your walk so far"}
                </p>
                {!hasRequiredChecklist && (
                  <p className="mt-1 text-caption text-ash">
                    These movements are optional. Use them to remember where
                    you left off.
                  </p>
                )}
                <ul className="mt-2.5 space-y-2">
                  {displayedSteps.map((item) => {
                    const done = entry.stepsDone.includes(item.key);
                    return (
                      <li key={item.key}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={done}
                          onClick={() =>
                            markQuestStep(quest.slug, item.key, !done)
                          }
                          className="flex w-full items-center gap-3 rounded-[var(--radius-button)] px-1 py-1.5 text-left transition-colors hover:bg-linen focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          <span
                            aria-hidden="true"
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] ring-1 transition-colors ${
                              done
                                ? "bg-accent text-[#fdfbf3] ring-accent"
                                : "bg-paper ring-mist"
                            }`}
                          >
                            {done && <IconCheck size={13} />}
                          </span>
                          <span
                            className={`text-small ${
                              done
                                ? "text-ash line-through decoration-mist"
                                : "text-charcoal"
                            }`}
                          >
                            {item.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </PaperCard>
            )}

            <div className="mt-6">
              {completedInWindow ? (
                <PaperCard variant="quiet" padding="md" className="text-center">
                  <p className="text-small text-charcoal">
                    Completed in this quest window.
                  </p>
                  <GentleLink variant="text" href="/app/journey" className="mt-2">
                    See your journey
                  </GentleLink>
                </PaperCard>
              ) : todayPick?.status === "started" ? (
                <div className="space-y-2.5">
                  <GentleButton
                    variant="primary"
                    size="lg"
                    fullWidth
                    disabled={!checklistComplete}
                    aria-describedby={
                      checklistComplete ? undefined : completionHelpId
                    }
                    onClick={() => setPhase("reflect")}
                  >
                    <IconCheck size={18} /> Complete quest
                  </GentleButton>
                  {!checklistComplete && (
                    <p
                      id={completionHelpId}
                      className="text-center text-caption text-ash"
                    >
                      {checklistRemaining === 1
                        ? "1 checklist item remains."
                        : `${checklistRemaining} checklist items remain.`}
                    </p>
                  )}
                  <GentleLink
                    variant="text"
                    size="sm"
                    href="/app#active-quests"
                    className="flex"
                  >
                    Back to active quests
                  </GentleLink>
                </div>
              ) : todayPick ? (
                <GentleButton variant="primary" size="lg" fullWidth onClick={begin}>
                  {walking ? t.myQuests.continueCta : "Begin quest"}
                </GentleButton>
              ) : walking ? (
                <GentleButton
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={continueWalk}
                >
                  {entry.status === "paused"
                    ? t.myQuests.resumeCta
                    : t.myQuests.continueCta}
                </GentleButton>
              ) : (
                <div className="space-y-2.5">
                  <GentleButton
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={addToToday}
                  >
                    <IconPlus size={18} /> Add to today
                  </GentleButton>
                  <div className="flex items-center justify-center gap-5">
                    {!entry && (
                      <button
                        type="button"
                        onClick={saveForLater}
                        className="py-2 text-center text-small text-accent transition-colors hover:text-accent/80"
                      >
                        {t.myQuests.saveForLater}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={begin}
                      className="py-2 text-center text-small text-ash transition-colors hover:text-charcoal"
                    >
                      Begin now
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {phase === "reflect" && (
          <motion.div
            key="reflect"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: gentleEase }}
            className="pb-8"
          >
            <div className="mt-8 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-accent-surface ring-1 ring-accent/20">
                <PixelIcon name="leaf" size={6} animate />
              </div>
              <h2 className="font-display text-editorial text-graphite">
                Before you go
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-small text-ash">
                Take a breath. Write if something stood out — it’s always
                optional.
              </p>
            </div>

            <PaperCard variant="paper" padding="md" className="mt-6">
              <label
                htmlFor={reflectionFieldId}
                className="block text-small font-medium text-graphite"
              >
                {quest.reflectionPrompt}
              </label>
              <textarea
                id={reflectionFieldId}
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                rows={5}
                placeholder="Write freely, or leave this blank…"
                className="mt-3 w-full resize-none rounded-[var(--radius-button)] border border-mist bg-linen px-3.5 py-3 text-[1rem] leading-relaxed text-graphite outline-none transition-colors focus:border-accent/50"
              />
              <div className="mt-3">
                <MoodPicker value={mood} onChange={setMood} />
              </div>
            </PaperCard>

            <div className="mt-5 space-y-2.5">
              <GentleButton
                variant="primary"
                size="lg"
                fullWidth
                disabled={!checklistComplete}
                onClick={() => finish(true)}
              >
                <IconCheck size={18} /> Complete quest
              </GentleButton>
              <button
                type="button"
                disabled={!checklistComplete}
                onClick={() => finish(false)}
                className="w-full py-2 text-center text-small text-ash transition-colors hover:text-charcoal disabled:cursor-not-allowed disabled:opacity-50"
              >
                Complete without writing
              </button>
              <button
                type="button"
                onClick={() => setPhase("detail")}
                className="w-full py-2 text-center text-small text-accent transition-colors hover:text-accent/80"
              >
                Back to quest
              </button>
            </div>
          </motion.div>
        )}

        {phase === "done" && (
          <motion.div
            key="done"
            role="status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: gentleEase }}
            className="flex min-h-[60vh] flex-col items-center justify-center pb-8 text-center"
          >
            <div className="relative mb-4">
              <motion.div
                variants={celebrationScale}
                initial="hidden"
                animate="visible"
                className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-surface ring-1 ring-accent/20"
              >
                <PixelIcon
                  name={growthCompletion.sprite}
                  size={8}
                  animate
                />
              </motion.div>
              {SPARKLES.map((position, i) => (
                <motion.span
                  key={position}
                  aria-hidden
                  custom={i + 1}
                  variants={pixelSparkle}
                  initial="hidden"
                  animate="visible"
                  className={`ambient absolute ${position}`}
                >
                  <PixelIcon name="star" size={2} />
                </motion.span>
              ))}
            </div>
            <h2 className="font-display text-editorial text-graphite">
              {doneLine}
            </h2>
            <p className="mt-2 max-w-xs text-small text-ash">{doneBody}</p>
            <div className="mt-7 flex flex-col items-center gap-3">
              <GentleLink variant="outline" href="/app/journey">
                See your journey
              </GentleLink>
              <GentleLink variant="text" href="/app">
                Return home
              </GentleLink>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageContainer>
  );
}

const SENSITIVITY_COPY: Record<string, string> = {
  forgiveness_sensitive:
    "This is inner work between you and God. You never have to contact anyone, and you are not obligated to reconcile. Your safety matters.",
  relationship_sensitive:
    "Go only as far as feels safe and healthy. Boundaries can be faithful too.",
  grief_sensitive:
    "Be gentle with yourself. If grief feels heavy, it may help to reach out to someone you trust.",
  money_sensitive: "Give only within your means. Never give what you need.",
  discipline_sensitive:
    "Keep this small and safe. This is about media, comfort, or habits — never food or health.",
};

function SensitivityNote({ tags }: { tags: string[] }) {
  const note = tags.map((t) => SENSITIVITY_COPY[t]).find(Boolean);
  if (!note) return null;
  return (
    <div className="mt-4 rounded-[var(--radius-button)] border border-marian-100 bg-marian-50 px-4 py-3">
      <p className="text-[0.875rem] leading-relaxed text-marian-700">{note}</p>
    </div>
  );
}

export function QuestDetail({ quest }: { quest: QuestTemplate }) {
  return (
    <ClientOnly>
      <QuestDetailInner quest={quest} />
    </ClientOnly>
  );
}
