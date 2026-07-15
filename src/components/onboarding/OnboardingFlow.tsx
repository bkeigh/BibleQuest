"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useQuestOS } from "@/lib/questos/store";
import { useSession } from "@/lib/supabase/useSession";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { GentleButton } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelMascot } from "@/components/design-system/PixelMascot";
import type { PixelMascotName } from "@/components/design-system/PixelMascot";
import { SignInMethods } from "@/components/account/SignInMethods";
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

const TOTAL_STEPS = 8;
/** The final step: the account invitation, reached only after the journey is
 *  already committed to the device (see commit()). */
const ACCOUNT_STEP = 7;

/** The one heading rendered per step — focus lands here on step change. */
const STEP_HEADING_ID = "onboarding-step-heading";

function OnboardingInner() {
  const router = useRouter();
  const { user, configured } = useSession();
  const completeOnboarding = useQuestOS((s) => s.completeOnboarding);
  const pickQuest = useQuestOS((s) => s.pickQuest);
  const markAccountNudgeShown = useQuestOS((s) => s.markAccountNudgeShown);
  const alreadyDone = useQuestOS((s) => s.profile?.onboardingCompleted ?? false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({ displayName: "" });
  // Where the user lands once they leave onboarding — captured at commit()
  // (Home vs. the quest browser) so the account step and post-sign-in both
  // route to the right place.
  const [pendingDest, setPendingDest] = useState("/app");
  // Only move focus after the user navigates — never on first paint.
  const hasNavigated = useRef(false);
  // Set inside commit(): completing onboarding flips `alreadyDone`, and without
  // this guard the redirect effect below would race commit() and skip the
  // account step, sending the user straight to the app.
  const finishing = useRef(false);

  useEffect(() => {
    if (alreadyDone && !finishing.current) router.replace("/app");
  }, [alreadyDone, router]);

  // Phone OTP verifies in-page (no redirect), so when a sign-in completes while
  // we're on the account step, move the user into the app ourselves. Magic-link
  // and Google instead leave the page and return via /auth/callback → /app.
  useEffect(() => {
    if (step === ACCOUNT_STEP && user) router.replace(pendingDest);
  }, [step, user, pendingDest, router]);

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
   * Commit the journey to this device, then invite an account (the final step).
   *
   * "Commit before invite" is load-bearing: the profile and picked quest are
   * persisted BEFORE any auth round-trip can leave the page, so returning from
   * Google / a magic link passes the OnboardingGate cleanly and the guest
   * journey is already on disk, ready for the first sync to push up. Optionally
   * picks the suggested quest first (a failed pick never blocks entry) and
   * remembers where to land afterwards.
   */
  function commit(opts?: { pickSlug?: string; destination?: string }) {
    finishing.current = true;
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
    const dest = opts?.destination ?? "/app";
    setPendingDest(dest);
    // No account layer on this deployment, or already signed in → skip the
    // invitation and go straight in.
    if (!configured || user) {
      router.replace(dest);
      return;
    }
    hasNavigated.current = true;
    setStep(ACCOUNT_STEP);
  }

  /**
   * Leave onboarding for the app, recording that the account invitation was
   * already shown so Home's AccountPrompt doesn't immediately repeat it. Used
   * by "Continue as guest" and by the "Open BibleQuest" exit after a magic
   * link is sent. Deliberately does NOT call dismissAccountNudge() — that would
   * open a 14-day quiet period and burn a lifetime dismissal, suppressing the
   * higher-intent first-quest prompt later.
   */
  function proceed() {
    markAccountNudgeShown("onboarding");
    router.replace(pendingDest);
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex min-h-dvh flex-col bg-parchment px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-safe">
        {/* Progress — dots, no numbers, no pressure */}
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-valuenow={step + 1}
          aria-valuetext={`Step ${step + 1} of ${TOTAL_STEPS}`}
          className="mx-auto flex w-full max-w-md items-center justify-center gap-1.5 pt-6"
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

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-5">
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
                    commit(
                      suggestedQuest ? { pickSlug: suggestedQuest.slug } : undefined
                    )
                  }
                  onBrowse={() => commit({ destination: "/app/quests" })}
                />
              )}
              {step === ACCOUNT_STEP && (
                <StepAccount
                  name={draft.displayName.trim() || "friend"}
                  onProceed={proceed}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer nav — hidden on the account step: the journey is already
            committed there, so there's nothing to go back to. */}
        <div className="mx-auto flex w-full max-w-md items-center justify-between">
          {step > 0 && step < ACCOUNT_STEP ? (
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
      className="mb-4"
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
        <StepMascot name="sprout" size={7} />
        <h2
          id={STEP_HEADING_ID}
          tabIndex={-1}
          className="font-display text-[1.375rem] leading-snug text-graphite outline-none"
        >
          You’re set, {name}.
        </h2>
        <p className="mt-1.5 text-small text-ash">
          Here’s today’s verse{quest ? " and a suggested first quest" : ""}.
        </p>
      </div>
      <div className="mt-4 space-y-3">
        {/* preview: display-only — the card's Save/Reflect actions lead into
            /app, and OnboardingGate would bounce back here, restarting the
            flow and losing every answer. */}
        <VerseCard verse={verse} preview />
        {quest && (
          <div>
            <p className="mb-1.5 text-caption uppercase tracking-[0.14em] text-accent">
              Suggested first quest
            </p>
            {/* compact + no prayer card: the quest page itself carries the
                invitation and prayer prompt — this step just has to fit a
                phone screen without scrolling. */}
            <QuestSlip quest={quest} compact />
          </div>
        )}
      </div>
      <GentleButton
        variant="primary"
        size="lg"
        fullWidth
        className="mt-5"
        onClick={onStart}
      >
        {quest ? "Start with this quest" : "Open BibleQuest"}
      </GentleButton>
      <div className="mt-2.5 text-center">
        <GentleButton variant="text" size="sm" onClick={onBrowse}>
          Or browse all quests
        </GentleButton>
      </div>
    </div>
  );
}

/**
 * The final step: a gentle, skippable invitation to save the journey to an
 * account. Reached only after commit() has already persisted everything, so
 * "Continue as guest" and any sign-in both leave with the journey intact. Never
 * a wall — the full-width escape is always present and equal in weight.
 */
function StepAccount({
  name,
  onProceed,
}: {
  name: string;
  onProceed: () => void;
}) {
  const [emailSent, setEmailSent] = useState(false);
  return (
    <div>
      <div className="text-center">
        <StepMascot name="key" size={7} />
        <h2
          id={STEP_HEADING_ID}
          tabIndex={-1}
          className="font-display text-[1.375rem] leading-snug text-graphite outline-none"
        >
          One last thing, {name}
        </h2>
        <p className="mx-auto mt-1.5 max-w-sm text-caption leading-relaxed text-ash">
          Your journey is saved on this device. A free account keeps it safe
          across devices — your prayers and reflections stay private, always.
          Optional, and you can always do it later.
        </p>
      </div>

      <PaperCard variant="paper" padding="md" className="mt-4">
        <SignInMethods source="onboarding" onEmailSent={() => setEmailSent(true)} />
      </PaperCard>

      <GentleButton
        variant={emailSent ? "primary" : "outline"}
        size="lg"
        fullWidth
        className="mt-3"
        onClick={onProceed}
      >
        {emailSent ? "Open BibleQuest" : "Continue as guest"}
      </GentleButton>
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
