"use client";

/**
 * Optional full quest reference. Lifecycle actions update in place and always
 * return to the canonical Quest board instead of bouncing through Home.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { QuestStepKey, QuestTemplate } from "@/lib/questos/types";
import { useQuestOS, selectMyQuests } from "@/lib/questos/store";
import {
  activeQuestAssignments,
  formatQuestWindowRemaining,
  isQuestWindowOpen,
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
import {
  GentleButton,
  GentleLink,
} from "@/components/design-system/GentleButton";
import {
  PixelIcon,
  CATEGORY_SPRITE,
} from "@/components/design-system/PixelIcon";
import {
  IconArrowLeft,
  IconClock,
  IconCheck,
  IconPlus,
} from "@/components/design-system/icons";
import { QuestCompletionSheet } from "@/components/quests/QuestCompletionSheet";
import { formatDuration, CATEGORY_LABEL } from "@/components/quests/QuestSlip";
import { useStrings } from "@/lib/i18n";
import { cleanVerseText } from "@/lib/utils/scripture";
import { track } from "@/lib/analytics/events";
import { usePlus } from "@/lib/billing/usePlus";
import { cn } from "@/lib/utils/cn";

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
  const completeQuest = useQuestOS((state) => state.completeQuestBySlug);
  const pickQuest = useQuestOS((state) => state.pickQuest);
  const startQuest = useQuestOS((state) => state.startQuest);
  const saveQuestForLater = useQuestOS((state) => state.saveQuestForLater);
  const markQuestStep = useQuestOS((state) => state.markQuestStep);
  const assignments = useQuestOS((state) => state.assignments);
  const myQuests = useQuestOS(selectMyQuests);
  const reflections = useQuestOS((state) => state.reflections);
  const { isPlus } = usePlus();
  const [completionOpen, setCompletionOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const completionHelpId = useId();
  const nextStepRef = useRef<HTMLButtonElement>(null);

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
    [assignments, now],
  );
  const assignment = picks.find((pick) => pick.questSlug === quest.slug);
  const entry = myQuests[quest.slug];
  const walking =
    entry &&
    (entry.status === "active" || entry.status === "paused") &&
    hasBegun(entry);
  const completed = entry?.status === "completed";
  const ready = assignment?.status === "assigned";
  const active =
    assignment?.status === "started" || (!assignment && Boolean(walking));
  const activeWindowOpen = Boolean(
    assignment?.status === "started" && isQuestWindowOpen(assignment, now),
  );
  const expired = active && !activeWindowOpen;

  const checklistItems = checklistItemsForQuest(quest);
  const hasRequiredChecklist = checklistItems.length > 0;
  const checklistComplete = isQuestChecklistComplete(quest, entry);
  const checklistRemaining = checklistItems.filter(
    (item) => !entry?.stepsDone.includes(item.key),
  ).length;
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
  const latestReflection = reflections
    .filter((reflection) => reflection.relatedQuestSlug === quest.slug)
    .at(-1);

  useEffect(() => {
    track("quest_viewed", { category: quest.category });
  }, [quest.slug, quest.category]);

  /** Adds this quest to Ready without starting its timer. */
  function addToReady() {
    if (pickQuest(quest.slug, isPlus)) {
      toast("Added to Ready.", { variant: "success" });
      return;
    }
    toast("All three quest spots are filled. Finish or remove one first.");
  }

  function saveForLater() {
    if (saveQuestForLater(quest.slug)) {
      toast(t.myQuests.savedToast, { variant: "success" });
    }
  }

  /** Begins or resumes here; the full reference stays open and usable. */
  function beginOrResume() {
    if (startQuest(quest.slug, isPlus)) {
      setNow(Date.now());
      toast("Quest active. Your 24-hour window has started.", {
        variant: "success",
      });
      return;
    }
    toast("All three quest spots are filled. Finish or remove one first.");
  }

  /** Completes immediately, then offers the optional reflection sheet. */
  function finish() {
    const result = completeQuest(quest.slug);
    if (result.completed) {
      setCompletionOpen(true);
      return;
    }
    if (result.reason === "checklist_incomplete") {
      toast("Finish the required quest steps first.");
    } else if (result.reason === "window_closed") {
      toast("This quest window ended. Resume it before finishing.");
    } else if (result.reason === "not_started") {
      toast("Begin this quest before finishing it.");
    } else {
      toast("This quest is already complete.");
    }
  }

  /** Moves keyboard focus to the next required action without navigation. */
  function continueInline() {
    nextStepRef.current?.focus();
    nextStepRef.current?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }

  /** Returns the optional full reference to the canonical Quest board. */
  const closeCompletionSheet = useCallback(() => {
    setCompletionOpen(false);
    router.push("/app/quests");
  }, [router, setCompletionOpen]);

  return (
    <>
      <PageContainer className="pt-safe">
        <div className="pt-6">
          <Link
            href="/app/quests"
            className="inline-flex min-h-11 items-center gap-1.5 text-[0.875rem] text-ash transition-colors hover:text-charcoal"
          >
            <IconArrowLeft size={16} /> Quests
          </Link>
        </div>

        <div className="pb-8">
          <div className="mt-5 flex items-center gap-3">
            <span className="shrink-0">
              <PixelIcon
                name={CATEGORY_SPRITE[quest.category] ?? "leaf"}
                size={80}
              />
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

          <PaperCard variant="atmospheric" padding="md" className="mt-4">
            {quest.scriptureText && (
              <blockquote className="verse-text">
                “{cleanVerseText(quest.scriptureText)}”
              </blockquote>
            )}
            <cite className="mt-2 block text-[0.875rem] not-italic text-ash">
              — {quest.scriptureReference}
              <span className="text-quill"> · World English Bible</span>
            </cite>
          </PaperCard>

          <dl className="mt-5 grid grid-cols-3 gap-4">
            <Meta label="Difficulty" value={quest.difficulty} />
            <Meta label="Energy" value={quest.energyLevel} />
            <Meta label="Setting" value={quest.soloOrSocial} />
          </dl>

          {quest.sensitivityTags.length > 0 && (
            <SensitivityNote tags={quest.sensitivityTags} />
          )}

          <PaperCard variant="linen" padding="md" className="mt-5">
            <p className="text-[0.75rem] uppercase tracking-wide text-gilt">
              A prayer to begin
            </p>
            <p className="mt-1.5 text-[1rem] italic text-charcoal">
              “{quest.prayerPrompt}”
            </p>
          </PaperCard>

          {ready && (
            <p className="mt-3 text-center text-caption text-ash">
              Your 24-hour window starts when you begin.
            </p>
          )}
          {activeWindowOpen && assignment && (
            <p className="mt-3 text-center text-caption text-accent">
              Active ·{" "}
              <time
                dateTime={assignment.expiresAt}
                title={new Date(assignment.expiresAt).toLocaleString()}
              >
                {formatQuestWindowRemaining(assignment.expiresAt, now)}
              </time>
            </p>
          )}
          {expired && (
            <p className="mt-3 text-center text-caption text-ash">
              Window ended · Resume when you are ready.
            </p>
          )}

          {active && entry && !completed && (
            <PaperCard variant="quiet" padding="md" className="mt-5">
              <p className="text-[0.75rem] uppercase tracking-wide text-accent">
                {hasRequiredChecklist ? "Required steps" : "Your walk so far"}
              </p>
              {!hasRequiredChecklist && (
                <p className="mt-1 text-caption text-ash">
                  These movements are optional bookmarks, not requirements.
                </p>
              )}
              <ul className="mt-2.5 space-y-2">
                {displayedSteps.map((item) => {
                  const done = entry.stepsDone.includes(item.key);
                  const isNext =
                    hasRequiredChecklist &&
                    !done &&
                    checklistItems.find(
                      (candidate) =>
                        !entry.stepsDone.includes(candidate.key),
                    )?.key === item.key;
                  return (
                    <li key={item.key}>
                      <button
                        ref={isNext ? nextStepRef : undefined}
                        type="button"
                        role="checkbox"
                        aria-checked={done}
                        disabled={expired}
                        onClick={() =>
                          markQuestStep(quest.slug, item.key, !done)
                        }
                        className="flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-button)] px-1 py-1.5 text-left transition-colors hover:bg-linen focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] ring-1 transition-colors",
                            done
                              ? "bg-accent text-[#fdfbf3] ring-accent"
                              : "bg-paper ring-mist",
                          )}
                        >
                          {done && <IconCheck size={13} />}
                        </span>
                        <span
                          className={cn(
                            "text-small",
                            done
                              ? "text-ash line-through decoration-mist"
                              : "text-charcoal",
                          )}
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
            {completed ? (
              <PaperCard variant="quiet" padding="md" className="text-center">
                <p className="text-small text-charcoal">Quest complete.</p>
                <div className="mt-2 flex flex-wrap justify-center gap-4">
                  {latestReflection && (
                    <GentleLink
                      variant="text"
                      href="/app/prayer/reflections"
                    >
                      View reflection
                    </GentleLink>
                  )}
                  <GentleLink variant="text" href="/app/journey">
                    See in Journey
                  </GentleLink>
                </div>
              </PaperCard>
            ) : ready ? (
              <GentleButton
                variant="primary"
                size="lg"
                fullWidth
                onClick={beginOrResume}
              >
                {walking ? "Resume quest" : "Begin"}
              </GentleButton>
            ) : expired ? (
              <GentleButton
                variant="primary"
                size="lg"
                fullWidth
                onClick={beginOrResume}
              >
                Resume quest
              </GentleButton>
            ) : activeWindowOpen ? (
              <div className="space-y-2.5">
                {hasRequiredChecklist && !checklistComplete ? (
                  <GentleButton
                    variant="primary"
                    size="lg"
                    fullWidth
                    aria-describedby={completionHelpId}
                    onClick={continueInline}
                  >
                    Continue
                  </GentleButton>
                ) : (
                  <GentleButton
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={finish}
                  >
                    <IconCheck size={18} />
                    {hasRequiredChecklist ? "Finish quest" : "Mark complete"}
                  </GentleButton>
                )}
                {hasRequiredChecklist && !checklistComplete && (
                  <p
                    id={completionHelpId}
                    className="text-center text-caption text-ash"
                  >
                    {checklistRemaining === 1
                      ? "1 required step remains."
                      : `${checklistRemaining} required steps remain.`}
                  </p>
                )}
                <GentleLink
                  variant="text"
                  size="sm"
                  href="/app/quests"
                  className="flex"
                >
                  Back to Quests
                </GentleLink>
              </div>
            ) : (
              <div className="space-y-2.5">
                <GentleButton
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={addToReady}
                >
                  <IconPlus size={18} /> Add to Ready
                </GentleButton>
                <div className="flex items-center justify-center gap-5">
                  {!entry && (
                    <button
                      type="button"
                      onClick={saveForLater}
                      className="min-h-11 py-2 text-center text-small text-accent transition-colors hover:text-accent/80"
                    >
                      {t.myQuests.saveForLater}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={beginOrResume}
                    className="min-h-11 py-2 text-center text-small text-ash transition-colors hover:text-charcoal"
                  >
                    Start now
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </PageContainer>

      <QuestCompletionSheet
        quest={completionOpen ? quest : null}
        onClose={closeCompletionSheet}
      />
    </>
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
  const note = tags.map((tag) => SENSITIVITY_COPY[tag]).find(Boolean);
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
