"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/supabase/useSession";
import { useSyncStatus } from "@/lib/sync/status";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton } from "@/components/design-system/GentleButton";
import { ArtMascot } from "@/components/design-system/ArtMascot";
import { useToast } from "@/components/design-system/Toast";
import { IconCheck } from "@/components/design-system/icons";
import { SignInMethods } from "./SignInMethods";
import { track } from "@/lib/analytics/events";
import { reportClientSignal } from "@/lib/observability/client-signals";
import {
  authFailureMessage,
  parseAuthFailureReason,
} from "@/lib/auth/errors";
import {
  accountAccessDescription,
  initialAccountIntent,
  type AccountIntent,
} from "@/lib/auth/account-intent";
import { isStandaloneWebApp } from "@/lib/pwa/install-guidance";
import {
  ACCOUNT_SYNC_CONTAINED,
  ACCOUNT_SYNC_CONTAINMENT_NOTICE,
  NATIVE_ACCOUNT_BETA_ENABLED,
} from "@/lib/sync/containment";
import { isNativeTarget } from "@/lib/platform/target";
import {
  AccountDeletionPendingError,
  deleteAccountAndDeviceData,
  verifiedNativeDeletionUserId,
} from "@/lib/auth/account-deletion";
import {
  accountLifecycleHandleIsCurrent,
  beginAccountLifecycle,
  finishAccountLifecycle,
} from "@/lib/auth/account-lifecycle";
import {
  AccountSignOutError,
  signOutExpectedAccount,
} from "@/lib/auth/account-sign-out";

