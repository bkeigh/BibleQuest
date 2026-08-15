"use client";

/**
 * Small auth adapter shared by client components. It presents configured,
 * loading, and user state consistently while deduplicating sign-in analytics
 * across the several mounted consumers and open browser tabs.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
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
  deleteAccountAndDeviceData,
  ownAccountDeletionIsPending,
} from "@/lib/auth/account-deletion";
import {
  accountLifecycleHandleIsCurrent,
  accountLifecycleIsActive,
  accountLifecycleSnapshot,
  beginAccountLifecycle,
  finishAccountLifecycle,
  subscribeAccountLifecycle,
} from "@/lib/auth/account-lifecycle";
import {
  prepareMarkedWebAccountSignOut,
  resumeMarkedWebAccountSignOut,
} from "@/lib/auth/account-sign-out";
import { isNativeTarget } from "@/lib/platform/target";
import {
  adoptCurrentWebPrivateWriteGeneration,
  clearRevokedWebAuthSubject,
  clearExactWebAuthSession,
  markWebAccountDeleting,
  migrateLegacyWebSession,
  readWebAuthState,
  refreshRetainedDeletingWebSession,
  requireCurrentWebAccountRealm,
  resumeInstallingWebSession,
  subscribeWebAuthStorageChanges,
  verifyRetainedWebAuthSession,
  webAuthStorageIsGenuinelyEmpty,
  withNeverOwnedWebPrivateGuestProvenance,
  withTerminalWebPrivateWriteCleanup,
  withWebPrivateLegacyAbsenceAudit,
  withWebAccountOperationLock,
  type RetainedWebSessionVerification,
  type WebAuthState,
  type WebAccountOperationHandle,
} from "./web-auth-storage";
import type { ExactNativeAuthSession } from "./native-auth-storage";
import { firstTabToTrackSignIn } from "@/lib/auth/sign-in-tracking";
import {
  readLocalJourneyOwner,
  type LocalJourneyOwner,
} from "@/lib/sync/last-user";
import {
  readWebPrivateGuestClearState,
  readWebPrivateNamespaceState,
} from "@/lib/storage/web-private-namespace";

// One funnel event per real sign-in — not per mounted hook instance
// (several components subscribe at once) and not per open tab (supabase
// broadcasts SIGNED_IN to every tab). The cross-tab guard is a short-lived
// localStorage stamp; localStorage failures just fall back to per-tab.
let signInTracked = false;
export const SESSION_LOOKUP_DEADLINE_MS = 12_000;

interface VerifiedUserResult {
  data: { user: User | null };
  error: unknown;
}

// Every mounted consumer shares the same network check for a given JWT.
const verificationLookups = new Map<string, Promise<VerifiedUserResult>>();
let invalidNativeSessionSignOut: Promise<void> | null = null;

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

/** Captures the exact bounded credential observed by async verification. */
function exactObservedSession(
  session: Session,
): ExactNativeAuthSession | null {
  if (
    !session.user.id ||
    session.user.id.length > 128 ||
    !session.access_token ||
    session.access_token.length > 16_384 ||
    !session.refresh_token ||
    session.refresh_token.length > 8_192
  ) {
    return null;
  }
  return {
    userId: session.user.id,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  };
}

/** Proves a deferred check still owns the same complete persisted credential. */
function observedCredentialMatches(
  expected: ExactNativeAuthSession,
  session: Session | null,
): boolean {
  const current = session ? exactObservedSession(session) : null;
  return Boolean(
    current &&
      current.userId === expected.userId &&
      current.accessToken === expected.accessToken &&
      current.refreshToken === expected.refreshToken,
  );
}

