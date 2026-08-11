"use client";

/**
 * Small auth adapter shared by client components. It presents configured,
 * loading, and user state consistently while deduplicating sign-in analytics
 * across the several mounted consumers and open browser tabs.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  createClient,
  isSupabaseConfigured,
  resumeExistingNativeAuthClient,
  suspendExistingNativeAuthClient,
} from "./client";
import { track } from "@/lib/analytics/events";
import {
  classifyOperationalError,
  reportClientSignal,
} from "@/lib/observability/client-signals";
import {
  authEventCompletesSignIn,
  consumeAuthCompletionSignal,
} from "@/lib/auth/completion-signal";
import { accountSyncAvailable } from "@/lib/sync/containment";
import { useAccountAvailability } from "@/lib/sync/availability";
import { withDeadline } from "@/lib/async/deadline";
import {
  authEventRequiresUserVerification,
  decideSessionVerification,
  observedSessionBoundary,
} from "./session-verification";
import { purgeDeletedAccountDeviceData } from "@/lib/auth/device-account-cleanup";
import {
  accountLifecycleIsActive,
  accountLifecycleSnapshot,
  subscribeAccountLifecycle,
} from "@/lib/auth/account-lifecycle";
import { isNativeTarget } from "@/lib/platform/target";

// One funnel event per real sign-in — not per mounted hook instance
// (several components subscribe at once) and not per open tab (supabase
// broadcasts SIGNED_IN to every tab). The cross-tab guard is a short-lived
// localStorage stamp; localStorage failures just fall back to per-tab.
let signInTracked = false;
const SIGNIN_STAMP_KEY = "biblequest:signin-tracked";
export const SESSION_LOOKUP_DEADLINE_MS = 12_000;

interface VerifiedUserResult {
  data: { user: User | null };
  error: unknown;
}

// Every mounted consumer shares the same network check for a given JWT.
const verificationLookups = new Map<string, Promise<VerifiedUserResult>>();
let invalidSessionSignOut: Promise<void> | null = null;

/** Verifies the exact observed JWT instead of trusting its cached user object. */
function getVerifiedUser(
  supabase: SupabaseClient,
  accessToken: string,
): Promise<VerifiedUserResult> {
  const pending = verificationLookups.get(accessToken);
  if (pending) return pending;

  const lookup = withDeadline(
    supabase.auth.getUser(accessToken),
    SESSION_LOOKUP_DEADLINE_MS,
    "Account session lookup",
  );
  verificationLookups.set(accessToken, lookup);
  void lookup.then(
    () => {
      if (verificationLookups.get(accessToken) === lookup) {
        verificationLookups.delete(accessToken);
      }
    },
    () => {
      if (verificationLookups.get(accessToken) === lookup) {
        verificationLookups.delete(accessToken);
      }
    },
  );
  return lookup;
}

/** Removes one terminal session locally and broadcasts SIGNED_OUT once. */
function clearInvalidLocalSession(supabase: SupabaseClient): Promise<void> {
  if (invalidSessionSignOut) return invalidSessionSignOut;

  const signOut = supabase.auth
    .signOut({ scope: "local" })
    .then(() => undefined)
    .catch(() => undefined);
  invalidSessionSignOut = signOut;
  void signOut.then(() => {
    if (invalidSessionSignOut === signOut) invalidSessionSignOut = null;
  });
  return signOut;
}

function firstTabToTrack(userId: string): boolean {
  try {
    const raw = window.localStorage.getItem(SIGNIN_STAMP_KEY);
    if (raw) {
      const [id, at] = raw.split("|");
      if (id === userId && Date.now() - Number(at) < 15_000) return false;
    }
    window.localStorage.setItem(SIGNIN_STAMP_KEY, `${userId}|${Date.now()}`);
    return true;
  } catch {
    return true;
  }
}

interface SessionState {
  user: User | null;
  loading: boolean;
  configured: boolean;
}

function trackCompletedSignIn(userId: string) {
  if (signInTracked) return;
  signInTracked = true;
  if (firstTabToTrack(userId)) {
    track("sign_in_completed");
    reportClientSignal({
      surface: "auth",
      stage: "session",
      outcome: "success",
      category: "ok",
    });
  }
}

/**
 * Subscribes to the Supabase auth state. When Supabase isn't configured it
 * returns a stable signed-out state so guest mode renders normally.
 */
