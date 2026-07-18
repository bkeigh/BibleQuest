"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuestOS } from "@/lib/questos/store";
import { useSession } from "@/lib/supabase/useSession";
import { createClient } from "@/lib/supabase/client";
import { retrySync } from "@/lib/sync/engine";
import { useSyncStatus } from "@/lib/sync/status";
import {
  getLastSyncedUserId,
  localDataBelongsToOtherUser,
} from "@/lib/sync/last-user";
import { accountRestorePhase } from "@/lib/sync/access";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PixelMascot } from "@/components/design-system/PixelMascot";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton } from "@/components/design-system/GentleButton";

/**
 * Sends first-time visitors to onboarding before the app opens. Renders a
 * calm holding state while the persisted store hydrates on the client.
 */
function Gate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const completed = useQuestOS((s) => s.profile?.onboardingCompleted ?? false);

  useEffect(() => {
    if (!completed) router.replace("/onboarding");
  }, [completed, router]);

  if (!completed) {
    return <LoadingVeil />;
  }
  return <>{children}</>;
}

/** Keeps a restored account from flashing the first onboarding step. */
function OnboardingRouteGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const completed = useQuestOS((s) => s.profile?.onboardingCompleted ?? false);

  useEffect(() => {
    if (completed) router.replace("/app");
  }, [completed, router]);

  return completed ? <LoadingVeil /> : <>{children}</>;
}

function LoadingVeil() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-parchment">
      <PixelMascot name="lantern" size={7} />
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="text-small text-ash"
      >
        Restoring your journey…
      </p>
    </div>
  );
}

function RestoreError({ userId }: { userId: string }) {
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(false);
    const { error } = await createClient().auth.signOut();
    if (error) {
      setSigningOut(false);
      setSignOutError(true);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-parchment px-5">
      <div className="w-full max-w-sm">
        <PaperCard variant="paper" padding="lg">
          <PixelMascot name="lantern" size={7} className="mb-4" />
          <h1 className="font-display text-[1.375rem] leading-snug text-graphite">
            We couldn’t restore your journey
          </h1>
          <p role="alert" className="mt-2 text-small leading-relaxed text-charcoal">
            Your account is still signed in, but BibleQuest couldn’t safely
            check its saved progress. Nothing has been replaced. Check your
            connection and try again.
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

/**
 * Blocks both /app and /onboarding until an authenticated account's initial
 * pull has completed. This is what lets a fresh browser recover the remote
 * onboarding profile before deciding which route belongs on screen.
 */
function AccountRestoreBoundary({ children }: { children: React.ReactNode }) {
  const { user, loading, configured } = useSession();
  const sync = useSyncStatus();
  const localOnboardingCompleted = useQuestOS(
    (state) => state.profile?.onboardingCompleted ?? false,
  );
  const userId = user?.id ?? null;
  const handoffPending = Boolean(
    configured && userId && localDataBelongsToOtherUser(userId)
  );
  const trustedLocalCopy = Boolean(
    userId &&
      localOnboardingCompleted &&
      getLastSyncedUserId() === userId,
  );
  const phase = accountRestorePhase({
    configured,
    sessionLoading: loading,
    userId,
    syncUserId: sync.userId,
    syncState: sync.state,
    initialSyncComplete: sync.initialSyncComplete,
    handoffPending,
    trustedLocalCopy,
  });

  if (phase === "loading") return <LoadingVeil />;
  if (phase === "initial-sync-error" && userId) {
    return <RestoreError userId={userId} />;
  }
  return <>{children}</>;
}

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  return (
    <ClientOnly fallback={<LoadingVeil />}>
      <AccountRestoreBoundary>
        <Gate>{children}</Gate>
      </AccountRestoreBoundary>
    </ClientOnly>
  );
}

/** Account-aware hold for the public onboarding route itself. */
export function OnboardingAccountRestoreGate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClientOnly fallback={<LoadingVeil />}>
      <AccountRestoreBoundary>
        <OnboardingRouteGate>{children}</OnboardingRouteGate>
      </AccountRestoreBoundary>
    </ClientOnly>
  );
}