/** Removes only the terminal web credential observed by this verification. */
function clearInvalidLocalSession(
  supabase: SupabaseClient,
  session: Session,
  webOperation?: WebAccountOperationHandle,
): Promise<void> {
  if (!isNativeTarget()) {
    const expected = exactObservedSession(session);
    if (!expected || !webOperation) return Promise.resolve();
    return clearExactWebAuthSession(webOperation, expected).then(
      () => undefined,
      () => undefined,
    );
  }

  // Preserve the existing native sign-out path; native account operations
  // retain their separate lifecycle and exact Keychain cleanup boundaries.
  if (invalidNativeSessionSignOut) return invalidNativeSessionSignOut;

  const signOut = supabase.auth
    .signOut({ scope: "local" })
    .then(() => undefined)
    .catch(() => undefined);
  invalidNativeSessionSignOut = signOut;
  void signOut.then(() => {
    if (invalidNativeSessionSignOut === signOut) {
      invalidNativeSessionSignOut = null;
    }
  });
  return signOut;
}

interface SessionState {
  user: User | null;
  loading: boolean;
  configured: boolean;
  recovery:
    | "none"
    | "installing"
    | "locked-local-journey"
    | "clearing-local-journey";
}

export type WebAuthBootstrapDecision =
  | { action: "accept-active"; session: Session }
  | { action: "signed-out" }
  | { action: "resume-deletion"; session: Session }
  | { action: "purge-deleted"; session: Session }
  | { action: "resume-sign-out"; session: Session }
  | { action: "finish-sign-out"; session: Session }
  | { action: "closed" };

export type MissingWebAuthRecovery = "guest" | "locked" | "closed";

/** Reads only the content-free durable guest-clear recovery phase. */
function guestClearRecoveryIsPending(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      readWebPrivateGuestClearState(window.localStorage) === "clearing"
    );
  } catch {
    return false;
  }
}

/** Keeps an owned signed-out journey hidden while exposing recovery controls. */
export function decideMissingWebAuthRecovery(
  owner: LocalJourneyOwner,
): MissingWebAuthRecovery {
  if (owner.status === "unowned") return "guest";
  return owner.status === "owned" ? "locked" : "closed";
}

/** Maps a locked durable state to the only safe bootstrap continuation. */
export function decideWebAuthBootstrap(
  state: WebAuthState,
  verification?: RetainedWebSessionVerification,
): WebAuthBootstrapDecision {
  if (state.status === "missing") return { action: "signed-out" };
  if (state.status !== "stored") return { action: "closed" };
  if (state.mode === "installing") return { action: "closed" };
  if (state.mode === "active") {
    return { action: "accept-active", session: state.session };
  }
  if (state.mode === "deleting") {
    if (verification === "deleted") {
      return { action: "purge-deleted", session: state.session };
    }
    if (verification === "active" || verification === "pending") {
      return { action: "resume-deletion", session: state.session };
    }
    return { action: "closed" };
  }
  if (verification === "deleted" || verification === "revoked") {
    return { action: "finish-sign-out", session: state.session };
  }
  return verification === "active"
    ? { action: "resume-sign-out", session: state.session }
    : { action: "closed" };
}