export function useSession(): SessionState {
  // Native beta availability is checked anonymously before Keychain auth starts.
  const availability = useAccountAvailability();
  const configured = availability.available;
  const lifecycleRevision = useSyncExternalStore(
    subscribeAccountLifecycle,
    accountLifecycleSnapshot,
    accountLifecycleSnapshot,
  );
  const lifecycleActive = accountLifecycleIsActive();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(
    accountSyncAvailable(isSupabaseConfigured()),
  );
  const verifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!configured || lifecycleActive) {
      verifiedUserId.current = null;
      void suspendExistingNativeAuthClient();
      let cancelled = false;
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setUser(null);
        // Keep the next availability recovery provisional until Auth answers.
        setSessionLoading(true);
      });
      return () => {
        cancelled = true;
      };
    }
    void resumeExistingNativeAuthClient();
    const supabase = createClient();
    let active = true;
    let verificationRun = 0;
    let latestSession: Parameters<
      Parameters<typeof supabase.auth.onAuthStateChange>[0]
    >[1] = null;

    /** Applies only the result for the latest observed auth session. */
    const verifySession = (
      session: NonNullable<typeof latestSession>,
      completedSignIn: boolean,
      preserveVerifiedUserOnRetryableFailure: boolean,
    ) => {
      const run = ++verificationRun;
      void getVerifiedUser(supabase, session.access_token)
        .then(({ data, error }) => {
          if (!active || run !== verificationRun) return;
          const verifiedUser = data.user ?? null;
          const decision = decideSessionVerification(
            Boolean(verifiedUser),
            error,
          );

          if (
            decision === "accept" &&
            verifiedUser?.id === session.user.id
          ) {
            verifiedUserId.current = verifiedUser.id;
            if (completedSignIn) trackCompletedSignIn(verifiedUser.id);
            setUser(verifiedUser);
            setSessionLoading(false);
            return;
          }

          if (error) {
            reportClientSignal({
              surface: "auth",
              stage: "session",
              outcome: "failure",
              category: classifyOperationalError(error),
            });
          }
          if (
            decision === "purge-deleted-account"
          ) {
            verifiedUserId.current = null;
            setUser(null);
            setSessionLoading(true);
            const cleanup = purgeDeletedAccountDeviceData(session.user.id);
            if (!isNativeTarget()) {
              void cleanup.finally(() => clearInvalidLocalSession(supabase));
            }
            return;
          }
          if (
            decision === "clear-local-auth" ||
            (decision === "accept" &&
              verifiedUser?.id !== session.user.id)
          ) {
            verifiedUserId.current = null;
            setUser(null);
            setSessionLoading(false);
            void clearInvalidLocalSession(supabase);
            return;
          }

          // Retryable offline/timeout failures never erase the local journey
          // or accept the unverified cached identity.
          if (!preserveVerifiedUserOnRetryableFailure) {
            verifiedUserId.current = null;
            setUser(null);
          }
          setSessionLoading(false);
        })
        .catch((error: unknown) => {
          if (!active || run !== verificationRun) return;
          reportClientSignal({
            surface: "auth",
            stage: "session",
            outcome: "failure",
            category: classifyOperationalError(error),
          });
          setSessionLoading(false);
        });
    };

    /** Isolates a changed account before starting its remote verification. */
    const observeSession = (
      session: NonNullable<typeof latestSession>,
      completedSignIn: boolean,
    ) => {
      const boundary = observedSessionBoundary(
        verifiedUserId.current,
        session.user.id,
      );
      if (boundary.isolateUntilVerified) {
        verifiedUserId.current = null;
        setUser(null);
        setSessionLoading(true);
      }
      verifySession(
        session,
        completedSignIn,
        boundary.preserveVerifiedUserOnRetryableFailure,
      );
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      latestSession = session;
      if (event === "SIGNED_OUT" || !session) {
        verificationRun += 1;
        verifiedUserId.current = null;
        if (event === "SIGNED_OUT") signInTracked = false;
        setUser(null);
        setSessionLoading(false);
        return;
      }
      if (!authEventRequiresUserVerification(event)) return;

      // Server callback round trips restore as INITIAL_SESSION, while in-page
      // auth can emit SIGNED_IN. The one-shot cookie makes both paths count
      // exactly once without putting identity or tokens in client state.
      const callbackCompleted = consumeAuthCompletionSignal();
      observeSession(
        session,
        authEventCompletesSignIn(event, callbackCompleted),
      );
    });

    /** Retries a provisional session when connectivity returns. */
    const verifyAfterReconnect = () => {
      if (latestSession) observeSession(latestSession, false);
    };
    window.addEventListener("online", verifyAfterReconnect);

    return () => {
      active = false;
      window.removeEventListener("online", verifyAfterReconnect);
      sub.subscription.unsubscribe();
    };
  }, [configured, lifecycleActive, lifecycleRevision, pathname]);

  return {
    user: configured && !lifecycleActive ? user : null,
    loading:
      availability.loading || lifecycleActive || (configured && sessionLoading),
    configured,
  };
}
