"use client";

/**
 * First-run guide. Account access comes first, then concise product explainers,
 * one active quest, and an optional Plus invitation.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useQuestOS } from "@/lib/questos/store";
import { useSession } from "@/lib/supabase/useSession";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { GentleButton } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import {
  PixelMascot,
  type PixelMascotName,
} from "@/components/design-system/PixelMascot";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { SignInMethods } from "@/components/account/SignInMethods";
import { QuestSlip } from "@/components/quests/QuestSlip";
import {
  LEGAL_DOCUMENTS,
  LegalSummary,
  type LegalDocumentKind,
} from "@/components/legal/LegalSummary";
import { selectSuggestedQuests } from "@/lib/questos/quest-engine";
import { seedQuests } from "@/data/seed/quests";
import { getCurrentSeason } from "@/lib/questos/seasonal-engine";
import { toDateKey } from "@/lib/utils/dates";
import { track } from "@/lib/analytics/events";
import { authFailureMessage, type AuthFailureReason } from "@/lib/auth/errors";
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
}

const ACCOUNT_STEP = 0;
const NAME_STEP = 1;
const WELCOME_STEP = 2;
const DENOMINATIONS_STEP = 3;
const HOME_STEP = 4;
const QUESTS_STEP = 5;
const BIBLE_STEP = 6;
const PRAYER_STEP = 7;
const FIRST_QUEST_STEP = 8;
const PLUS_STEP = 9;
const TOTAL_STEPS = PLUS_STEP + 1;

const STEP_HEADING_ID = "onboarding-step-heading";

// Uses animated companions only in onboarding while preserving static mascots elsewhere.
const ONBOARDING_MASCOT_ANIMATIONS: Partial<Record<PixelMascotName, string>> = {
  lamb: "/pixel/mascot-lamb-walk.gif",
  campfire: "/pixel/mascot-campfire-burn.gif",
};

// Uses retained stills only, giving the guide a taste of app artwork without video cost.
const STEP_BACKGROUNDS: Partial<Record<number, string>> = {
  [WELCOME_STEP]: "/wallpapers/01-let-there-be-light/poster.webp",
  [DENOMINATIONS_STEP]: "/wallpapers/the-olive-grove/poster.webp",
  [HOME_STEP]: "/wallpapers/galilee-be-still/poster.webp",
  [QUESTS_STEP]: "/wallpapers/the-sheltering-tree/poster.webp",
  [BIBLE_STEP]: "/wallpapers/12-baptism-in-the-jordan/poster.webp",
  [PRAYER_STEP]: "/wallpapers/20-empty-tomb-at-dawn/poster.webp",
};

function OnboardingInner({
  authFailure,
}: {
  authFailure: AuthFailureReason | null;
}) {
  const router = useRouter();
  const { user, configured } = useSession();
  const completeOnboarding = useQuestOS((state) => state.completeOnboarding);
  const pickQuest = useQuestOS((state) => state.pickQuest);
  const markAccountNudgeShown = useQuestOS(
    (state) => state.markAccountNudgeShown,
  );
  const profile = useQuestOS((state) => state.profile);
  const alreadyDone = profile?.onboardingCompleted ?? false;
  const resumeStage = getOnboardingResumeStage();
  const continuingPlus = alreadyDone && resumeStage === "plus";
  const [step, setStep] = useState(() =>
    continuingPlus ? PLUS_STEP : user ? NAME_STEP : ACCOUNT_STEP,
  );
  const [draft, setDraft] = useState<Draft>(() => ({
    displayName: profile?.displayName === "friend" ? "" : profile?.displayName ?? "",
  }));
  const [legalDocument, setLegalDocument] =
    useState<LegalDocumentKind | null>(null);
  const hasNavigated = useRef(false);
  // Separate session hooks can settle one render apart; derive the safe entry
  // screen so a restored account never sees the account form a second time.
  const visibleStep =
    step === ACCOUNT_STEP &&
    shouldAdvanceOnboardingAccountStep(alreadyDone, user?.id ?? null)
      ? NAME_STEP
      : step;
  const background = STEP_BACKGROUNDS[visibleStep];

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
        quests: seedQuests,
        dateKey: toDateKey(),
        profile: {
          displayName: draft.displayName.trim() || "friend",
          onboardingCompleted: false,
          createdAt: new Date(0).toISOString(),
        },
        settings: DEFAULT_SETTINGS,
        season: getCurrentSeason().key,
        recentSlugs: [],
        count: 1,
      })[0] ?? null,
    [draft.displayName],
  );

  // Moves between guide pages while preserving predictable focus behavior.
  function goTo(nextStep: number) {
    hasNavigated.current = true;
    setStep(Math.max(ACCOUNT_STEP, Math.min(nextStep, PLUS_STEP)));
  }

  // Commits only fields the revised guide actually asks for.
  function saveProfile() {
    completeOnboarding({
      displayName: draft.displayName.trim() || "friend",
    });
  }

  // Starts a local guide even when account services are unavailable or declined.
  function continueWithoutAccount() {
    setOnboardingResumeStage("guide");
    goTo(NAME_STEP);
  }

  // Adds the suggested quest before showing the optional membership invitation.
  function startFirstQuest() {
    setOnboardingResumeStage("plus");
    if (!alreadyDone) saveProfile();
    if (suggestedQuest) pickQuest(suggestedQuest.slug);
    markAccountNudgeShown("onboarding");
    goTo(PLUS_STEP);
  }

  // Finalizes a safe app destination and clears the onboarding hand-off in the app gate.
  function finish(destination: "/app" | "/app/plus") {
    if (!alreadyDone) saveProfile();
    markAccountNudgeShown("onboarding");
    setOnboardingResumeStage(
      destination === "/app/plus" ? "launch_plus" : "launch",
    );
    router.replace(destination);
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex min-h-dvh flex-col overflow-hidden bg-parchment px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-safe">
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

        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-valuenow={visibleStep + 1}
          aria-valuetext={`Step ${visibleStep + 1} of ${TOTAL_STEPS}`}
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

        <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={visibleStep}
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
              {visibleStep === ACCOUNT_STEP && (
                <StepAccount
                  accountEnabled={configured}
                  authFailure={authFailure}
                  onContinue={continueWithoutAccount}
                  onOpenLegal={setLegalDocument}
                />
              )}
              {visibleStep === NAME_STEP && (
                <StepName
                  name={draft.displayName}
                  onName={(displayName) => setDraft({ displayName })}
                  onNext={() => {
                    setOnboardingResumeStage("guide");
                    goTo(WELCOME_STEP);
                  }}
                />
              )}
              {visibleStep === WELCOME_STEP && (
                <StepGuide
                  mascot="lamb"
                  eyebrow="Welcome to BibleQuest"
                  title="Your daily guide to living your faith"
                  body="Come as you are. BibleQuest helps you make space for Scripture, prayer, and one meaningful step each day."
                  points={[
                    "A clear daily rhythm, not another noisy feed",
                    "Gentle progress that reflects practice, not perfection",
                  ]}
                  onNext={() => goTo(DENOMINATIONS_STEP)}
                />
              )}
              {visibleStep === DENOMINATIONS_STEP && (
                <StepGuide
                  mascot="dove"
                  eyebrow="A wide-open welcome"
                  title="Made for Christians across denominations"
                  body="BibleQuest does not ask you to fit into a label. It keeps the focus on Scripture and everyday faith while respecting traditions where Christians differ."
                  points={[
                    "Multiple Bible editions with clear attribution",
                    "Language designed to welcome new and lifelong believers",
                  ]}
                  onNext={() => goTo(HOME_STEP)}
                />
              )}
              {visibleStep === HOME_STEP && (
                <StepGuide
                  mascot="lantern"
                  eyebrow="Home"
                  title="A calm place to begin each day"
                  body="Your Home brings today’s verse, your active quests, and a simple invitation to pray or reflect into one clear view."
                  points={[
                    "A daily verse chosen for your journey",
                    "Your next faithful steps, easy to find",
                  ]}
                  onNext={() => goTo(QUESTS_STEP)}
                />
              )}
              {visibleStep === QUESTS_STEP && (
                <StepGuide
                  mascot="map"
                  eyebrow="Quests"
                  title="Turn faith into something you can live"
                  body="Quests are reviewed, practical invitations to serve, pray, read, forgive, give, or slow down."
                  points={[
                    "Choose what fits your real day",
                    "Keep active quests close until you are ready",
                  ]}
                  onNext={() => goTo(BIBLE_STEP)}
                />
              )}
              {visibleStep === BIBLE_STEP && (
                <StepGuide
                  mascot="scroll"
                  eyebrow="Bible"
                  title="Read Scripture without losing your place"
                  body="Move through the full Bible, choose from available editions, save verses, and return to recent passages whenever you need them."
                  points={[
                    "World English Bible works offline",
                    "Bookmarks and reading progress stay with your journey",
                  ]}
                  onNext={() => goTo(PRAYER_STEP)}
                />
              )}
              {visibleStep === PRAYER_STEP && (
                <StepGuide
                  mascot="campfire"
                  eyebrow="Prayer and Journey"
                  title="Keep what matters close"
                  body="Write private prayers and reflections, revisit answered prayers, and watch your Journey grow from the practices you choose."
                  points={[
                    "Your writing stays out of analytics",
                    "You can export or clear your data in Settings",
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
              {visibleStep === PLUS_STEP && (
                <StepPlus
                  onExplore={() => finish("/app/plus")}
                  onSkip={() => finish("/app")}
                />
              )}
            </motion.div>
          </AnimatePresence>
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
      </div>
    </MotionConfig>
  );
}

// Keeps one centered brand companion above each onboarding heading.
function StepMascot({
  name,
  size = 8,
}: {
  name: PixelMascotName;
  size?: number;
}) {
  return (
    <motion.div variants={riseIn} initial="hidden" animate="visible" className="mb-4">
      <PixelMascot
        name={name}
        src={ONBOARDING_MASCOT_ANIMATIONS[name]}
        size={size}
      />
    </motion.div>
  );
}

function StepAccount({
  accountEnabled,
  authFailure,
  onContinue,
  onOpenLegal,
}: {
  accountEnabled: boolean;
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
        <StepMascot name="key" size={7} />
        <p className="text-caption uppercase tracking-[0.16em] text-accent">
          Get BibleQuest
        </p>
        <h1
          id={STEP_HEADING_ID}
          tabIndex={-1}
          className="mt-1.5 font-display text-[1.75rem] leading-tight text-graphite outline-none"
        >
          {intent === "create"
            ? "Create your free account"
            : "Welcome back"}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-small leading-relaxed text-charcoal">
          {intent === "create"
            ? "Keep your journey with you across devices. Your private writing stays out of analytics."
            : "Sign in and we’ll restore your saved journey before opening the app."}
        </p>
      </div>

      {authFailure && (
        <div className="mt-4">
          <CallbackFailureNotice reason={authFailure} />
        </div>
      )}

      {accountEnabled ? (
        <PaperCard variant="paper" padding="md" className="mt-5">
          <SignInMethods
            source="onboarding"
            nextPath="/onboarding"
            intent={intent}
            onUnavailable={() => setAuthUnavailable(true)}
          />
        </PaperCard>
      ) : (
        <PaperCard variant="linen" padding="md" className="mt-5 text-center">
          <p className="text-small leading-relaxed text-charcoal">
            Account sign-in is unavailable here. BibleQuest still works on this
            device.
          </p>
        </PaperCard>
      )}

      {accountEnabled && (
        <button
          type="button"
          className="mt-3 min-h-11 w-full text-small text-accent underline underline-offset-4"
          onClick={() =>
            setIntent((current) =>
              current === "create" ? "signin" : "create",
            )
          }
        >
          {intent === "create"
            ? "Already have an account? Sign in"
            : "New to BibleQuest? Create an account"}
        </button>
      )}

      {(authUnavailable || !accountEnabled) && (
        <p className="mt-1 text-center text-caption leading-relaxed text-ash">
          Your setup can stay safely on this device until account access is
          available.
        </p>
      )}

      <GentleButton
        variant="ghost"
        size="sm"
        fullWidth
        className="mt-2 text-ash"
        onClick={onContinue}
      >
        Continue without an account
      </GentleButton>
      <div className="mt-3 text-center">
        <LegalLinks onOpen={onOpenLegal} />
      </div>
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
      <StepMascot name="lamb" size={9} />
      <h1
        id={STEP_HEADING_ID}
        tabIndex={-1}
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
  mascot: PixelMascotName;
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
        <StepMascot name={mascot} size={7} />
        <p className="text-caption uppercase tracking-[0.16em] text-accent">
          {eyebrow}
        </p>
        <h2
          id={STEP_HEADING_ID}
          tabIndex={-1}
          className="mt-1.5 font-display text-[1.625rem] leading-tight text-graphite outline-none"
        >
          {title}
        </h2>
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
        <StepMascot name="sprout" size={7} />
        <p className="text-caption uppercase tracking-[0.16em] text-accent">
          Your first step
        </p>
        <h2
          id={STEP_HEADING_ID}
          tabIndex={-1}
          className="mt-1.5 font-display text-[1.5rem] leading-snug text-graphite outline-none"
        >
          Start your journey, {name}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-small leading-relaxed text-ash">
          We picked one gentle quest for today. Starting it adds it to your
          active quests.
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
        {quest ? "Start with this quest" : "Continue to BibleQuest"}
      </GentleButton>
    </div>
  );
}

function StepPlus({
  onExplore,
  onSkip,
}: {
  onExplore: () => void;
  onSkip: () => void;
}) {
  return (
    <PaperCard variant="atmospheric" padding="lg" className="text-center">
      <motion.div
        variants={riseIn}
        initial="hidden"
        animate="visible"
        className="mb-4 flex justify-center"
      >
        <PixelIcon name="crown" size={8} />
      </motion.div>
      <p className="text-caption uppercase tracking-[0.16em] text-gilt">
        BibleQuest Plus
      </p>
      <h2
        id={STEP_HEADING_ID}
        tabIndex={-1}
        className="mt-1.5 font-display text-[1.625rem] leading-tight text-graphite outline-none"
      >
        More room to go deeper
      </h2>
      <p className="mt-3 text-small leading-relaxed text-charcoal">
        The heart of BibleQuest stays free. Plus adds unlimited active quests,
        every wallpaper, and more ways to find the right next step.
      </p>
      <GentleButton
        variant="primary"
        size="lg"
        fullWidth
        className="mt-6"
        onClick={onExplore}
      >
        Explore BibleQuest Plus
      </GentleButton>
      <GentleButton
        variant="ghost"
        size="sm"
        fullWidth
        className="mt-2 text-ash"
        onClick={onSkip}
      >
        Not now
      </GentleButton>
    </PaperCard>
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
          <PixelMascot name="lantern" size={7} />
        </div>
      }
    >
      <OnboardingInner authFailure={authFailure} />
    </ClientOnly>
  );
}