function trackCompletedSignIn() {
  if (signInTracked) return;
  signInTracked = true;
  if (firstTabToTrackSignIn()) {
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
    isNativeTarget() ? accountSyncAvailable(isSupabaseConfigured()) : true,
  );
  const [recovery, setRecovery] = useState<SessionState["recovery"]>("none");
  const verifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (lifecycleActive) {
      verifiedUserId.current = null;
      void suspendExistingNativeAuthClient();
      let cancelled = false;
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setRecovery("none");
        setUser(null);
        // Keep the next availability recovery provisional until Auth answers.
        setSessionLoading(true);
      });
      return () => {
        cancelled = true;
      };
    }
    if (!configured) {
      verifiedUserId.current = null;
      void suspendExistingNativeAuthClient();
      let active = true;
      // Defer React state changes until after the availability effect settles.
      void Promise.resolve().then(() => {
        if (!active) return;
        setUser(null);
        setRecovery("none");
        setSessionLoading(!isNativeTarget());
      });
      if (isNativeTarget()) {
        return () => {
          active = false;
        };
      }
      void withWebAccountOperationLock(async (webOperation) => {
        await requireCurrentWebAccountRealm(webOperation);
        const state = await readWebAuthState(webOperation);
        if (!active) return;
        if (state.status !== "missing") {
          setRecovery("none");
          setSessionLoading(true);
          return;
        }
        if (guestClearRecoveryIsPending()) {
          setRecovery("clearing-local-journey");
          setSessionLoading(false);
          return;
        }
        const owner = readLocalJourneyOwner();
        if (owner.status !== "unowned") {
          setRecovery(
            owner.status === "owned" ? "locked-local-journey" : "none",
          );
          setSessionLoading(owner.status !== "owned");
          return;
        }
        let adopted = await adoptCurrentWebPrivateWriteGeneration(
          webOperation,
          null,
        );
        if (!adopted) {
          const { establishNeverOwnedWebPrivateGuestProvenance } =
            await import("@/lib/storage/web-private-cutover");
          const established = await withNeverOwnedWebPrivateGuestProvenance(
            webOperation,
            establishNeverOwnedWebPrivateGuestProvenance,
          );
          // Same ordering as acceptFreshGuest: provenance is a precondition of
          // adoption, so retry once it is durable.
          if (established) {
            adopted = await adoptCurrentWebPrivateWriteGeneration(
              webOperation,
              null,
            );
          }
        }
        if (!active) return;
        setRecovery(adopted ? "none" : "locked-local-journey");
        setSessionLoading(false);
      }).catch(() => {
        if (!active) return;
        setRecovery("locked-local-journey");
        setSessionLoading(false);
      });
      return () => {
        active = false;
      };
    }
    void resumeExistingNativeAuthClient();
    const supabase = createClient();
    let active = true;
    let verificationRun = 0;
    let authStorageRead = 0;
    let webBootstrapComplete = isNativeTarget();
    let latestSession: Parameters<
      Parameters<typeof supabase.auth.onAuthStateChange>[0]
    >[1] = null;

    /** Keeps account surfaces closed while a terminal cleanup owns the device. */
    const resumeDeletedAccount = async (
      userId: string,
      pending: boolean,
      webOperation?: WebAccountOperationHandle,
    ) => {
      verifiedUserId.current = null;
      setUser(null);
      setSessionLoading(true);
      const lifecycle = beginAccountLifecycle(userId);
      if (!lifecycle) return;

      let complete = false;
      try {
        if (pending) {
          complete = await deleteAccountAndDeviceData(
            userId,
            lifecycle,
            {},
            webOperation,
          );
        } else {
          const purge = () =>
            purgeDeletedAccountDeviceData(userId, lifecycle, webOperation);
          complete = webOperation
            ? await withTerminalWebPrivateWriteCleanup(
                webOperation,
                userId,
                purge,
              )
            : await purge();
        }
      } catch {
        // Retain the lifecycle. A relaunch can re-verify and retry without
        // exposing a latched or already-deleted account to UI or sync.
      }
      if (complete && accountLifecycleHandleIsCurrent(lifecycle)) {
        finishAccountLifecycle(lifecycle);
      }
    };

    /** Keeps a durable web sign-out closed until revocation and exact clear finish. */
    const resumeSigningOutAccount = async (
      expected: ExactNativeAuthSession,
      webOperation: WebAccountOperationHandle,
      remoteSessionAlreadyAbsent = false,
    ) => {
      verifiedUserId.current = null;
      setUser(null);
      setSessionLoading(true);
      const lifecycle = beginAccountLifecycle(expected.userId);
      if (!lifecycle) return;
      let complete = false;
      try {
        if (remoteSessionAlreadyAbsent) {
          if (
            await prepareMarkedWebAccountSignOut(
              webOperation,
              expected.userId,
            )
          ) {
            const cleared = await clearRevokedWebAuthSubject(
              webOperation,
              expected.userId,
            );
            complete = cleared === "cleared" || cleared === "missing";
          }
        } else {
          complete = await resumeMarkedWebAccountSignOut(
            expected,
            lifecycle,
            webOperation,
          );
        }
      } catch {
        // Retain the lifecycle so a relaunch can resume the durable marker.
      }
      if (complete && accountLifecycleHandleIsCurrent(lifecycle)) {
        finishAccountLifecycle(lifecycle);
      }
    };

    /** Applies only a still-current exact session under the account lock. */
    const verifySession = (
      session: NonNullable<typeof latestSession>,
      completedSignIn: boolean,
      preserveVerifiedUserOnRetryableFailure: boolean,
      existingWebOperation?: WebAccountOperationHandle,
    ): Promise<void> => {
      const run = ++verificationRun;
      const expected = exactObservedSession(session);
      if (!expected) {
        verifiedUserId.current = null;
        setUser(null);
        setRecovery("none");
        setSessionLoading(isNativeTarget() ? false : true);
        void clearInvalidLocalSession(supabase, session);
        return Promise.resolve();
      }

      const verify = async (webOperation?: WebAccountOperationHandle) => {
        if (!active || run !== verificationRun) return;
        const before = await withDeadline(
          supabase.auth.getSession(),
          SESSION_LOOKUP_DEADLINE_MS,
          "Account session confirmation",
        );
        if (!active || run !== verificationRun) return;
        if (
          before.error ||
          !observedCredentialMatches(expected, before.data.session)
        ) {
          verifiedUserId.current = null;
          setUser(null);
          setSessionLoading(true);
          return;
        }

        const { data, error } = await getVerifiedUser(
          supabase,
          expected.accessToken,
        );
        if (!active || run !== verificationRun) return;
        const verifiedUser = data.user ?? null;
        const decision = decideSessionVerification(Boolean(verifiedUser), error);

        if (error) {
          reportClientSignal({
            surface: "auth",
            stage: "session",
            outcome: "failure",
            category: classifyOperationalError(error),
          });
        }
        if (decision === "purge-deleted-account") {
          if (webOperation) {
            const marked = await markWebAccountDeleting(
              webOperation,
              expected,
            );
            if (marked !== "marked") {
              setSessionLoading(true);
              return;
            }
          }
          await resumeDeletedAccount(expected.userId, false, webOperation);
          return;
        }
        if (
          decision === "clear-local-auth" ||
          (decision === "accept" && verifiedUser?.id !== expected.userId)
        ) {
          verifiedUserId.current = null;
          setUser(null);
          setRecovery("none");
          setSessionLoading(isNativeTarget() ? false : true);
          await clearInvalidLocalSession(supabase, session, webOperation);
          return;
        }
        if (decision !== "accept" || !verifiedUser) {
          // Retryable identity failures preserve only a previously accepted
          // same-subject view; a replacement always remains isolated.
          if (!preserveVerifiedUserOnRetryableFailure) {
            verifiedUserId.current = null;
            setUser(null);
          }
          setSessionLoading(!preserveVerifiedUserOnRetryableFailure);
          return;
        }

        let pending: boolean;
        try {
          pending = await ownAccountDeletionIsPending(expected.userId);
        } catch (statusError) {
          reportClientSignal({
            surface: "auth",
            stage: "session",
            outcome: "failure",
            category: classifyOperationalError(statusError),
          });
          verifiedUserId.current = null;
          setUser(null);
          setSessionLoading(true);
          return;
        }
        if (!active || run !== verificationRun) return;
        const after = await withDeadline(
          supabase.auth.getSession(),
          SESSION_LOOKUP_DEADLINE_MS,
          "Account status confirmation",
        );
        if (
          !active ||
          run !== verificationRun ||
          after.error ||
          !observedCredentialMatches(expected, after.data.session)
        ) {
          verifiedUserId.current = null;
          setUser(null);
          setSessionLoading(true);
          return;
        }
        if (pending) {
          await resumeDeletedAccount(expected.userId, true, webOperation);
          return;
        }

        if (
          webOperation &&
          !(await adoptCurrentWebPrivateWriteGeneration(
            webOperation,
            expected.userId,
          ))
        ) {
          verifiedUserId.current = null;
          setUser(null);
          setSessionLoading(true);
          return;
        }

        verifiedUserId.current = verifiedUser.id;
        setRecovery("none");
        if (completedSignIn) trackCompletedSignIn();
        setUser(verifiedUser);
        setSessionLoading(false);
      };

      const guarded = isNativeTarget()
        ? verify()
        : withWebAccountOperationLock(verify, existingWebOperation);
      return guarded.catch((error: unknown) => {
        if (!active || run !== verificationRun) return;
        reportClientSignal({
          surface: "auth",
          stage: "session",
          outcome: "failure",
          category: classifyOperationalError(error),
        });
        verifiedUserId.current = null;
        setUser(null);
        setSessionLoading(true);
      });
    };

    /** Isolates a changed account before starting its remote verification. */
    const observeSession = (
      session: NonNullable<typeof latestSession>,
      completedSignIn: boolean,
      webOperation?: WebAccountOperationHandle,
    ): Promise<void> => {
      const boundary = observedSessionBoundary(
        verifiedUserId.current,
        session.user.id,
      );
      if (boundary.isolateUntilVerified) {
        verifiedUserId.current = null;
        setUser(null);
        setSessionLoading(true);
      }
      return verifySession(
        session,
        completedSignIn,
        boundary.preserveVerifiedUserOnRetryableFailure,
        webOperation,
      );
    };

    /** Applies a content-free signed-out observation to every mounted surface. */
    const observeSignedOut = (completedEvent: boolean) => {
      verificationRun += 1;
      verifiedUserId.current = null;
      if (completedEvent) signInTracked = false;
      setUser(null);
      setRecovery("none");
      setSessionLoading(false);
    };

    let reconcileWebAuthStorage: () => void = () => undefined;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      latestSession = session;
      // Auth events that arrive before the web bootstrap finishes are recorded
      // but must not invalidate it. Bumping the read counter here cancelled the
      // in-flight reconcile through its `read !== authStorageRead` guard, while
      // this handler returned below without completing the bootstrap itself —
      // so nothing ever cleared the loading veil. The bootstrap re-reads durable
      // state before it commits, so deferring the bump loses no information.
      if (!webBootstrapComplete) return;
      authStorageRead += 1;
      if (event === "SIGNED_OUT" || !session) {
        if (!isNativeTarget()) {
          reconcileWebAuthStorage();
          return;
        }
        observeSignedOut(event === "SIGNED_OUT");
        return;
      }
      if (!authEventRequiresUserVerification(event)) return;

      // Server callback round trips restore as INITIAL_SESSION, while in-page
      // auth can emit SIGNED_IN. The one-shot cookie makes both paths count
      // exactly once without putting identity or tokens in client state.
      const callbackCompleted = consumeAuthCompletionSignal();
      void observeSession(
        session,
        authEventCompletesSignIn(event, callbackCompleted),
      );
    });

    /** Reconciles the durable v2 envelope before trusting any SDK observation. */
    reconcileWebAuthStorage = () => {
      const read = ++authStorageRead;
      void withWebAccountOperationLock(async (webOperation) => {
        if (!active || read !== authStorageRead) return;

        /** Keeps every account surface closed without discarding recoverable state. */
        const closeAccount = () => {
          verifiedUserId.current = null;
          setRecovery("none");
          setUser(null);
          setSessionLoading(true);
        };

        /** Exposes only recovery controls while keeping owned data unmounted. */
        const showLockedLocalJourney = () => {
          verifiedUserId.current = null;
          setUser(null);
          setRecovery("locked-local-journey");
          setSessionLoading(false);
        };

        /** Exposes only idempotent Clear while a durable guest purge resumes. */
        const showClearingLocalJourney = () => {
          verifiedUserId.current = null;
          setUser(null);
          setRecovery("clearing-local-journey");
          setSessionLoading(false);
        };

        /** Removes rollback-visible legacy residue before locking a v2 owner. */
        const showAuditedLockedLocalJourney = async (
          owner: Extract<LocalJourneyOwner, { status: "owned" }>,
        ) => {
          let namespace: ReturnType<typeof readWebPrivateNamespaceState>;
          try {
            namespace = readWebPrivateNamespaceState(window.localStorage);
          } catch {
            closeAccount();
            return;
          }
          if (namespace === "legacy") {
            showLockedLocalJourney();
            return;
          }
          if (namespace !== "v2") {
            closeAccount();
            return;
          }
          const { removeAndProveLegacyWebPrivateResidue } = await import(
            "@/lib/storage/web-private-cutover"
          );
          const cleaned = await withWebPrivateLegacyAbsenceAudit(
            webOperation,
            owner.userId,
            () =>
              removeAndProveLegacyWebPrivateResidue(
                webOperation,
                owner.userId,
              ),
          );
          if (cleaned) showLockedLocalJourney();
          else closeAccount();
        };

        /** Accepts only a fresh unowned guest and establishes its write fence. */
        const acceptFreshGuest = async () => {
          if (readLocalJourneyOwner().status !== "unowned") {
            closeAccount();
            return false;
          }
          let adopted = await adoptCurrentWebPrivateWriteGeneration(
            webOperation,
            null,
          );
          if (!adopted) {
            const { establishNeverOwnedWebPrivateGuestProvenance } =
              await import("@/lib/storage/web-private-cutover");
            const established = await withNeverOwnedWebPrivateGuestProvenance(
              webOperation,
              establishNeverOwnedWebPrivateGuestProvenance,
            );
            // Durable never-owned provenance is itself a precondition of guest
            // adoption, so the first attempt above fails by design on a first
            // visit. Retry once it holds; adoption still proves the full
            // never-owned state, so this grants nothing it would have refused.
            if (established) {
              adopted = await adoptCurrentWebPrivateWriteGeneration(
                webOperation,
                null,
              );
            }
          }
          if (!adopted) {
            showLockedLocalJourney();
            return false;
          }
          webBootstrapComplete = true;
          latestSession = null;
          setRecovery("none");
          observeSignedOut(false);
          return true;
        };

        /** Recovers a retained terminal envelope without requiring normal auth. */
        const reconcileTerminalState = async (state: WebAuthState) => {
          if (
            state.status !== "stored" ||
            state.mode === "active" ||
            state.mode === "installing"
          ) {
            return false;
          }
          let verification = await verifyRetainedWebAuthSession(state.session);
          if (
            state.mode === "deleting" &&
            (verification === "unavailable" || verification === "revoked")
          ) {
            verification = await refreshRetainedDeletingWebSession(
              webOperation,
              state.session,
            );
          }
          if (!active || read !== authStorageRead) return true;
          const decision = decideWebAuthBootstrap(state, verification);
          const expected =
            "session" in decision
              ? exactObservedSession(decision.session)
              : null;
          if (!expected) {
            closeAccount();
            return true;
          }
          if (decision.action === "resume-deletion") {
            await resumeDeletedAccount(expected.userId, true, webOperation);
          } else if (decision.action === "purge-deleted") {
            await resumeDeletedAccount(expected.userId, false, webOperation);
          } else if (decision.action === "resume-sign-out") {
            await resumeSigningOutAccount(expected, webOperation);
          } else if (decision.action === "finish-sign-out") {
            await resumeSigningOutAccount(expected, webOperation, true);
          } else {
            closeAccount();
          }
          return true;
        };

        let state = await readWebAuthState(webOperation);
        if (!active || read !== authStorageRead) return;
        if (await reconcileTerminalState(state)) return;

        try {
          await requireCurrentWebAccountRealm(webOperation);
        } catch {
          if (state.status === "missing") {
            if (guestClearRecoveryIsPending()) {
              showClearingLocalJourney();
              return;
            }
            const recovery = decideMissingWebAuthRecovery(
              readLocalJourneyOwner(),
            );
            if (recovery === "guest") await acceptFreshGuest();
            else if (recovery === "locked") showLockedLocalJourney();
            else closeAccount();
          } else closeAccount();
          return;
        }

        if (state.status === "stored" && state.mode === "installing") {
          const resumed = await resumeInstallingWebSession(webOperation);
          if (!active || read !== authStorageRead) return;
          if (resumed !== "activated") {
            verifiedUserId.current = null;
            setUser(null);
            setRecovery("installing");
            setSessionLoading(false);
            return;
          }
          state = await readWebAuthState(webOperation);
          if (!active || read !== authStorageRead) return;
        }

        const migration = await migrateLegacyWebSession(webOperation);
        if (
          !active ||
          read !== authStorageRead ||
          migration === "invalid" ||
          migration === "unavailable"
        ) {
          closeAccount();
          return;
        }
        if (migration === "recovery-required") {
          verifiedUserId.current = null;
          setUser(null);
          setRecovery("installing");
          setSessionLoading(false);
          return;
        }

        state = await readWebAuthState(webOperation);
        if (!active || read !== authStorageRead) return;
        if (await reconcileTerminalState(state)) return;
        if (state.status === "missing") {
          if (guestClearRecoveryIsPending()) {
            showClearingLocalJourney();
            return;
          }
          const owner = readLocalJourneyOwner();
          const recovery = decideMissingWebAuthRecovery(owner);
          if (recovery === "guest") await acceptFreshGuest();
          else if (recovery === "locked" && owner.status === "owned") {
            await showAuditedLockedLocalJourney(owner);
          }
          else closeAccount();
          return;
        }
        if (state.status !== "stored" || state.mode !== "active") {
          closeAccount();
          return;
        }

        const { removeAndProveLegacyWebPrivateResidue } = await import(
          "@/lib/storage/web-private-cutover"
        );
        if (
          !(await withWebPrivateLegacyAbsenceAudit(
            webOperation,
            state.credential.userId,
            () =>
              removeAndProveLegacyWebPrivateResidue(
                webOperation,
                state.credential.userId,
              ),
          ))
        ) {
          closeAccount();
          return;
        }

        // Hydrate auth-js only after attestation; its strict adapter verifies
        // the same subject and session_id before persisting any refresh.
        const restored = await withDeadline(
          supabase.auth.setSession({
            access_token: state.credential.accessToken,
            refresh_token: state.credential.refreshToken,
          }),
          SESSION_LOOKUP_DEADLINE_MS,
          "Browser session restoration",
        );
        if (restored.error || !restored.data.session) {
          closeAccount();
          return;
        }
        latestSession = restored.data.session;
        await observeSession(restored.data.session, false, webOperation);
        webBootstrapComplete = true;
      }).catch((error: unknown) => {
        if (!active || read !== authStorageRead) return;
        reportClientSignal({
          surface: "auth",
          stage: "session",
          outcome: "failure",
          category: classifyOperationalError(error),
        });
        if (
          webAuthStorageIsGenuinelyEmpty() &&
          readLocalJourneyOwner().status !== "unavailable"
        ) {
          verifiedUserId.current = null;
          setUser(null);
          setRecovery("locked-local-journey");
          setSessionLoading(false);
        } else {
          verifiedUserId.current = null;
          setUser(null);
          setSessionLoading(true);
        }
      });
    };
    const unsubscribeAuthStorage = isNativeTarget()
      ? () => undefined
      : subscribeWebAuthStorageChanges(reconcileWebAuthStorage);

    if (!isNativeTarget()) reconcileWebAuthStorage();

    /** Retries a provisional session when connectivity returns. */
    const verifyAfterReconnect = () => {
      if (!isNativeTarget()) {
        reconcileWebAuthStorage();
      } else if (latestSession) {
        void observeSession(latestSession, false);
      }
    };
    window.addEventListener("online", verifyAfterReconnect);

    return () => {
      active = false;
      window.removeEventListener("online", verifyAfterReconnect);
      unsubscribeAuthStorage();
      sub.subscription.unsubscribe();
    };
  }, [configured, lifecycleActive, lifecycleRevision, pathname]);

  return {
    user: configured && !lifecycleActive ? user : null,
    loading: availability.loading || lifecycleActive || sessionLoading,
    configured,
    recovery: !lifecycleActive ? recovery : "none",
  };
}
