"use client";

/**
 * First-run guide. Account access comes first, followed by a compact orientation
 * and one deliberately gentle starter quest.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MotionConfig, motion } from "framer-motion";
import { useQuestOS } from "@/lib/questos/store";
import { useSession } from "@/lib/supabase/useSession";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { GentleButton } from "@/components/design-system/GentleButton";
import { IconCheck } from "@/components/design-system/icons";
import { LANGUAGES } from "@/lib/i18n";
import {
  FEATURED_TRANSLATIONS,
  featuredBibleTranslationOptions,
} from "@/lib/bible/translations";
import { cn } from "@/lib/utils/cn";
import { PaperCard } from "@/components/design-system/PaperCard";
import {
  ArtMascot,
  type ArtMascotName,
} from "@/components/design-system/ArtMascot";
import { WheelPicker } from "@/components/design-system/WheelPicker";
import { SignInMethods } from "@/components/account/SignInMethods";
import { AccountIntentPicker } from "@/components/account/AccountIntentPicker";
import { QuestSlip } from "@/components/quests/QuestSlip";
import {
  LEGAL_DOCUMENTS,
  LegalSummary,
  type LegalDocumentKind,
} from "@/components/legal/LegalSummary";
import { selectSuggestedQuests } from "@/lib/questos/quest-engine";
import { seedQuests } from "@/data/seed/quests";
import { onboardingStarterQuests } from "@/lib/questos/onboarding-starter-quests";
import { getCurrentSeason } from "@/lib/questos/seasonal-engine";
import { toDateKey } from "@/lib/utils/dates";
import { track } from "@/lib/analytics/events";
import { authFailureMessage, type AuthFailureReason } from "@/lib/auth/errors";
import { accountSyncAvailable } from "@/lib/sync/containment";
import {
  getOnboardingResumeStage,
  setOnboardingResumeStage,
  shouldAdvanceOnboardingAccountStep,
  shouldTrackOnboardingStarted,
} from "@/lib/auth/onboarding-resume";
import { riseIn, stepTransition } from "@/lib/motion";
import { DEFAULT_SETTINGS } from "@/lib/questos/types";
import type { QuestTemplate } from "@/lib/questos/types";

interface Draft {
  displayName: string;
  /** UI-chrome language. */
  language: string;
  /** Key of the Scripture edition to open the Bible in. */
  bibleTranslation: string;
}

const ACCOUNT_STEP = 0;
const NAME_STEP = 1;
// Asked right after the name, while a reader is still filling in who they are,
// so the very first screen of the app is already in their language rather than
// in English until they find Settings.
const LANGUAGE_STEP = 2;
const DAILY_RHYTHM_STEP = 3;
const PRACTICES_STEP = 4;
const FIRST_QUEST_STEP = 5;
const TOTAL_STEPS = FIRST_QUEST_STEP + 1;

const STEP_HEADING_ID = "onboarding-step-heading";

// Gives screen-reader users a concise step change without moving visible focus.
const STEP_ANNOUNCEMENTS: Record<number, string> = {
  [ACCOUNT_STEP]: "Account options",
  [NAME_STEP]: "Your name",
  [LANGUAGE_STEP]: "Language and Bible edition",
  [DAILY_RHYTHM_STEP]: "A calm daily rhythm",
  [PRACTICES_STEP]: "Scripture, prayer, and growth",
  [FIRST_QUEST_STEP]: "Your first quest",
};

// Uses retained stills only, giving the compact guide a taste of app artwork.
const STEP_BACKGROUNDS: Partial<Record<number, string>> = {
  [DAILY_RHYTHM_STEP]: "/wallpapers/galilee-be-still/poster.webp",
  [PRACTICES_STEP]: "/wallpapers/20-empty-tomb-at-dawn/poster.webp",
};

// The starter catalogue is reviewed separately from the wider suggestion shelf.
const STARTER_QUESTS = onboardingStarterQuests(seedQuests);

