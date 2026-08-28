"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuestOS } from "@/lib/questos/store";
import { useSession } from "@/lib/supabase/useSession";
import { retrySync } from "@/lib/sync/engine";
import { useSyncStatus } from "@/lib/sync/status";
import {
  getLastSyncedUserId,
  initialSyncIsPending,
  localDataBelongsToOtherUser,
  readLocalJourneyOwner,
} from "@/lib/sync/last-user";
import {
  accountRestorePhase,
  hasRecoverableLocalJourney,
  hasSafeLocalJourney,
} from "@/lib/sync/access";
import {
  clearOnboardingResumeStage,
  getOnboardingResumeStage,
  onboardingLaunchDestination,
  shouldKeepCompletedProfileOnOnboarding,
  shouldRedirectAppToOnboarding,
} from "@/lib/auth/onboarding-resume";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { AppLoadingScreen } from "@/components/app-shell/AppLoadingScreen";
import { ArtMascot } from "@/components/design-system/ArtMascot";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton } from "@/components/design-system/GentleButton";
import { accountSyncResetRequired } from "@/lib/sync/generation";
import { isNativeTarget } from "@/lib/platform/target";
import {
  AccountSignOutError,
  signOutExpectedAccount,
} from "@/lib/auth/account-sign-out";
import { SignInMethods } from "@/components/account/SignInMethods";
import {
  resumeInstallingWebSession,
  withLegacyWebPrivateGuestRecovery,
  withLockedLocalJourneyPrivateReset,
  withWebAccountOperationLock,
} from "@/lib/supabase/web-auth-storage";
import {
  adoptAmbiguousLegacyWebPrivateDataAsGuest,
  purgeAllWebPrivateDataNamespaces,
  purgeAmbiguousWebPrivateDataAndEstablishGuest,
} from "@/lib/storage/web-private-cutover";

/** Redirects stale web-only Plus hand-offs to the native app home. */
function safeLaunchDestination(stage: ReturnType<typeof getOnboardingResumeStage>) {
  const destination = onboardingLaunchDestination(stage);
  return isNativeTarget() && destination === "/app/plus"
    ? "/app"
    : destination;
}

/**
 * Sends first-time visitors to onboarding before the app opens. Renders a
 * calm holding state while the persisted store hydrates on the client.
 */
function Gate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const completed = useQuestOS((s) => s.profile?.onboardingCompleted ?? false);
  const resumeStage = getOnboardingResumeStage();
  const redirectToOnboarding = shouldRedirectAppToOnboarding(
    completed,
    resumeStage,
  );
  const launchDestination = safeLaunchDestination(resumeStage);
  const redirectToLaunch = Boolean(
    launchDestination && pathname !== launchDestination,
  );

  useEffect(() => {
    if (redirectToOnboarding) {
      router.replace("/onboarding");
      return;
    }
    // A completed profile makes any unfinished account/guide marker stale.
    // Clear it on app launch so a repaired PWA cannot carry the loop forward.
    if (completed && resumeStage && !launchDestination) {
      clearOnboardingResumeStage();
      return;
    }
    // A launch stage is written only by a first-quest CTA immediately before
    // its intentional app navigation. Account/quest never reach this line.
    if (launchDestination) {
      clearOnboardingResumeStage();
      if (redirectToLaunch) router.replace(launchDestination);
    }
  }, [
    completed,
    launchDestination,
    redirectToLaunch,
    redirectToOnboarding,
    resumeStage,
    router,
  ]);

  if (redirectToOnboarding || redirectToLaunch) return <LoadingVeil />;
  return <>{children}</>;
}

/** Keeps a restored account from flashing the first onboarding step. */
function OnboardingRouteGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const completed = useQuestOS((s) => s.profile?.onboardingCompleted ?? false);
  const resumeStage = getOnboardingResumeStage();
  const continuingOnboarding =
    !isNativeTarget() &&
    shouldKeepCompletedProfileOnOnboarding(completed, resumeStage);
  const launchDestination = safeLaunchDestination(resumeStage);

  useEffect(() => {
    if (completed && !continuingOnboarding) {
      clearOnboardingResumeStage();
      router.replace(launchDestination ?? "/app");
    }
  }, [completed, continuingOnboarding, launchDestination, router]);

  return completed && !continuingOnboarding ? (
    <LoadingVeil />
  ) : (
    <>{children}</>
  );
}

function LoadingVeil() {
  return <AppLoadingScreen />;
}

