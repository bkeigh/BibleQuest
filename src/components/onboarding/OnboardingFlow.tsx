"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useQuestOS } from "@/lib/questos/store";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { GentleButton } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelMascot } from "@/components/design-system/PixelMascot";
import type { PixelMascotName } from "@/components/design-system/PixelMascot";
import { QuestSlip } from "@/components/quests/QuestSlip";
import { VerseCard } from "@/components/bible/VerseCard";
import { getDailyVerse } from "@/lib/questos/verse-engine";
import { selectSuggestedQuests } from "@/lib/questos/quest-engine";
import { seedQuests } from "@/data/seed/quests";
import { getCurrentSeason } from "@/lib/questos/seasonal-engine";
import { toDateKey } from "@/lib/utils/dates";
import { track } from "@/lib/analytics/events";
import { riseIn, stepTransition } from "@/lib/motion";
import { DEFAULT_SETTINGS } from "@/lib/questos/types";
import type {
  Calling,
  DailyRhythm,
  PrimaryGoal,
  QuestStyle,
  QuestTemplate,
  Tradition,
} from "@/lib/questos/types";

interface Choice<T> {
  value: T;
  label: string;
}

const GOALS: Choice<PrimaryGoal>[] = [
  { value: "grow_closer", label: "Grow closer to God" },
  { value: "read_scripture", label: "Read Scripture more often" },
  { value: "prayer_habit", label: "Build a prayer habit" },
  { value: "practice_kindness", label: "Practice kindness" },
  { value: "return_to_faith", label: "Return to faith" },
  { value: "explore_christianity", label: "Explore Christianity" },
  { value: "family_church", label: "Support my family or church life" },
];

const TRADITIONS: Choice<Tradition>[] = [
  { value: "catholic", label: "Catholic" },
  { value: "protestant", label: "Protestant" },
  { value: "orthodox", label: "Orthodox" },
  { value: "non_denominational", label: "Non-denominational" },
  { value: "exploring", label: "Exploring" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const RHYTHMS: Choice<DailyRhythm>[] = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "flexible", label: "Flexible" },
];

const STYLES: Choice<QuestStyle>[] = [
  { value: "quiet", label: "Quiet and reflective" },
  { value: "scripture", label: "Scripture-focused" },
  { value: "service", label: "Service-focused" },
  { value: "kindness", label: "Kindness-focused" },
  { value: "discipline", label: "Discipline-focused" },
  { value: "surprise", label: "Surprise me" },
];

