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
  trustedLocalCopy: boolean;
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
  trustedLocalCopy,
}: AccountRestoreInput): AccountRestorePhase {
  if (!configured) return "ready";
  if (sessionLoading) return "loading";
  if (!userId) return "ready";
  if (handoffPending) return "loading";
  // Once this exact account has successfully owned the hydrated journey, the
  // app remains local-first on reload. A background pull may retry offline;
  // only a genuinely fresh browser needs the hard restore boundary.
  if (trustedLocalCopy) return "ready";
  if (syncUserId !== userId) return "loading";
  if (initialSyncComplete) return "ready";
  return syncState === "error" ? "initial-sync-error" : "loading";
}