/** Offers a bounded retry without mounting or revealing account-owned data. */
function NativeSessionRecovery() {
  const [retrying, setRetrying] = useState(false);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-parchment px-5">
      <div className="w-full max-w-sm">
        <PaperCard variant="paper" padding="lg">
          <ArtMascot name="lantern" size={176} className="mb-4" />
          <h1 className="font-display text-[1.375rem] leading-snug text-graphite">
            Let’s finish signing you in
          </h1>
          <p role="alert" className="mt-2 text-small leading-relaxed text-charcoal">
            Your account is still private and nothing was replaced. BibleQuest
            couldn’t finish checking the saved sign-in just now.
          </p>
          <GentleButton
            variant="primary"
            size="md"
            fullWidth
            className="mt-5"
            disabled={retrying}
            aria-busy={retrying}
            onClick={() => {
              setRetrying(true);
              window.location.reload();
            }}
          >
            {retrying ? "Checking…" : "Try again"}
          </GentleButton>
          <p className="mt-3 text-caption leading-relaxed text-ash">
            If you’re offline, reconnect first. You won’t need another email
            code when the saved sign-in can be verified.
          </p>
        </PaperCard>
      </div>
    </div>
  );
}

/** Keeps provisional auth private while offering a bounded cutover retry. */
function InstallingAccountRecovery() {
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  async function retry(
    authorization:
      | "automatic"
      | "explicit-keep-local-journey"
      | "explicit-start-fresh",
  ) {
    if (working) return;
    setWorking(true);
    setFailed(false);
    try {
      const result = await withWebAccountOperationLock((handle) =>
        resumeInstallingWebSession(handle, authorization),
      );
      if (result === "activated") {
        window.location.reload();
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-parchment px-5">
      <div className="w-full max-w-sm">
        <PaperCard variant="paper" padding="lg">
          <ArtMascot name="lantern" size={176} className="mb-4" />
          <h1 className="font-display text-[1.375rem] leading-snug text-graphite">
            Finish securing this journey
          </h1>
          <p className="mt-2 text-small leading-relaxed text-charcoal">
            BibleQuest is keeping account progress hidden until this browser’s
            private storage is safely prepared.
          </p>
          <GentleButton
            variant="primary"
            size="md"
            fullWidth
            className="mt-5"
            disabled={working}
            onClick={() => void retry("automatic")}
          >
            {working ? "Checking…" : "Try again"}
          </GentleButton>
          <GentleButton
            variant="outline"
            size="md"
            fullWidth
            className="mt-2"
            disabled={working}
            onClick={() => void retry("explicit-keep-local-journey")}
          >
            Keep this device’s journey
          </GentleButton>
          <GentleButton
            variant="ghost"
            size="sm"
            fullWidth
            className="mt-2"
            disabled={working}
            onClick={() => void retry("explicit-start-fresh")}
          >
            Start fresh and clear this device
          </GentleButton>
          {failed && (
            <p role="alert" className="mt-3 text-caption text-rose-700">
              We couldn’t finish safely. Your journey is still locked; reconnect
              and retry.
            </p>
          )}
        </PaperCard>
      </div>
    </div>
  );
}

/** Exposes only reviewed recovery choices without mounting private descendants. */
function LockedLocalJourneyRecovery({ clearOnly = false }: { clearOnly?: boolean }) {
  const [clearing, setClearing] = useState(false);
  const [clearFailed, setClearFailed] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const ownerAtRender = readLocalJourneyOwner();
  const ownedJourney = ownerAtRender.status === "owned";

  async function keepAmbiguousJourney() {
    if (keeping || clearing || clearOnly || ownedJourney) return;
    setKeeping(true);
    setClearFailed(false);
    try {
      const complete = await withWebAccountOperationLock((handle) =>
        withLegacyWebPrivateGuestRecovery(
          handle,
          "explicit-keep",
          adoptAmbiguousLegacyWebPrivateDataAsGuest,
        ),
      );
      if (complete) {
        window.location.reload();
        return;
      }
      setClearFailed(true);
    } catch {
      setClearFailed(true);
    } finally {
      setKeeping(false);
    }
  }

  async function clearLockedJourney() {
    if (clearing || keeping) return;
    const owner = readLocalJourneyOwner();
    setClearing(true);
    setClearFailed(false);
    try {
      const complete = await withWebAccountOperationLock((handle) => {
        if (owner.status === "owned") {
          return withLockedLocalJourneyPrivateReset(
            handle,
            owner.userId,
            purgeAllWebPrivateDataNamespaces,
          );
        }
        return withLegacyWebPrivateGuestRecovery(
          handle,
          "explicit-clear",
          purgeAmbiguousWebPrivateDataAndEstablishGuest,
        );
      });
      if (complete) {
        window.location.reload();
        return;
      }
      setClearFailed(true);
    } catch {
      setClearFailed(true);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-parchment px-5 py-8">
      <div className="w-full max-w-sm space-y-4">
        <PaperCard variant="paper" padding="lg">
          <ArtMascot name="key" size={176} className="mb-4" />
          <h1 className="font-display text-[1.375rem] leading-snug text-graphite">
            {clearOnly
              ? "Finishing your clear"
              : ownedJourney
                ? "This journey belongs to an account"
                : "Is this your journey?"}
          </h1>
          <p className="mt-2 text-small leading-relaxed text-charcoal">
            {clearOnly
              ? "BibleQuest is finishing the private journey clear you requested. Its prayers and reflections stay hidden."
              : ownedJourney
                ? "Sign back in to restore the account that owns it, or clear the journey from this browser. Its prayers and reflections stay hidden."
                : "This browser holds a BibleQuest journey. Keep it if it’s yours, or clear it to start fresh. Its prayers and reflections stay hidden until you choose."}
          </p>
          {!clearOnly && !ownedJourney && (
            <GentleButton
              variant="outline"
              size="md"
              fullWidth
              className="mt-4"
              disabled={clearing || keeping}
              onClick={() => void keepAmbiguousJourney()}
            >
              {keeping ? "Securing…" : "Keep this local journey"}
            </GentleButton>
          )}
          <GentleButton
            variant="ghost"
            size="sm"
            fullWidth
            className={clearOnly || ownedJourney ? "mt-4" : "mt-2"}
            disabled={clearing || keeping}
            onClick={() => void clearLockedJourney()}
          >
            {clearing ? "Clearing…" : "Clear this browser’s journey"}
          </GentleButton>
          {clearFailed && (
            <p role="alert" className="mt-2 text-caption text-rose-700">
              Nothing was opened or replaced. Retry when browser storage is
              available.
            </p>
          )}
        </PaperCard>
        {!clearOnly && ownedJourney && (
          <PaperCard variant="paper" padding="lg">
            <SignInMethods source="account" intent="signin" />
          </PaperCard>
        )}
      </div>
    </div>
  );
}

function RestoreError({
  userId,
  canContinueLocally,
  onContinueLocally,
}: {
  userId: string;
  canContinueLocally: boolean;
  onContinueLocally: () => void;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine !== false,
  );

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(false);
    try {
      const result = await signOutExpectedAccount(userId);
      if (result.reloadRequired) {
        window.location.reload();
      }
    } catch (error) {
      setSigningOut(false);
      setSignOutError(true);
      if (
        error instanceof AccountSignOutError &&
        error.reloadRequired
      ) {
        window.location.reload();
      }
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-parchment px-5">
      <div className="w-full max-w-sm">
        <PaperCard variant="paper" padding="lg">
          <ArtMascot name="lantern" size={176} className="mb-4" />
          <h1 className="font-display text-[1.375rem] leading-snug text-graphite">
            We couldn’t restore your journey
          </h1>
          <p role="alert" className="mt-2 text-small leading-relaxed text-charcoal">
            {online
              ? "Your account is signed in, but BibleQuest couldn’t safely check its saved progress. Nothing has been replaced, and we’ll retry automatically."
              : "You’re offline, so BibleQuest can’t check this account’s saved journey yet. Reconnect, then try again."}
          </p>
          <p className="mt-2 text-caption leading-relaxed text-ash">
            If this continues while you’re online, mention reference
            SYNC-RESTORE when reporting it.
          </p>
          <GentleButton
            variant="primary"
            size="md"
            fullWidth
            className="mt-5"
            onClick={() => void retrySync(userId)}
          >
            Retry
          </GentleButton>
          {canContinueLocally && (
            <GentleButton
              variant="outline"
              size="md"
              fullWidth
              className="mt-2"
              onClick={onContinueLocally}
            >
              Continue with this device
            </GentleButton>
          )}
          <GentleButton
            variant="ghost"
            size="sm"
            fullWidth
            className="mt-2"
            disabled={signingOut}
            onClick={() => void signOut()}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </GentleButton>
          {signOutError && (
            <p role="alert" className="mt-2 text-caption text-rose-700">
              We couldn’t sign out just now. Check your connection and retry.
            </p>
          )}
        </PaperCard>
      </div>
    </div>
  );
}

/** Keeps retry visible without taking an already-safe local journey away. */
function LocalRestoreNotice({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const sync = useSyncStatus();
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine !== false,
  );

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 px-4">
        <div
          role="status"
          className="pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-[var(--radius-card)] border border-mist bg-paper/95 px-4 py-3 shadow-[0_8px_28px_rgb(31_48_40_/_0.16)] backdrop-blur"
        >
          <p className="min-w-0 flex-1 text-caption leading-relaxed text-charcoal">
            {sync.state === "syncing"
              ? "Checking your saved account journey…"
              : online
                ? "This device is available. Account sync will keep retrying."
                : "This device is available offline. Sync resumes when you reconnect."}
          </p>
          {sync.state !== "syncing" && (
            <GentleButton
              variant="ghost"
              size="sm"
              onClick={() => void retrySync(userId)}
            >
              Retry
            </GentleButton>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Blocks both /app and /onboarding until an authenticated account's initial
 * pull has completed. This is what lets a fresh browser recover the remote
 * onboarding profile before deciding which route belongs on screen.
 */
function ReadyAccountRestoreBoundary({
  children,
  configured,
  loading,
  userId,
}: {
  children: React.ReactNode;
  configured: boolean;
  loading: boolean;
  userId: string | null;
}) {
  const sync = useSyncStatus();
  const [localRecoveryUserId, setLocalRecoveryUserId] = useState<string | null>(
    null,
  );
  const localOnboardingCompleted = useQuestOS(
    (state) => state.profile?.onboardingCompleted ?? false,
  );
  const initialSyncPending = Boolean(
    userId && initialSyncIsPending(userId),
  );
  const resetRequired = Boolean(
    userId && accountSyncResetRequired(userId),
  );
  const handoffPending = Boolean(
    configured && userId && localDataBelongsToOtherUser(userId)
  );
  const safeLocalJourney = hasSafeLocalJourney({
    localOnboardingCompleted,
    lastSyncedUserId: getLastSyncedUserId(),
    userId,
    initialSyncPending,
  });
  const recoverableLocalJourney = hasRecoverableLocalJourney({
    localOnboardingCompleted,
    lastSyncedUserId: getLastSyncedUserId(),
    userId,
    resetRequired,
  });
  const phase = accountRestorePhase({
    configured,
    sessionLoading: loading,
    userId,
    syncUserId: sync.userId,
    syncState: sync.state,
    initialSyncComplete: sync.initialSyncComplete,
    handoffPending,
    safeLocalJourney,
  });

  // Once chosen, a safe device-local journey stays open through later retries.
  if (
    userId &&
    localRecoveryUserId === userId &&
    recoverableLocalJourney &&
    !handoffPending
  ) {
    return (
      <LocalRestoreNotice userId={userId}>{children}</LocalRestoreNotice>
    );
  }
  if (phase === "loading") return <LoadingVeil />;
  if (phase === "initial-sync-error" && userId) {
    return (
      <RestoreError
        userId={userId}
        canContinueLocally={recoverableLocalJourney}
        onContinueLocally={() => setLocalRecoveryUserId(userId)}
      />
    );
  }
  return <>{children}</>;
}

/** Routes content-free auth recovery before any private store descendant mounts. */
function AccountRestoreBoundary({
  children,
  services,
}: {
  children: React.ReactNode;
  services?: React.ReactNode;
}) {
  const { user, loading, configured, recovery } = useSession();
  if (recovery === "installing") return <InstallingAccountRecovery />;
  if (recovery === "session-unavailable") return <NativeSessionRecovery />;
  if (recovery === "locked-local-journey") {
    return <LockedLocalJourneyRecovery />;
  }
  if (recovery === "clearing-local-journey") {
    return <LockedLocalJourneyRecovery clearOnly />;
  }
  if (loading) return <LoadingVeil />;
  return (
    <>
      {services}
      <ReadyAccountRestoreBoundary
        configured={configured}
        loading={false}
        userId={user?.id ?? null}
      >
        {children}
      </ReadyAccountRestoreBoundary>
    </>
  );
}

export function OnboardingGate({
  children,
  services,
}: {
  children: React.ReactNode;
  services?: React.ReactNode;
}) {
  return (
    <ClientOnly fallback={<LoadingVeil />}>
      <AccountRestoreBoundary services={services}>
        <Gate>{children}</Gate>
      </AccountRestoreBoundary>
    </ClientOnly>
  );
}

/** Account-aware hold for the public onboarding route itself. */
export function OnboardingAccountRestoreGate({
  children,
  services,
}: {
  children: React.ReactNode;
  services?: React.ReactNode;
}) {
  return (
    <ClientOnly fallback={<LoadingVeil />}>
      <AccountRestoreBoundary services={services}>
        <OnboardingRouteGate>{children}</OnboardingRouteGate>
      </AccountRestoreBoundary>
    </ClientOnly>
  );
}