function OnboardingInner({
  authFailure,
}: {
  authFailure: AuthFailureReason | null;
}) {
  const router = useRouter();
  const { user, configured, loading: accountLoading } = useSession();
  const completeOnboarding = useQuestOS((state) => state.completeOnboarding);
  const pickQuest = useQuestOS((state) => state.pickQuest);
  const markAccountNudgeShown = useQuestOS(
    (state) => state.markAccountNudgeShown,
  );
  const profile = useQuestOS((state) => state.profile);
  const updateSettings = useQuestOS((state) => state.updateSettings);
  const alreadyDone = profile?.onboardingCompleted ?? false;
  const resumeStage = getOnboardingResumeStage();
  const [step, setStep] = useState(() =>
    user ? NAME_STEP : ACCOUNT_STEP,
  );
  const settings = useQuestOS((state) => state.settings);
  const [draft, setDraft] = useState<Draft>(() => ({
    displayName: profile?.displayName === "friend" ? "" : profile?.displayName ?? "",
    // The browser already knows; offering its answer first means most readers
    // confirm rather than hunt through nineteen languages.
    language: settings.language ?? preferredBrowserLanguage(),
    bibleTranslation: settings.preferredBibleTranslation,
  }));
  const [legalDocument, setLegalDocument] =
    useState<LegalDocumentKind | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  // Separate session hooks can settle one render apart; derive the safe entry
  // screen so a restored account never sees the account form a second time.
  const visibleStep =
    step === ACCOUNT_STEP &&
    shouldAdvanceOnboardingAccountStep(alreadyDone, user?.id ?? null)
      ? NAME_STEP
      : step;
  const background = STEP_BACKGROUNDS[visibleStep];

  // Opens each guide page at its top after a longer previous step was scrolled.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [visibleStep]);

  useEffect(() => {
    if (alreadyDone) return;
    setOnboardingResumeStage(user ? "guide" : "account");
  }, [alreadyDone, user]);

  useEffect(() => {
    if (shouldTrackOnboardingStarted(alreadyDone, resumeStage)) {
      track("onboarding_started");
    }
  }, [alreadyDone, resumeStage]);

  const suggestedQuest = useMemo<QuestTemplate | null>(
    () =>
      selectSuggestedQuests({
        quests: STARTER_QUESTS,
        dateKey: toDateKey(),
        profile: {
          displayName: "friend",
          onboardingCompleted: false,
          createdAt: new Date(0).toISOString(),
        },
        settings: DEFAULT_SETTINGS,
        season: getCurrentSeason().key,
        recentSlugs: [],
        count: 1,
      })[0] ?? null,
    [],
  );

  // Moves between the bounded guide pages without allowing an invalid stage.
  function goTo(nextStep: number) {
    setStep(Math.max(ACCOUNT_STEP, Math.min(nextStep, FIRST_QUEST_STEP)));
  }

  // Commits only fields the revised guide actually asks for.
  function saveProfile() {
    completeOnboarding({
      displayName: draft.displayName.trim() || "friend",
    });
    updateSettings({
      language: draft.language,
      preferredBibleTranslation: draft.bibleTranslation,
    });
  }

  // Starts a local guide even when account services are unavailable or declined.
  function continueWithoutAccount() {
    setOnboardingResumeStage("guide");
    goTo(NAME_STEP);
  }

  // Adds the suggested quest and opens the free daily experience immediately.
  function startFirstQuest() {
    if (!alreadyDone) saveProfile();
    if (suggestedQuest) pickQuest(suggestedQuest.slug);
    markAccountNudgeShown("onboarding");
    setOnboardingResumeStage("launch");
    router.replace("/app");
  }

  return (
    <MotionConfig reducedMotion="user">
      <main
        ref={mainRef}
        className="relative flex min-h-dvh flex-col overflow-x-hidden overflow-y-auto bg-parchment px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-safe"
      >
        {background && (
          <>
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${background})` }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-b from-dusk/45 via-dusk/25 to-dusk/55"
            />
          </>
        )}

        <p aria-live="polite" aria-atomic="true" className="sr-only">
          {`Step ${visibleStep + 1} of ${TOTAL_STEPS}: ${STEP_ANNOUNCEMENTS[visibleStep]}`}
        </p>

        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-valuenow={visibleStep + 1}
          aria-valuetext={`Step ${visibleStep + 1} of ${TOTAL_STEPS}`}
          aria-label="Onboarding progress"
          className="relative z-10 mx-auto flex w-full max-w-md items-center justify-center gap-1.5 pt-6"
        >
          {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
            <span
              key={index}
              aria-hidden="true"
              className={`h-1.5 rounded-full transition-all duration-500 ${
                index === visibleStep
                  ? background
                    ? "w-6 bg-paper"
                    : "w-6 bg-accent"
                  : index < visibleStep
                    ? background
                      ? "w-1.5 bg-paper/55"
                      : "w-1.5 bg-accent/40"
                    : background
                      ? "w-1.5 bg-paper/30"
                      : "w-1.5 bg-mist"
              }`}
            />
          ))}
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-start py-6 [@media(min-height:700px)]:justify-center [@media(min-height:700px)]:py-5">
          {/* Enter-only, and deliberately not wrapped in `AnimatePresence`.
              With `mode="wait"` the outgoing step has to finish exiting before
              the next one may mount, and when that completion never arrived the
              guide stripped to a blank screen: the progress dots advanced, the
              old step sat at opacity 0, and the new one never mounted. Keying a
              plain `motion.div` gives the same cross-fade with nothing to wait
              on. Same fix, same reason, as the arcade hub. */}
          <div>
            <motion.div
              key={visibleStep}
              variants={stepTransition}
              initial="enter"
              animate="center"
            >
              {visibleStep === ACCOUNT_STEP && (
                <StepAccount
                  accountEnabled={accountSyncAvailable(configured)}
                  accountLoading={accountLoading}
                  authFailure={authFailure}
                  onContinue={continueWithoutAccount}
                  onOpenLegal={setLegalDocument}
                />
              )}
              {visibleStep === NAME_STEP && (
                <StepName
                  name={draft.displayName}
                  onName={(displayName) =>
                    setDraft((current) => ({ ...current, displayName }))
                  }
                  onNext={() => {
                    setOnboardingResumeStage("guide");
                    goTo(LANGUAGE_STEP);
                  }}
                />
              )}
              {visibleStep === LANGUAGE_STEP && (
                <StepLanguage
                  language={draft.language}
                  bibleTranslation={draft.bibleTranslation}
                  onLanguage={(language) =>
                    setDraft((current) => ({ ...current, language }))
                  }
                  onBibleTranslation={(bibleTranslation) =>
                    setDraft((current) => ({ ...current, bibleTranslation }))
                  }
                  onNext={() => goTo(DAILY_RHYTHM_STEP)}
                />
              )}
              {visibleStep === DAILY_RHYTHM_STEP && (
                <StepGuide
                  mascot="lantern"
                  eyebrow="Welcome to BibleQuest"
                  title="A calm daily rhythm"
                  body="Come as you are. Today keeps Scripture and one meaningful quest close without turning faith into another noisy feed."
                  points={[
                    "Your daily verse and next faithful step stay easy to find",
                    "Christians across denominations — and people exploring faith — are welcome",
                  ]}
                  onNext={() => goTo(PRACTICES_STEP)}
                />
              )}
              {visibleStep === PRACTICES_STEP && (
                <StepGuide
                  mascot="campfire"
                  eyebrow="Bible, Prayer, and Journey"
                  title="Keep what matters close"
                  body="Read Scripture, choose practical quests, write private prayers or reflections, and watch your Journey grow from the practices you choose."
                  points={[
                    "Your private writing stays out of analytics",
                    "You can export or clear your data from Settings",
                  ]}
                  onNext={() => {
                    setOnboardingResumeStage("quest");
                    goTo(FIRST_QUEST_STEP);
                  }}
                  footer={
                    <LegalLinks onOpen={setLegalDocument} />
                  }
                />
              )}
              {visibleStep === FIRST_QUEST_STEP && (
                <StepFirstQuest
                  name={draft.displayName.trim() || "friend"}
                  quest={suggestedQuest}
                  onStart={startFirstQuest}
                />
              )}
            </motion.div>
          </div>
        </div>

        <div className="relative z-10 mx-auto flex min-h-11 w-full max-w-md items-center">
          {visibleStep > NAME_STEP && visibleStep < FIRST_QUEST_STEP ? (
            <button
              type="button"
              onClick={() => goTo(visibleStep - 1)}
              className={`min-h-11 text-small underline-offset-4 hover:underline ${
                background ? "text-paper" : "text-ash hover:text-charcoal"
              }`}
            >
              Back
            </button>
          ) : visibleStep === NAME_STEP && !user ? (
            <button
              type="button"
              onClick={() => goTo(ACCOUNT_STEP)}
              className="min-h-11 text-small text-ash underline-offset-4 hover:text-charcoal hover:underline"
            >
              Back
            </button>
          ) : null}
        </div>

        {legalDocument && (
          <LegalDialog
            kind={legalDocument}
            onClose={() => setLegalDocument(null)}
          />
        )}
      </main>
    </MotionConfig>
  );
}

// Keeps one centered brand companion above each onboarding heading.
function StepMascot({
  name,
  size = 160,
  className,
}: {
  /** Rendered edge in CSS pixels, same units as `ArtMascot`. */
  name: ArtMascotName;
  size?: number;
  className?: string;
}) {
  return (
    <motion.div
      variants={riseIn}
      initial="hidden"
      animate="visible"
      className={cn("mb-4", className)}
    >
      <ArtMascot name={name} size={size} priority />
    </motion.div>
  );
}

function StepAccount({
  accountEnabled,
  accountLoading,
  authFailure,
  onContinue,
  onOpenLegal,
}: {
  accountEnabled: boolean;
  accountLoading: boolean;
  authFailure: AuthFailureReason | null;
  onContinue: () => void;
  onOpenLegal: (kind: LegalDocumentKind) => void;
}) {
  const [intent, setIntent] = useState<"create" | "signin">(
    authFailure ? "signin" : "create",
  );
  const [authUnavailable, setAuthUnavailable] = useState(
    authFailure === "configuration",
  );

  return (
    <div>
      <div className="text-center">
        <StepMascot name="key" size={144} />
        <p className="text-caption uppercase tracking-[0.16em] text-accent">
          Open BibleQuest
        </p>
        <h1
          id={STEP_HEADING_ID}
          className="mt-1.5 font-display text-[1.75rem] leading-tight text-graphite outline-none"
        >
          {accountLoading
            ? "Checking account access"
            : !accountEnabled
            ? "Begin your journey"
            : intent === "create"
              ? "Create your free account"
              : "Welcome back"}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-small leading-relaxed text-charcoal">
          {accountLoading
            ? "You can continue on this device now, or wait a moment for account options."
            : !accountEnabled
            ? "Your BibleQuest journey stays on this device and can be exported from Settings."
            : intent === "create"
              ? "Keep your journey with you across devices. Your private writing stays out of analytics."
              : "Sign in and we’ll restore your saved journey before opening the app."}
        </p>
      </div>

      {authFailure && (
        <div className="mt-4">
          <CallbackFailureNotice reason={authFailure} />
        </div>
      )}

      {accountLoading ? (
        <PaperCard variant="linen" padding="md" className="mt-5 text-center">
          <p role="status" className="text-small leading-relaxed text-charcoal">
            Checking secure account access…
          </p>
        </PaperCard>
      ) : accountEnabled ? (
        <>
          <AccountIntentPicker
            intent={intent}
            onIntentChange={setIntent}
            className="mt-5"
          />
          <PaperCard variant="paper" padding="md" className="mt-3">
            <SignInMethods
              key={intent}
              source="onboarding"
              nextPath="/onboarding"
              intent={intent}
              onUnavailable={() => setAuthUnavailable(true)}
            />
          </PaperCard>
          {intent === "signin" && (
            <p className="mt-3 text-center text-caption leading-relaxed text-ash">
              You’ll stay signed in securely on this device until you choose
              Sign out.
            </p>
          )}
        </>
      ) : (
        <PaperCard variant="linen" padding="md" className="mt-5 text-center">
          <p className="text-small leading-relaxed text-charcoal">
            Account sign-in is unavailable here. You can continue on this
            device.
          </p>
        </PaperCard>
      )}

      {authUnavailable && accountEnabled && (
        <p className="mt-1 text-center text-caption leading-relaxed text-ash">
          Account access couldn’t load. Continue on this device and try again
          later.
        </p>
      )}

      {/* Local-only mode has one viable path, so it receives primary emphasis;
          the same action stays secondary when account choices are available. */}
      <GentleButton
        variant={accountEnabled && !accountLoading ? "ghost" : "primary"}
        size={accountEnabled && !accountLoading ? "sm" : "lg"}
        fullWidth
        className={accountEnabled && !accountLoading ? "mt-2 text-ash" : "mt-4"}
        onClick={onContinue}
      >
        {accountEnabled && !accountLoading
          ? "Continue without an account"
          : "Continue on this device"}
      </GentleButton>
      <div className="mt-3 text-center">
        <LegalLinks onOpen={onOpenLegal} />
      </div>
    </div>
  );
}

/**
 * The browser's own preference, narrowed to a language BibleQuest speaks.
 *
 * Offering a likely answer first is the difference between confirming a choice
 * and hunting through nineteen of them. `navigator.languages` is ordered by
 * preference, so the first match wins; English is the fallback because it is
 * the source locale, not because it is likeliest.
 */
function preferredBrowserLanguage(): string {
  if (typeof navigator === "undefined") return "en";
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag?.toLowerCase().split("-")[0];
    const match = LANGUAGES.find((language) => language.code === base);
    if (match) return match.code;
  }
  return "en";
}

/**
 * Two questions on one screen: what BibleQuest should speak, and what Scripture
 * should be read in.
 *
 * They are genuinely separate — a reader may want the app in Spanish and the
 * King James in English, or the reverse — so this asks twice rather than
 * inferring the second from the first. Flags carry the recognition and the
 * endonym carries the meaning: a reader scanning for their own language finds
 * the flag first and confirms with the name, which is faster than reading
 * nineteen names in scripts they may not use.
 */
function StepLanguage({
  language,
  bibleTranslation,
  onLanguage,
  onBibleTranslation,
  onNext,
}: {
  language: string;
  bibleTranslation: string;
  onLanguage: (code: string) => void;
  onBibleTranslation: (key: string) => void;
  onNext: () => void;
}) {
  const editions = featuredBibleTranslationOptions(
    FEATURED_TRANSLATIONS,
    bibleTranslation,
  );
  const selectedLanguage = LANGUAGES.find(
    (option) => option.code === language,
  );
  const selectedEdition = editions.find(
    ({ translation }) => translation.key === bibleTranslation,
  )?.translation;

  return (
    <div className="text-center">
      {/* The mascot shrinks on short screens rather than disappearing: the
          step has to fit an iPhone SE without scrolling, but the artwork is
          brand, not decoration, so it is scaled, not dropped. */}
      <StepMascot name="dove" size={144} className="max-[700px]:hidden" />
      <StepMascot
        name="dove"
        size={88}
        className="hidden max-[700px]:block"
      />
      <h1
        id={STEP_HEADING_ID}
        className="font-display text-editorial text-graphite outline-none"
      >
        Choose your language and Bible
      </h1>
      <p className="mx-auto mt-2 max-w-xs text-small leading-relaxed text-ash">
        Both can be changed later in Settings, and they need not match.
      </p>

      <fieldset className="mt-5 min-w-0 text-start">
        <legend className="font-art-label text-[0.875rem] uppercase tracking-[0.06em] text-gilt">
          The app<span className="sr-only"> language</span>
        </legend>
        <WheelPicker
          name="onboarding-language"
          value={language}
          onChange={onLanguage}
          options={LANGUAGES.map((option) => ({
            value: option.code,
            // One flag, not two: 🇺🇸🇬🇧 beside "English" was the widest row
            // in the list and carried no more meaning than 🇺🇸 alone.
            mark: option.flags[0],
            label: option.endonym,
            lang: option.code,
            dir: option.dir,
            // Silent when the endonym already IS the English name, which is
            // where the duplicated "English / English" came from.
            gloss:
              option.english === option.endonym ? undefined : option.english,
          }))}
        />
        {/* Same predicate as the gloss above, so the two can never disagree.
            aria-hidden: the string is already in the radio's accessible
            name, and a live region here would double-announce per scroll. */}
        <p
          aria-hidden="true"
          className="mt-2 min-h-[1.0625rem] text-caption text-ash"
        >
          {selectedLanguage && selectedLanguage.english !== selectedLanguage.endonym
            ? selectedLanguage.english
            : ""}
        </p>
      </fieldset>

      <fieldset className="mt-4 min-w-0 text-start">
        <legend className="font-art-label text-[0.875rem] uppercase tracking-[0.06em] text-gilt">
          The Bible<span className="sr-only"> edition</span>
        </legend>
        {/* Chips, not rows. Three identical 🇺🇸🇬🇧 pairs stacked over three
            English abbreviations was the same redundancy again; the caption
            below carries the full name and language instead. */}
        <div className="mt-2 flex flex-wrap gap-2">
          {editions.map(({ translation, disabled }) => {
            const checked = bibleTranslation === translation.key;
            return (
              <label key={translation.key} className="min-w-0">
                <input
                  type="radio"
                  name="onboarding-bible"
                  value={translation.key}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onBibleTranslation(translation.key)}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-[var(--radius-button)] border border-mist px-4 text-small text-charcoal transition-colors",
                    "peer-checked:border-accent/60 peer-checked:bg-accent-surface peer-checked:text-graphite",
                    "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                    disabled
                      ? "cursor-not-allowed opacity-45"
                      : "cursor-pointer hover:border-accent/40",
                  )}
                >
                  {translation.abbreviation}
                  {/* Visible text is a prefix of the accessible name. */}
                  <span className="sr-only">{translation.name}</span>
                  {checked && <IconCheck size={14} className="text-accent" />}
                </span>
              </label>
            );
          })}
        </div>
        <p aria-hidden="true" className="mt-2 text-caption text-ash">
          {selectedEdition
            ? `${selectedEdition.name} · ${selectedEdition.languageNameLocal}`
            : ""}
          {editions.some(({ disabled }) => disabled)
            ? " · Greyed editions need a publisher connection BibleQuest does not have yet."
            : ""}
        </p>
      </fieldset>

      <GentleButton variant="primary" size="lg" fullWidth className="mt-6" onClick={onNext}>
        Continue
      </GentleButton>
    </div>
  );
}

function StepName({
  name,
  onName,
  onNext,
}: {
  name: string;
  onName: (value: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="text-center">
      <StepMascot name="lamb" size={192} />
      <h1
        id={STEP_HEADING_ID}
        className="font-display text-editorial text-graphite outline-none"
      >
        What should we call you?
      </h1>
      <p className="mx-auto mt-2 max-w-xs text-small leading-relaxed text-ash">
        A first name is enough. You can leave this blank and change it later.
      </p>
      <label htmlFor="onboarding-name" className="sr-only">
        First name
      </label>
      <input
        id="onboarding-name"
        value={name}
        onChange={(event) => onName(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && onNext()}
        placeholder="Your first name"
        autoComplete="given-name"
        maxLength={80}
        className="mt-7 w-full rounded-[var(--radius-button)] border border-mist bg-paper px-4 py-3 text-body text-graphite outline-none transition-colors focus:border-accent/50"
      />
      <GentleButton
        variant="primary"
        size="lg"
        fullWidth
        className="mt-5"
        onClick={onNext}
      >
        Continue
      </GentleButton>
    </div>
  );
}

function StepGuide({
  mascot,
  eyebrow,
  title,
  body,
  points,
  onNext,
  footer,
}: {
  mascot: ArtMascotName;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  onNext: () => void;
  footer?: React.ReactNode;
}) {
  return (
    <PaperCard variant="quiet" padding="lg" className="border-paper/50 bg-paper/90 backdrop-blur-md">
      <div className="text-center">
        <StepMascot name={mascot} size={144} />
        <p className="text-caption uppercase tracking-[0.16em] text-accent">
          {eyebrow}
        </p>
        <h1
          id={STEP_HEADING_ID}
          className="mt-1.5 font-display text-[1.625rem] leading-tight text-graphite outline-none"
        >
          {title}
        </h1>
        <p className="mt-3 text-small leading-relaxed text-charcoal">{body}</p>
      </div>
      <ul className="mt-5 space-y-2.5">
        {points.map((point) => (
          <li
            key={point}
            className="flex gap-2.5 text-small leading-relaxed text-charcoal"
          >
            <span
              aria-hidden="true"
              className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
            />
            {point}
          </li>
        ))}
      </ul>
      <GentleButton
        variant="primary"
        size="lg"
        fullWidth
        className="mt-6"
        onClick={onNext}
      >
        Next
      </GentleButton>
      {footer && <div className="mt-3 text-center">{footer}</div>}
    </PaperCard>
  );
}

function StepFirstQuest({
  name,
  quest,
  onStart,
}: {
  name: string;
  quest: QuestTemplate | null;
  onStart: () => void;
}) {
  return (
    <div>
      <div className="text-center">
        <StepMascot name="sprout" size={144} />
        <p className="text-caption uppercase tracking-[0.16em] text-accent">
          Your first step
        </p>
        <h1
          id={STEP_HEADING_ID}
          className="mt-1.5 font-display text-[1.5rem] leading-snug text-graphite outline-none"
        >
          Start your journey, {name}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-small leading-relaxed text-ash">
          We picked one gentle quest for today. Choosing it places it in your
          Quests, ready whenever you are.
        </p>
      </div>
      {quest && (
        <div className="mt-5">
          <QuestSlip quest={quest} compact />
        </div>
      )}
      <GentleButton
        variant="primary"
        size="lg"
        fullWidth
        className="mt-5"
        onClick={onStart}
      >
        {quest ? "Add this quest to today" : "Continue to BibleQuest"}
      </GentleButton>
    </div>
  );
}

// Opens the full summaries in-place so first-run users do not lose guide progress.
function LegalDialog({
  kind,
  onClose,
}: {
  kind: LegalDocumentKind;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const legalCopy = LEGAL_DOCUMENTS[kind];

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-dialog-title"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-dusk/55 p-3 backdrop-blur-sm sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <PaperCard
        variant="paper"
        padding="none"
        className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4 border-b border-mist px-5 py-4">
          <div>
            <p className="text-caption uppercase tracking-[0.16em] text-accent">
              {legalCopy.eyebrow}
            </p>
            <h2
              id="legal-dialog-title"
              className="mt-1 font-display text-[1.375rem] text-graphite"
            >
              {legalCopy.title}
            </h2>
            <p className="mt-1 text-caption text-ash">
              Effective {legalCopy.effectiveDate}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-[var(--radius-button)] px-3 text-small text-accent underline underline-offset-4"
          >
            Close
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">
          <LegalSummary kind={kind} />
        </div>
      </PaperCard>
    </div>
  );
}

function LegalLinks({
  onOpen,
}: {
  onOpen: (kind: LegalDocumentKind) => void;
}) {
  return (
    <p className="text-caption leading-relaxed text-ash">
      By continuing, you agree to the{" "}
      <button
        type="button"
        className="text-accent underline underline-offset-4"
        onClick={() => onOpen("terms")}
      >
        Terms of Use
      </button>{" "}
      and acknowledge the{" "}
      <button
        type="button"
        className="text-accent underline underline-offset-4"
        onClick={() => onOpen("privacy")}
      >
        Privacy Policy
      </button>
      .
    </p>
  );
}

function CallbackFailureNotice({ reason }: { reason: AuthFailureReason }) {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-card)] border border-rose-300 px-4 py-3"
    >
      <p className="text-small leading-relaxed text-rose-700">
        {authFailureMessage(reason)}
      </p>
      <p className="mt-1 text-[0.6875rem] uppercase tracking-[0.08em] text-ash">
        Reference: AUTH-CALLBACK-{reason.replaceAll("_", "-")}
      </p>
    </div>
  );
}

export function OnboardingFlow({
  authFailure = null,
}: {
  authFailure?: AuthFailureReason | null;
}) {
  return (
    <ClientOnly
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-parchment">
          <ArtMascot name="lantern" size={176} />
        </div>
      }
    >
      <OnboardingInner authFailure={authFailure} />
    </ClientOnly>
  );
}