function AccountInner() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading, configured } = useSession();
  const sync = useSyncStatus();
  const [signingOut, setSigningOut] = useState(false);
  // Installed app users are returning to a saved account more often than
  // creating one, while ordinary browser visitors keep the onboarding default.
  const [intent, setIntent] = useState<AccountIntent>(() =>
    initialAccountIntent(isStandaloneWebApp()),
  );

  // A failed magic link / OAuth round-trip lands here as ?error=signin
  // (src/app/auth/callback/route.ts). This component only renders on the
  // client (ClientOnly), so the URL is readable at first render.
  const [callbackFailure] = useState(() =>
    typeof window === "undefined"
      ? null
      : parseAuthFailureReason(
          new URLSearchParams(window.location.search).get("error"),
        ),
  );

  // Clean the error out of the URL so a refresh doesn't re-show it.
  useEffect(() => {
    if (!callbackFailure) return;
    reportClientSignal({
      surface: "auth",
      stage: "callback",
      outcome: "failure",
      category: callbackFailure,
    });
    const params = new URLSearchParams(window.location.search);
    params.delete("error");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (qs ? `?${qs}` : "")
    );
  }, [callbackFailure]);

  // The 1.0 guest-only release keeps this route informative without exposing
  // account creation controls that cannot complete while sync is contained.
  if (ACCOUNT_SYNC_CONTAINED) {
    return (
      <Frame title="Your journey" subtitle="Saved privately on this device.">
        <PaperCard variant="quiet" padding="lg" className="text-center">
          <p role="status" className="text-small leading-relaxed text-ash">
            {ACCOUNT_SYNC_CONTAINMENT_NOTICE}
          </p>
          <p className="mt-3 text-caption leading-relaxed text-ash">
            You can export a readable backup or clear your journey at any time
            from Settings.
          </p>
        </PaperCard>
      </Frame>
    );
  }

  if (!configured) {
    return (
      <Frame title="Your account">
        <PaperCard variant="quiet" padding="lg" className="text-center">
          <p className="text-small leading-relaxed text-ash">
            Cross-device sync isn’t available yet. Your journey is stored in
            this browser on this device.
          </p>
        </PaperCard>
        {isNativeTarget() && NATIVE_ACCOUNT_BETA_ENABLED ? (
          <UnavailableAccountDeletion />
        ) : null}
      </Frame>
    );
  }

  if (loading) {
    return (
      <Frame title="Your account">
        <PaperCard variant="quiet" padding="lg" className="text-center">
          <p className="text-small text-ash">One moment…</p>
        </PaperCard>
      </Frame>
    );
  }

  async function signOut() {
    const expectedUserId = user?.id;
    if (!expectedUserId || signingOut) return;
    setSigningOut(true);
    try {
      const result = await signOutExpectedAccount(expectedUserId);
      if (result.status === "session-changed") {
        toast("Your signed-in account changed. Reloading it safely.");
        window.location.reload();
        return;
      }
      track("sign_out");
      toast("Signed out. Your journey stays on this device.");
      if (result.reloadRequired) {
        window.location.reload();
        return;
      }
      router.refresh();
    } catch (error) {
      toast("Couldn’t sign out just now. Check your connection and retry.");
      if (
        error instanceof AccountSignOutError &&
        error.reloadRequired
      ) {
        window.location.reload();
      }
    } finally {
      setSigningOut(false);
    }
  }

  if (user) {
    return (
      <Frame title="Your account" subtitle="Your progress, on every device.">
        <PaperCard variant="paper" padding="lg">
          <p className="text-caption uppercase tracking-[0.16em] text-accent">
            Signed in
          </p>
          <p className="mt-1 text-[1.0625rem] text-graphite">
            {user.email ?? user.phone ?? "your account"}
          </p>
          <p aria-live="polite" className="mt-1.5 text-caption text-ash">
            {sync.state === "syncing"
              ? "Syncing…"
              : sync.state === "error"
                ? sync.issue === "daily-quest-conflict"
                  ? "Today’s quests changed on another device. Completed progress is safe; sync will retry shortly."
                  : "Sync will retry soon. Everything is safe on this device."
                : sync.lastSyncedAt
                  ? "Synced across your devices."
                  : "Sync starts shortly."}
          </p>
          <p className="mt-3 text-small leading-relaxed text-ash">
            Your prayers and reflections sync only to your BibleQuest account
            behind per-user access controls. Journal text is excluded from
            analytics and is not sent to AI.
          </p>
          <GentleButton
            variant="outline"
            size="sm"
            className="mt-4"
            disabled={signingOut}
            onClick={() => void signOut()}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </GentleButton>
        </PaperCard>
      </Frame>
    );
  }

  return (
    <Frame
      title={intent === "create" ? "Create your account" : "Welcome back"}
      subtitle={
        intent === "create"
          ? "Keep your journey with you."
          : "Restore your saved journey."
      }
    >
      <ArtMascot
        name="key"
        size={224}
        title={intent === "create" ? "Create account" : "Sign in"}
        className="mb-6"
      />

      {callbackFailure && (
        <div
          role="alert"
          className="mb-4 rounded-[var(--radius-card)] border border-rose-300 px-4 py-3"
        >
          <p className="text-small leading-relaxed text-rose-700">
            {authFailureMessage(callbackFailure)}
          </p>
          <p className="mt-1 text-[0.6875rem] uppercase tracking-[0.08em] text-ash">
            Reference: AUTH-CALLBACK-{callbackFailure.replaceAll("_", "-")}
          </p>
        </div>
      )}

      <PaperCard variant="paper" padding="lg">
        <p className="text-small leading-relaxed text-charcoal">
          {accountAccessDescription(intent, isNativeTarget())}
        </p>

        <ul className="mt-4 space-y-2">
          {[
            "Your quest progress, streaks, and milestones carry across devices.",
            "Prayers and reflections sync to your protected account.",
            "Reinstall or switch phones without losing your journey.",
            "Pick up on any device, right where you left off.",
          ].map((benefit) => (
            <li key={benefit} className="flex items-start gap-2.5">
              <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-surface text-accent">
                <IconCheck size={11} />
              </span>
              <span className="text-small leading-relaxed text-charcoal">
                {benefit}
              </span>
            </li>
          ))}
        </ul>

        <div
          role="group"
          aria-label="Choose account access"
          className="mt-5 grid grid-cols-2 gap-2 rounded-[var(--radius-button)] bg-linen p-1"
        >
          {(["create", "signin"] as const).map((option) => {
            const selected = intent === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => setIntent(option)}
                className={`min-h-11 rounded-[calc(var(--radius-button)-0.25rem)] px-3 text-small transition-colors ${
                  selected
                    ? "bg-paper font-medium text-accent shadow-sm"
                    : "text-ash hover:text-charcoal"
                }`}
              >
                {option === "create" ? "Create account" : "Sign in"}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <SignInMethods
            key={intent}
            source="account"
            intent={intent}
            // Land on the journey rather than leaving someone on the account
            // screen to work out whether the code took.
            onSignedIn={() => {
              toast("You're signed in. Your journey is saved to your account.");
              router.push("/app");
            }}
          />
        </div>
      </PaperCard>
    </Frame>
  );
}

/** Keeps self-service deletion reachable without reopening disabled account UI. */
function UnavailableAccountDeletion() {
  const router = useRouter();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"request" | "pending" | "device" | null>(
    null,
  );

  const removeUnavailableAccount = async () => {
    if (busy || confirmation !== "DELETE") return;
    setBusy(true);
    setError(null);
    let lifecycle: ReturnType<typeof beginAccountLifecycle> = null;
    let retainLifecycle = false;
    try {
      const expectedUserId = await verifiedNativeDeletionUserId();
      lifecycle = beginAccountLifecycle(expectedUserId);
      if (!lifecycle) {
        setError("device");
        return;
      }
      const deviceCleared = await deleteAccountAndDeviceData(
        expectedUserId,
        lifecycle,
      );
      if (
        !accountLifecycleHandleIsCurrent(lifecycle) ||
        !deviceCleared
      ) {
        setError("device");
        return;
      }
      toast("Your account and saved journey were deleted.", {
        variant: "success",
      });
      router.replace("/onboarding");
    } catch (caught) {
      if (caught instanceof AccountDeletionPendingError) {
        // Keep every ordinary account path suspended until relaunch verifies
        // whether the irreversible server request committed.
        retainLifecycle = lifecycle !== null;
        setError("pending");
      } else {
        setError("request");
      }
    } finally {
      if (lifecycle && !retainLifecycle) finishAccountLifecycle(lifecycle);
      setBusy(false);
    }
  };

  return (
    <PaperCard variant="paper" padding="lg" className="mt-4">
      <h2 className="text-base text-graphite">Delete an existing account</h2>
      <p className="mt-2 text-small leading-relaxed text-ash">
        Account access is disabled, but you can still permanently delete the
        account already saved on this device. Normal sign-in and sync stay off.
      </p>
      {!expanded ? (
        <GentleButton
          variant="danger"
          size="sm"
          className="mt-4"
          onClick={() => setExpanded(true)}
        >
          Start account deletion
        </GentleButton>
      ) : (
        <div className="mt-4">
          <label htmlFor="unavailable-account-delete" className="text-caption text-ash">
            Type DELETE to confirm
          </label>
          <input
            id="unavailable-account-delete"
            value={confirmation}
            onChange={(event) => {
              setConfirmation(event.target.value);
              setError(null);
            }}
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
            className="mt-1.5 w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3.5 py-2.5 text-body text-graphite outline-none focus:border-accent/50"
          />
          <GentleButton
            variant="danger"
            size="sm"
            className="mt-3"
            disabled={busy || confirmation !== "DELETE"}
            aria-busy={busy}
            onClick={() => void removeUnavailableAccount()}
          >
            {busy ? "Deleting account…" : "Permanently delete account"}
          </GentleButton>
          {error ? (
            <p role="alert" className="mt-3 text-caption text-rose-700">
              {error === "pending"
                ? "Deletion is still being confirmed. Close and reopen BibleQuest before continuing."
                : error === "device"
                  ? "The account was deleted, but this device could not finish clearing its local copy."
                  : "BibleQuest could not verify and delete the saved account. Check your connection and try again."}
            </p>
          ) : null}
        </div>
      )}
    </PaperCard>
  );
}

function Frame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <PageContainer className="pb-8">{children}</PageContainer>
    </>
  );
}

export function AccountScreen() {
  return (
    <ClientOnly>
      <AccountInner />
    </ClientOnly>
  );
}