const CALLINGS: Choice<Calling>[] = [
  { value: "student", label: "Student" },
  { value: "parent", label: "Parent" },
  { value: "creative", label: "Creative" },
  { value: "business_owner", label: "Business owner" },
  { value: "teacher", label: "Teacher" },
  { value: "healthcare", label: "Healthcare worker" },
  { value: "caregiver", label: "Caregiver" },
  { value: "athlete", label: "Athlete" },
  { value: "new_believer", label: "New believer" },
  { value: "returning", label: "Returning to faith" },
  { value: "retired", label: "Retired" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

interface Draft {
  displayName: string;
  primaryGoal?: PrimaryGoal;
  tradition?: Tradition;
  dailyRhythm?: DailyRhythm;
  questStyle?: QuestStyle;
  calling?: Calling;
}

const TOTAL_STEPS = 7;

/** The one heading rendered per step — focus lands here on step change. */
const STEP_HEADING_ID = "onboarding-step-heading";

function OnboardingInner() {
  const router = useRouter();
  const completeOnboarding = useQuestOS((s) => s.completeOnboarding);
  const pickQuest = useQuestOS((s) => s.pickQuest);
  const alreadyDone = useQuestOS((s) => s.profile?.onboardingCompleted ?? false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({ displayName: "" });
  // Only move focus after the user navigates — never on first paint.
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (alreadyDone) router.replace("/app");
  }, [alreadyDone, router]);

  useEffect(() => {
    track("onboarding_started");
  }, []);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const next = () => {
    hasNavigated.current = true;
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };
  const back = () => {
    hasNavigated.current = true;
    setStep((s) => Math.max(s - 1, 0));
  };

  const suggestedQuest = useMemo<QuestTemplate | null>(
    () =>
      selectSuggestedQuests({
        quests: seedQuests,
        dateKey: toDateKey(),
        profile: {
          displayName: "friend",
          questStyle: draft.questStyle,
          onboardingCompleted: false,
          createdAt: new Date(0).toISOString(),
        },
        settings: DEFAULT_SETTINGS,
        season: getCurrentSeason().key,
        recentSlugs: [],
        count: 1,
      })[0] ?? null,
    [draft.questStyle]
  );
  const previewVerse = useMemo(() => getDailyVerse(), []);

  /**
   * Complete onboarding. Optionally picks the suggested quest first (a
   * failed pick never blocks entry) and can land somewhere other than Home.
   */
  function finish(opts?: { pickSlug?: string; destination?: string }) {
    const rhythm = draft.dailyRhythm ?? "flexible";
    completeOnboarding(
      {
        displayName: draft.displayName.trim() || "friend",
        primaryGoal: draft.primaryGoal,
        tradition: draft.tradition,
        dailyRhythm: draft.dailyRhythm,
        questStyle: draft.questStyle,
        calling: draft.calling,
      },
      { notifications: { ...DEFAULT_SETTINGS.notifications, preferredTime: rhythm } }
    );
    if (opts?.pickSlug) {
      // Returns false when the day is full or the slug is unknown — either
      // way the user still lands in the app with a working day.
      pickQuest(opts.pickSlug);
    }
    router.replace(opts?.destination ?? "/app");
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex min-h-dvh flex-col bg-parchment px-5 pb-10 pt-safe">
        {/* Progress — dots, no numbers, no pressure */}
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-valuenow={step + 1}
          aria-valuetext={`Step ${step + 1} of ${TOTAL_STEPS}`}
          className="mx-auto flex w-full max-w-md items-center justify-center gap-1.5 pt-8"
        >
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === step
                  ? "w-6 bg-accent"
                  : i < step
                    ? "w-1.5 bg-accent/40"
                    : "w-1.5 bg-mist"
              }`}
            />
          ))}
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              variants={stepTransition}
              initial="enter"
              animate="center"
              exit="exit"
              onAnimationComplete={(definition) => {
                if (definition === "center" && hasNavigated.current) {
                  document.getElementById(STEP_HEADING_ID)?.focus();
                }
              }}
            >
              {step === 0 && (
                <StepWelcome
                  name={draft.displayName}
                  onName={(displayName) => set({ displayName })}
                  onNext={next}
                />
              )}
              {step === 1 && (
                <StepChoice
                  mascot="map"
                  title="What brings you here?"
                  hint="This shapes your first quests. Pick the closest fit."
                  choices={GOALS}
                  value={draft.primaryGoal}
                  onSelect={(primaryGoal) => {
                    set({ primaryGoal });
                    next();
                  }}
                />
              )}
              {step === 2 && (
                <StepChoice
                  mascot="scroll"
                  title="Your tradition"
                  hint="Optional — it tunes the language. You’re welcome here either way."
                  choices={TRADITIONS}
                  value={draft.tradition}
                  onSelect={(tradition) => {
                    set({ tradition });
                    next();
                  }}
                />
              )}
              {step === 3 && (
                <StepChoice
                  mascot="lantern"
                  title="When’s a good time for your daily quest?"
                  hint="We’ll time reminders around it. You can change this anytime."
                  choices={RHYTHMS}
                  value={draft.dailyRhythm}
                  onSelect={(dailyRhythm) => {
                    set({ dailyRhythm });
                    next();
                  }}
                />
              )}
              {step === 4 && (
                <StepChoice
                  mascot="campfire"
                  title="What kind of quests fit you?"
                  hint="A starting point, not a box. Your quests will still surprise you."
                  choices={STYLES}
                  value={draft.questStyle}
                  onSelect={(questStyle) => {
                    set({ questStyle });
                    next();
                  }}
                />
              )}
              {step === 5 && (
                <StepChoice
                  mascot="dove"
                  title="What’s your day-to-day?"
                  hint="Optional. It helps quests fit your real life."
                  choices={CALLINGS}
                  value={draft.calling}
                  onSelect={(calling) => {
                    set({ calling });
                    next();
                  }}
                />
              )}
              {step === 6 && (
                <StepFirstQuest
                  name={draft.displayName.trim() || "friend"}
                  verse={previewVerse}
                  quest={suggestedQuest}
                  onStart={() =>
                    finish(
                      suggestedQuest ? { pickSlug: suggestedQuest.slug } : undefined
                    )
                  }
                  onBrowse={() => finish({ destination: "/app/quests" })}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer nav */}
        <div className="mx-auto flex w-full max-w-md items-center justify-between">
          {step > 0 ? (
            <button
              onClick={back}
              className="text-small text-ash transition-colors hover:text-charcoal"
            >
              Back
            </button>
          ) : (
            <span />
          )}
          {step > 0 && step < 6 && (
            <button
              onClick={next}
              className="text-small text-ash transition-colors hover:text-charcoal"
            >
              Skip
            </button>
          )}
        </div>
      </div>
    </MotionConfig>
  );
}

/** One centered mascot per step, always above the heading. */
function StepMascot({ name, size = 9 }: { name: PixelMascotName; size?: number }) {
  return (
    <motion.div
      variants={riseIn}
      initial="hidden"
      animate="visible"
      className="mb-6"
    >
      <PixelMascot name={name} size={size} />
    </motion.div>
  );
}

function StepWelcome({
  name,
  onName,
  onNext,
}: {
  name: string;
  onName: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="text-center">
      <StepMascot name="lamb" size={10} />
      <h1
        id={STEP_HEADING_ID}
        tabIndex={-1}
        className="font-display text-editorial text-graphite outline-none"
      >
        Welcome to BibleQuest
      </h1>
      <p className="mx-auto mt-3 max-w-xs text-[1.0625rem] leading-relaxed text-charcoal">
        One verse, one prayer, one quest, one step at a time.
      </p>
      <div className="mt-8 text-left">
        <label htmlFor="name" className="mb-1.5 block text-caption text-ash">
          What should we call you?
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => onName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onNext()}
          placeholder="Your first name"
          autoComplete="given-name"
          className="w-full rounded-[var(--radius-button)] border border-mist bg-paper px-4 py-3 text-body text-graphite outline-none transition-colors focus:border-accent/50"
        />
        <p className="mt-1.5 text-caption text-ash">
          Optional — skip it if you like.
        </p>
      </div>
      <GentleButton
        variant="primary"
        size="lg"
        fullWidth
        className="mt-6"
        onClick={onNext}
      >
        Begin
      </GentleButton>
    </div>
  );
}

function StepChoice<T extends string>({
  mascot,
  title,
  hint,
  choices,
  value,
  onSelect,
}: {
  mascot: PixelMascotName;
  title: string;
  hint: string;
  choices: Choice<T>[];
  value?: T;
  onSelect: (v: T) => void;
}) {
  return (
    <div>
      <div className="text-center">
        <StepMascot name={mascot} />
        <h2
          id={STEP_HEADING_ID}
          tabIndex={-1}
          className="font-display text-editorial text-graphite outline-none"
        >
          {title}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-small leading-relaxed text-ash">
          {hint}
        </p>
      </div>
      <div className="mt-6 flex flex-col gap-2.5">
        {choices.map((c) => (
          <button
            key={c.value}
            onClick={() => onSelect(c.value)}
            aria-pressed={value === c.value}
            className={`rounded-[var(--radius-button)] border px-4 py-3.5 text-left text-body transition-all duration-300 ${
              value === c.value
                ? "border-accent bg-accent-surface text-accent-ink"
                : "border-mist bg-paper text-charcoal hover:border-accent/40 hover:bg-linen"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepFirstQuest({
  name,
  verse,
  quest,
  onStart,
  onBrowse,
}: {
  name: string;
  verse: ReturnType<typeof getDailyVerse>;
  quest: QuestTemplate | null;
  onStart: () => void;
  onBrowse: () => void;
}) {
  return (
    <div>
      <div className="text-center">
        <StepMascot name="sprout" />
        <h2
          id={STEP_HEADING_ID}
          tabIndex={-1}
          className="font-display text-editorial text-graphite outline-none"
        >
          You’re set, {name}.
        </h2>
        <p className="mt-2 text-small text-ash">
          Here’s today’s verse{quest ? " and a suggested first quest" : ""}.
        </p>
      </div>
      <div className="mt-6 space-y-4">
        <VerseCard verse={verse} />
        {quest && (
          <div>
            <p className="mb-2 text-caption uppercase tracking-[0.14em] text-accent">
              Suggested first quest
            </p>
            <QuestSlip quest={quest} />
          </div>
        )}
        <PaperCard variant="quiet" padding="md">
          <p className="text-small italic text-charcoal">
            “{quest?.prayerPrompt ?? "Lord, meet me in this quiet moment."}”
          </p>
        </PaperCard>
      </div>
      <GentleButton
        variant="primary"
        size="lg"
        fullWidth
        className="mt-6"
        onClick={onStart}
      >
        {quest ? "Start with this quest" : "Open BibleQuest"}
      </GentleButton>
      <div className="mt-3 text-center">
        <GentleButton variant="text" size="sm" onClick={onBrowse}>
          Or browse all quests
        </GentleButton>
      </div>
    </div>
  );
}

export function OnboardingFlow() {
  return (
    <ClientOnly
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-parchment">
          <PixelMascot name="lantern" size={7} />
        </div>
      }
    >
      <OnboardingInner />
    </ClientOnly>
  );
}
