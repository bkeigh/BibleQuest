"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useQuestOS } from "@/lib/questos/store";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { GentleButton } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { QuestSlip } from "@/components/quests/QuestSlip";
import { VerseCard } from "@/components/bible/VerseCard";
import { getDailyVerse } from "@/lib/questos/verse-engine";
import { selectDailyQuest } from "@/lib/questos/quest-engine";
import { seedQuests } from "@/data/seed/quests";
import { getCurrentSeason } from "@/lib/questos/seasonal-engine";
import { toDateKey } from "@/lib/utils/dates";
import { track } from "@/lib/analytics/events";
import { DEFAULT_SETTINGS } from "@/lib/questos/types";
import type {
  Calling,
  DailyRhythm,
  PrimaryGoal,
  QuestStyle,
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

function OnboardingInner() {
  const router = useRouter();
  const completeOnboarding = useQuestOS((s) => s.completeOnboarding);
  const alreadyDone = useQuestOS((s) => s.profile?.onboardingCompleted ?? false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({ displayName: "" });

  useEffect(() => {
    if (alreadyDone) router.replace("/app");
  }, [alreadyDone, router]);

  useEffect(() => {
    track("onboarding_started");
  }, []);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const previewQuest = useMemo(
    () =>
      selectDailyQuest({
        quests: seedQuests,
        dateKey: toDateKey(),
        profile: {
          displayName: draft.displayName || "friend",
          questStyle: draft.questStyle,
          onboardingCompleted: false,
          createdAt: new Date(0).toISOString(),
        },
        settings: DEFAULT_SETTINGS,
        season: getCurrentSeason().key,
        recentSlugs: [],
      }),
    [draft.questStyle, draft.displayName]
  );
  const previewVerse = useMemo(() => getDailyVerse(), []);

  function finish() {
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
    router.replace("/app");
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-parchment px-5 pb-10 pt-safe">
      {/* Progress — dots, no numbers, no pressure */}
      <div className="mx-auto flex w-full max-w-md items-center justify-center gap-1.5 pt-8">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              i === step
                ? "w-6 bg-olive-500"
                : i < step
                  ? "w-1.5 bg-olive-300"
                  : "w-1.5 bg-mist"
            }`}
          />
        ))}
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.25, 0.4, 0.25, 1] }}
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
                title="What brings you here?"
                hint="This helps shape your first quests. There are no wrong answers."
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
                title="Your tradition"
                hint="Optional — it gently tunes the language. You’re welcome here either way."
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
                title="When do you hope to slow down?"
                hint="We’ll shape your gentle reminders around this. You can change it anytime."
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
                title="What fills your days?"
                hint="Optional. It helps quests meet you in real life."
                choices={CALLINGS}
                value={draft.calling}
                onSelect={(calling) => {
                  set({ calling });
                  next();
                }}
              />
            )}
            {step === 6 && (
              <StepFirstJourney
                name={draft.displayName || "friend"}
                verse={previewVerse}
                quest={previewQuest}
                onBegin={finish}
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
            className="text-[0.9375rem] text-ash transition-colors hover:text-charcoal"
          >
            Back
          </button>
        ) : (
          <span />
        )}
        {step > 0 && step < 6 && (
          <button
            onClick={next}
            className="text-[0.9375rem] text-ash transition-colors hover:text-charcoal"
          >
            Skip
          </button>
        )}
      </div>
    </div>
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
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gold-50 ring-1 ring-gold-100">
        <PixelIcon name="candle" size={7} animate />
      </div>
      <h1 className="font-display text-[2rem] leading-tight text-graphite">
        Welcome to BibleQuest
      </h1>
      <p className="mx-auto mt-3 max-w-xs text-[1.0625rem] leading-relaxed text-charcoal">
        One verse, one prayer, one quest, one step at a time.
      </p>
      <div className="mt-8 text-left">
        <label
          htmlFor="name"
          className="mb-1.5 block text-[0.875rem] text-ash"
        >
          What may we call you?
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => onName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onNext()}
          placeholder="Your first name"
          autoComplete="given-name"
          className="w-full rounded-[var(--radius-button)] border border-mist bg-paper px-4 py-3 text-[1rem] text-graphite outline-none transition-colors focus:border-olive-300"
        />
      </div>
      <GentleButton
        variant="dark"
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
  title,
  hint,
  choices,
  value,
  onSelect,
}: {
  title: string;
  hint: string;
  choices: Choice<T>[];
  value?: T;
  onSelect: (v: T) => void;
}) {
  return (
    <div>
      <h2 className="font-display text-[1.625rem] leading-tight text-graphite">
        {title}
      </h2>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ash">{hint}</p>
      <div className="mt-6 flex flex-col gap-2.5">
        {choices.map((c) => (
          <button
            key={c.value}
            onClick={() => onSelect(c.value)}
            className={`rounded-[var(--radius-button)] border px-4 py-3.5 text-left text-[1rem] transition-all duration-300 ${
              value === c.value
                ? "border-olive-500 bg-olive-50 text-olive-700"
                : "border-mist bg-paper text-charcoal hover:border-olive-300 hover:bg-linen"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepFirstJourney({
  name,
  verse,
  quest,
  onBegin,
}: {
  name: string;
  verse: ReturnType<typeof getDailyVerse>;
  quest: ReturnType<typeof selectDailyQuest>;
  onBegin: () => void;
}) {
  return (
    <div>
      <div className="text-center">
        <h2 className="font-display text-[1.75rem] leading-tight text-graphite">
          Your first journey, {name}
        </h2>
        <p className="mt-2 text-[0.9375rem] text-ash">
          Here is today. Begin whenever you’re ready.
        </p>
      </div>
      <div className="mt-6 space-y-4">
        <VerseCard verse={verse} />
        {quest && <QuestSlip quest={quest} />}
        <PaperCard variant="quiet" padding="md">
          <p className="text-[0.9375rem] italic text-charcoal">
            “{quest?.prayerPrompt ?? "Lord, meet me in this quiet moment."}”
          </p>
        </PaperCard>
      </div>
      <GentleButton
        variant="dark"
        size="lg"
        fullWidth
        className="mt-6"
        onClick={onBegin}
      >
        Begin today’s journey
      </GentleButton>
    </div>
  );
}

export function OnboardingFlow() {
  return (
    <ClientOnly
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-parchment">
          <PixelIcon name="candle" size={8} animate />
        </div>
      }
    >
      <OnboardingInner />
    </ClientOnly>
  );
}
