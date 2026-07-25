import type { SyncState } from "./status";

export type AccountRestorePhase = "ready" | "loading" | "initial-sync-error";

interface AccountRestoreInput {
  configured: boolean;
  sessionLoading: boolean;
  userId: string | null;
  syncUserId: string | null;
  syncState: SyncState;
  initialSyncComplete: boolean;
  handoffPending: boolean;
  safeLocalJourney: boolean;
}

interface SafeLocalJourneyInput {
  localOnboardingCompleted: boolean;
  lastSyncedUserId: string | null;
  userId: string | null;
  initialSyncPending?: boolean;
  resetRequired?: boolean;
}

/**
 * Only a journey already stamped to this exact account can open before a new
 * initial sync completes. Once the account owns a completed local journey,
 * PWA launch stays local-first while a network retry runs in the background.
 */
export function hasSafeLocalJourney({
  localOnboardingCompleted,
  lastSyncedUserId,
  userId,
  initialSyncPending = false,
}: SafeLocalJourneyInput): boolean {
  return Boolean(
    localOnboardingCompleted &&
      userId &&
      lastSyncedUserId === userId &&
      !initialSyncPending,
  );
}

/**
 * An unowned guest journey may be opened after a failed first restore, but a
 * journey stamped to another account may never cross that privacy boundary.
 */
export function hasRecoverableLocalJourney({
  localOnboardingCompleted,
  lastSyncedUserId,
  userId,
  resetRequired = false,
}: SafeLocalJourneyInput): boolean {
  return Boolean(
    localOnboardingCompleted &&
      userId &&
      !resetRequired &&
      (!lastSyncedUserId || lastSyncedUserId === userId),
  );
}

/**
 * Decide whether account-backed content is safe to reveal.
 *
 * A signed-in browser may not make an onboarding decision from its blank
 * local store. It waits until the status belongs to the current account and
 * that account's first pull/merge has completed. A later write-through error
 * is non-blocking because the restored local copy is already authoritative.
 */
export function accountRestorePhase({
  configured,
  sessionLoading,
  userId,
  syncUserId,
  syncState,
  initialSyncComplete,
  handoffPending,
  safeLocalJourney,
}: AccountRestoreInput): AccountRestorePhase {
  if (!configured) return "ready";
  if (sessionLoading) return "loading";
  if (!userId) return "ready";
  if (handoffPending) return "loading";
  // Once this exact account has successfully owned the hydrated journey, the
  // app remains local-first on reload. A background pull may retry offline;
  // only a genuinely fresh browser needs the hard restore boundary.
  if (safeLocalJourney) return "ready";
  if (syncUserId !== userId) return "loading";
  if (initialSyncComplete) return "ready";
  return syncState === "error" ? "initial-sync-error" : "loading";
}
