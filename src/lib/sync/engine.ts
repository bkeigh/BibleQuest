"use client";

/**
 * Sync engine — optional account sync for the local-first QuestOS store.
 *
 * Principles:
 *  - The local store remains the source of truth for the UI; the account is a
 *    backup + bridge between devices. Everything keeps working offline.
 *  - On sign-in: pull the account copy, preserve offline edits relative to
 *    persisted revision fingerprints, apply, then CAS-push changed rows.
 *  - After that: a debounced write-through pushes only the collections that
 *    changed. Local deletions carry tombstones so they propagate instead of
 *    resurrecting from the server.
 *  - PRIVACY: prayer/reflection text goes only to the user's own RLS-protected
 *    rows — never to analytics or logs. Errors are surfaced as status, and
 *    never include journal content.
 *
 * Schema notes: journey_events / growth_events are append-only (no UPDATE
 * policy), so they are inserted with ignoreDuplicates. chapters_read upserts
 * on (user_id, book_slug, chapter) — see migration 0002.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSyncControlClient,
  createSyncClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { useQuestOS } from "@/lib/questos/store";
import type {
  QuestOSSnapshot,
  Settings,
  SyncTombstones,
} from "@/lib/questos/types";
import { DEFAULT_SETTINGS, emptyTombstones } from "@/lib/questos/types";
import { useSyncStatus } from "./status";
import {
  clearInitialSyncPending,
  clearLocalJourneyClaimPending,
  initialSyncIsPending,
  localJourneyClaimIsPending,
  markInitialSyncPending,
  readLocalJourneyOwner,
  setLastSyncedUserId,
} from "./last-user";
import { sealJourneyBackupOwner } from "@/lib/native/journey-backup";
import { accountLifecycleIsActive } from "@/lib/auth/account-lifecycle";
import { track } from "@/lib/analytics/events";
import {
  classifyOperationalError,
  reportClientSignal,
} from "@/lib/observability/client-signals";
import {
  bookmarkToRow,
  chapterReadToRow,
  completionToRow,
  growthEventToRow,
  guidedProgressToRows,
  journeyEventToRow,
  milestoneToRow,
  myQuestToRow,
  prayerToRow,
  profileToRow,
  readingPositionToRow,
  recentVerseToRow,
  transmittableRecentVerseRows,
  reflectionToRow,
  rowsToSettings,
  settingsToRows,
  rowToAssignment,
  rowToBookmark,
  rowToChapterRead,
  rowToCompletion,
  rowToGrowthEvent,
  rowsToGuidedProgress,
  rowToJourneyEvent,
  rowToMilestone,
  rowToMyQuest,
  rowToPrayer,
  rowToProfile,
  rowToReadingPosition,
  rowToRecentVerse,
  rowToReflection,
} from "./mapping";
import { mergeGuidedProgressRecords } from "@/lib/guided/progress";
import {
  configureDailyQuestSyncContext,
  createDailyQuestSyncContext,
  DailyQuestConflictError,
  isMissingDailyQuestRevisionTable,
  reconcileDailyQuestPull,
  resetDailyQuestSyncContext,
  restoreDailyQuestSyncContext,
  writeDailyQuestAssignments,
  type DailyQuestRevisionRow,
} from "./daily-quests";
import { accountSyncAvailable } from "./containment";
import { assertAccountSyncContracts } from "./contracts";
import {
  MutableAccountSyncConflictError,
  writeMutableAccountRows,
  type MutableAccountTable,
} from "./mutable-writes";
import {
  advanceMutableRevisionGeneration,
  createMutableRevisionContext,
  mutableResourceKey,
  reconcileMutableRows,
  replaceMutableRevisionGeneration,
  resetMutableRevisionContext,
  restoreMutableRevisionContext,
  type MutableRevisionRemoval,
  type ReconciledMutableRow,
} from "./mutable-revisions";
import {
  registerReconciliationTriggers,
  type ReconciliationTriggerController,
} from "./reconciliation";
import {
  accountSyncResetRequired,
  clearAccountSyncResetRequired,
  getAccountSyncGeneration,
  markAccountSyncResetRequired,
  setAccountSyncGeneration,
} from "./generation";
import {
  AccountSyncGenerationConflictError,
  deleteAccountSyncRows,
  isAccountSyncGenerationConflict,
  purgeAccountSyncRows,
  readAccountSyncGeneration,
  type AccountDeletion,
} from "./generation-boundary";
import { DeadlineError } from "@/lib/async/deadline";
import { withSyncRequestDeadline } from "./request";

type SyncedField =
  | "profile"
  | "settings"
  | "assignments"
  | "myQuests"
  | "completions"
  | "prayers"
  | "reflections"
  | "journeyEvents"
  | "growthEvents"
  | "earnedMilestones"
  | "bookmarks"
  | "readingPosition"
  | "chaptersRead"
  | "recentVerses"
  | "guidedProgress";

const SYNCED_FIELDS: SyncedField[] = [
  "profile",
  "settings",
  "assignments",
  "myQuests",
  "completions",
  "prayers",
  "reflections",
  "journeyEvents",
  "growthEvents",
  "earnedMilestones",
  "bookmarks",
  "readingPosition",
  "chaptersRead",
  "recentVerses",
  "guidedProgress",
];

const PUSH_DEBOUNCE_MS = 2_500;
const RETRY_MS = 30_000;

/** Ignores media-only metadata that has its own authenticated RPC boundary. */
export function syncedProfileChanged(
  current: QuestOSSnapshot["profile"],
  previous: QuestOSSnapshot["profile"],
): boolean {
  if (current === previous) return false;
  if (!current || !previous) return current !== previous;
  return (
    current.displayName !== previous.displayName ||
    current.primaryGoal !== previous.primaryGoal ||
    current.tradition !== previous.tradition ||
    current.dailyRhythm !== previous.dailyRhythm ||
    current.questStyle !== previous.questStyle ||
    current.calling !== previous.calling ||
    current.onboardingCompleted !== previous.onboardingCompleted ||
    current.createdAt !== previous.createdAt ||
    current.updatedAt !== previous.updatedAt
  );
}

function mentionsSchemaIdentifier(message: string, identifier: string) {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(^|[^a-z0-9_])${escaped}(?![a-z0-9_])`,
    "i",
  ).test(message);
}

/**
 * Additive migrations are intentionally safe to roll out after a compatible
 * web bundle. During that window PostgREST can report either PostgreSQL's
 * missing-resource codes or its own schema-cache codes. Callers must still
 * name the exact optional resource they support; every other sync error fails
 * closed.
 */
function isMissingSyncColumn(error: unknown, column: string): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  return (
    mentionsSchemaIdentifier(message, column) &&
    (code === "42703" || code === "PGRST204")
  );
}

export function isMissingBibleSyncColumn(
  error: unknown,
  column: "preferred_bible_translation" | "translation_key",
): boolean {
  return isMissingSyncColumn(error, column);
}

export function isMissingRecentVersesTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  return (
    mentionsSchemaIdentifier(message, "user_recent_verses") &&
    (code === "42P01" || code === "PGRST205")
  );
}

// ---------------------------------------------------------------------------
// Engine lifecycle state (module singleton — one engine per tab)
// ---------------------------------------------------------------------------

let currentUserId: string | null = null;
/** Monotonic token — a stop/start invalidates any in-flight initial sync. */
let runToken = 0;
let unsubscribe: (() => void) | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;
let pushLifecycleToken = 0;
let rerunAfterPush = false;
let reconciliationRequested = false;
let reconciliationTriggers: ReconciliationTriggerController | null = null;
let applyingRemote = false;
let writeThroughReady = false;
let localMutationVersion = 0;
const dirty = new Set<SyncedField>();
const dailyQuestSyncContext = createDailyQuestSyncContext();
const mutableRevisionContext = createMutableRevisionContext();
let mutableLocalRebase: { generation: number; userId: string } | null = null;

function setStatus(
  state: "off" | "syncing" | "idle" | "error",
  options?: {
    syncedNow?: boolean;
    initialSyncComplete?: boolean;
    issue?: "daily-quest-conflict" | null;
  },
) {
  useSyncStatus.getState().setState(state, {
    lastSyncedAt: options?.syncedNow ? new Date().toISOString() : undefined,
    userId: currentUserId,
    initialSyncComplete: options?.initialSyncComplete ?? false,
    issue: options?.issue,
  });
}

export function stopSync() {
  currentUserId = null;
  runToken++;
  pushLifecycleToken++;
  pushing = false;
  unsubscribe?.();
  unsubscribe = null;
  reconciliationTriggers?.stop();
  reconciliationTriggers = null;
  if (pushTimer) clearTimeout(pushTimer);
  if (retryTimer) clearTimeout(retryTimer);
  pushTimer = null;
  retryTimer = null;
  reconciliationRequested = false;
  rerunAfterPush = false;
  writeThroughReady = false;
  localMutationVersion = 0;
  dirty.clear();
  resetDailyQuestSyncContext(dailyQuestSyncContext);
  resetMutableRevisionContext(mutableRevisionContext);
  setStatus("off", { initialSyncComplete: false });
}

export async function startSync(userId: string, retryingFailure = false) {
  // Fail closed before creating a Supabase client or changing local ownership.
  if (accountLifecycleIsActive()) return;
  if (!accountSyncAvailable(isSupabaseConfigured())) {
    stopSync();
    return;
  }
  if (currentUserId === userId) return;
  const localOwner = readLocalJourneyOwner();
  const lastSyncedUserId =
    localOwner.status === "owned" ? localOwner.userId : null;
  // The device still holds a journey last synced by a DIFFERENT account.
  // Refuse to sync — merging here would copy that user's private prayers and
  // reflections into this account's rows. SyncManager detects the same
  // condition and asks the person to either start fresh or claim the data;
  // resolution calls setLastSyncedUserId and retries.
  if (
    localOwner.status === "unavailable" ||
    (localOwner.status === "owned" && localOwner.userId !== userId)
  ) {
    // Also tear down any previous account subscriber. Refusing the new merge
    // is not enough if an older engine could keep writing through the newly
    // changed auth session while the privacy hand-off is unanswered.
    stopSync();
    return;
  }
  if (lastSyncedUserId !== userId) {
    try {
      await markInitialSyncPending(userId);
    } catch {
      stopSync();
      return;
    }
  }
  const previousStatus = useSyncStatus.getState();
  const wasError =
    retryingFailure ||
    (previousStatus.state === "error" && previousStatus.userId === userId);
  stopSync();
  currentUserId = userId;
  restoreDailyQuestSyncContext(
    dailyQuestSyncContext,
    userId,
    lastSyncedUserId === userId,
  );
  const token = ++runToken;
  let acceptingWork = true;
  const engineOwnsUser = () =>
    runToken === token && currentUserId === userId;
  const isCurrent = () => engineOwnsUser() && acceptingWork;
  // Remember whether we're inside a failure streak BEFORE flipping to
  // "syncing", so retries don't re-count sync_failed every 30s.
  setStatus("syncing", { initialSyncComplete: false });

  // Subscribe before the first network request so edits made during a slow
  // pull or push are retained as dirty work. The readiness latch prevents a
  // blind write until the complete initial pull -> merge -> push succeeds.
  unsubscribe = useQuestOS.subscribe((state, prev) => {
    if (applyingRemote) return;
    let changed = false;
    for (const field of SYNCED_FIELDS) {
      const fieldChanged =
        field === "profile"
          ? syncedProfileChanged(state.profile, prev.profile)
          : state[field] !== prev[field];
      if (fieldChanged) {
        dirty.add(field);
        changed = true;
      }
    }
    if (state.tombstones !== prev.tombstones) changed = true;
    if (changed) localMutationVersion += 1;
    if (changed && writeThroughReady) schedulePush();
  });

  try {
    // Each remote request is bounded independently; large local merges and
    // paginated restores are allowed to take as long as their real work needs.
    await initialSync(
      createSyncControlClient(userId),
      userId,
      lastSyncedUserId,
      isCurrent,
    );
    if (!isCurrent()) return; // stopped/restarted mid-sync
    await clearInitialSyncPending(userId);
    await clearLocalJourneyClaimPending(userId);
    writeThroughReady = true;
    setStatus("idle", { syncedNow: true, initialSyncComplete: true });
    track("sync_completed", { status: "initial" });
    reportClientSignal({
      surface: "sync",
      stage: "initial",
      outcome: "success",
      category: "ok",
    });
  } catch (error) {
    // A timed-out SDK promise cannot be cancelled reliably. Mark its run stale
    // so every later checkpoint ignores it while recovery UI becomes usable.
    if (error instanceof DeadlineError) acceptingWork = false;
    if (!engineOwnsUser()) return;
    const generationConflict =
      error instanceof AccountSyncGenerationConflictError;
    if (generationConflict) {
      // The merge may already be persisted when another device advances the
      // destructive generation. Quarantine it across reloads until the next
      // pull replaces stale account fields with the server baseline.
      await markInitialSyncPending(userId);
      await markAccountSyncResetRequired(
        userId,
        getAccountSyncGeneration(userId) ?? 0,
      );
    }
    // One event per failure streak, not one per 30s retry — a long
    // offline stretch shouldn't flood the queue with identical failures.
    if (!wasError) {
      track("sync_failed", { status: "initial" });
      reportClientSignal({
        surface: "sync",
        stage: "initial",
        outcome: "failure",
        category:
            error instanceof DailyQuestConflictError ||
            error instanceof MutableAccountSyncConflictError ||
            generationConflict
            ? "conflict"
            : classifyOperationalError(error),
      });
    }
    setStatus("error", {
      initialSyncComplete: false,
      issue:
        error instanceof DailyQuestConflictError
          ? "daily-quest-conflict"
          : null,
    });
    // NEVER fall through to write-through pushes before a successful pull —
    // a blind push would upsert this device's (possibly default/stale) data
    // over the account. Retry the full pull→merge instead, and install no
    // subscriber until it succeeds.
    retryTimer = setTimeout(() => {
      if (!engineOwnsUser()) return;
      void retrySync(userId);
    }, generationConflict && !wasError ? 0 : RETRY_MS);
    return;
  }

  if (!isCurrent()) return;

  // Reconcile the account copy whenever this tab regains a usable network or
  // foreground state. Busy local pushes finish first, then request one full
  // pull -> merge -> push so a second device's changes cannot be missed.
  if (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof navigator !== "undefined"
  ) {
    reconciliationTriggers = registerReconciliationTriggers({
      reconcile: () => requestReconciliation(userId),
      onError: (error) => {
        reportClientSignal({
          surface: "sync",
          stage: "reconciliation",
          outcome: "failure",
          category: classifyOperationalError(error),
        });
      },
    });
  }

  // A clear/restore/deletion that landed while the initial sync's network
  // calls were in flight predates the subscriber and would otherwise sit
  // unpushed until the next local change — catch it up now. (runPush widens
  // a purge push to all fields itself.)
  const pending = useQuestOS.getState().tombstones;
  if (
    dirty.size > 0 ||
    pending.purgeAccount === userId ||
    pending.prayers.length ||
    pending.reflections.length ||
    pending.bookmarks.length ||
    pending.myQuests.length
  ) {
    schedulePush();
  }
}

/**
 * Deliberately restart the full pull → merge → push for an authenticated
 * account. Unlike startSync(), this is allowed to replace a failed run for
 * the same user, which gives recovery UI a real Retry action instead of being
 * swallowed by the same-user guard.
 */
export async function retrySync(userId: string) {
  const status = useSyncStatus.getState();
  const retryingFailure = status.state === "error" && status.userId === userId;
  stopSync();
  await startSync(userId, retryingFailure);
}

/** Defer a foreground/network reconciliation until any local push settles. */
async function requestReconciliation(userId: string) {
  if (currentUserId !== userId) return;
  if (pushing || pushTimer) {
    reconciliationRequested = true;
    return;
  }
  reconciliationRequested = false;
  await retrySync(userId);
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(runPush, PUSH_DEBOUNCE_MS);
}

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    for (const f of SYNCED_FIELDS) dirty.add(f);
    runPush();
  }, RETRY_MS);
}

/** Retry the complete pull/merge flow after a server-side timestamp conflict. */
function scheduleReconciliationRetry(userId: string) {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    if (currentUserId !== userId) return;
    void retrySync(userId);
  }, RETRY_MS);
}

async function runPush() {
  pushTimer = null;
  const userId = currentUserId;
  if (!userId) return;
  if (pushing) {
    rerunAfterPush = true;
    return;
  }
  const lifecycleToken = pushLifecycleToken;
  const engineToken = runToken;
  const isCurrent = () =>
    lifecycleToken === pushLifecycleToken &&
    engineToken === runToken &&
    currentUserId === userId;
  pushing = true;
  const wasError = useSyncStatus.getState().state === "error";
  setStatus("syncing", { initialSyncComplete: true });
  try {
    const controlClient = createSyncControlClient(userId);
    const state = useQuestOS.getState();
    const tombstones = state.tombstones;
    // A purge empties the whole account copy, so the push that follows must
    // rebuild every collection from local state — not just the dirty ones.
    const fields = new Set(
      tombstones.purgeAccount === userId ? SYNCED_FIELDS : dirty
    );
    dirty.clear();

    const liveGeneration = await readAccountSyncGeneration(controlClient, userId);
    if (!isCurrent()) return;
    const storedGeneration = getAccountSyncGeneration(userId);
    const pendingDestruction = hasSyncTombstones(tombstones, userId);
    if (
      accountSyncResetRequired(userId) ||
      (storedGeneration !== liveGeneration && !pendingDestruction)
    ) {
      throw new AccountSyncGenerationConflictError();
    }
    const propagated = await propagateTombstones(
      controlClient,
      tombstones,
      userId,
      storedGeneration ?? liveGeneration,
      liveGeneration,
      isCurrent,
    );
    if (!isCurrent()) return;
    if (propagated.requiresServerReset) {
      throw new AccountSyncGenerationConflictError();
    }
    if (mutableRevisionContext.generation !== propagated.generation) {
      if (propagated.purged) {
        // A restore/clear purge intentionally establishes a new local baseline.
        // Reset both CAS protocols before returning for the empty-server pull.
        configureDailyQuestSyncContext(dailyQuestSyncContext, [], true);
        replaceMutableRevisionGeneration(
          mutableRevisionContext,
          userId,
          propagated.generation,
        );
        mutableLocalRebase = { userId, generation: propagated.generation };
        reconciliationRequested = true;
        return;
      }
      // A partial tombstone changes the destructive generation but leaves
      // every surviving row revision valid. Carry those fingerprints forward
      // and remove only the exact deleted keys so unrelated stale local rows
      // cannot gain blanket rebase authority.
      advanceMutableRevisionGeneration(
        mutableRevisionContext,
        userId,
        propagated.generation,
        mutableRevisionRemovals(tombstones),
      );
    }
    if (propagated.purged) {
      configureDailyQuestSyncContext(dailyQuestSyncContext, [], true);
    }
    const supabase = createSyncClient(userId, propagated.generation);
    await pushFields(
      supabase,
      userId,
      propagated.generation,
      snapshotFromStore(),
      fields,
      isCurrent,
    );
    if (!isCurrent()) return;
    // Re-stamp ownership on every successful push: "Clear my data" in
    // settings drops the marker, but anything written afterwards while still
    // signed in lands in this account's rows and belongs to it.
    await setLastSyncedUserId(userId);
    if (!(await sealJourneyBackupOwner(userId))) {
      throw new Error("The protected journey owner could not be sealed.");
    }
    if (!isCurrent()) return;
    if (currentUserId === userId) {
      setStatus("idle", { syncedNow: true, initialSyncComplete: true });
      reportClientSignal({
        surface: "sync",
        stage: "push",
        outcome: "success",
        category: "ok",
      });
    }
  } catch (error) {
    if (!isCurrent()) return;
    // Push failed (offline, etc.) — mark everything dirty again and retry.
    for (const f of SYNCED_FIELDS) dirty.add(f);
    if (currentUserId === userId) {
      // One event per failure streak (retries repeat every 30s).
      if (!wasError) {
        track("sync_failed", { status: "push" });
        reportClientSignal({
          surface: "sync",
          stage: "push",
          outcome: "failure",
          category:
          error instanceof DailyQuestConflictError ||
          error instanceof MutableAccountSyncConflictError ||
          error instanceof AccountSyncGenerationConflictError
              ? "conflict"
              : classifyOperationalError(error),
        });
      }
      setStatus("error", {
        initialSyncComplete: true,
        issue:
          error instanceof DailyQuestConflictError
            ? "daily-quest-conflict"
            : null,
      });
      if (
        error instanceof MutableAccountSyncConflictError ||
        error instanceof AccountSyncGenerationConflictError
      ) {
        scheduleReconciliationRetry(userId);
      } else {
        scheduleRetry();
      }
    }
  } finally {
    if (lifecycleToken !== pushLifecycleToken) return;
    pushing = false;
    if (reconciliationRequested && currentUserId === userId) {
      reconciliationRequested = false;
      rerunAfterPush = false;
      void retrySync(userId);
      return;
    }
    if (rerunAfterPush) {
      rerunAfterPush = false;
      schedulePush();
    }
  }
}

// ---------------------------------------------------------------------------
// Initial sync: pull -> merge -> apply -> push
// ---------------------------------------------------------------------------

async function initialSync(
  controlClient: SupabaseClient,
  userId: string,
  previousOwner: string | null,
  isCurrent: () => boolean
) {
  // Fail closed before touching user-owned tables when a deployment is paired
  // with an old, wrong, or incompletely migrated Supabase project.
  await assertAccountSyncContracts(controlClient);
  if (!isCurrent()) return;
  const storedGeneration = getAccountSyncGeneration(userId);
  const observedGeneration = await readAccountSyncGeneration(
    controlClient,
    userId,
  );
  if (!isCurrent()) return;
  restoreMutableRevisionContext(
    mutableRevisionContext,
    userId,
    observedGeneration,
    previousOwner === userId &&
      storedGeneration === observedGeneration &&
      !accountSyncResetRequired(userId),
  );
  // Owner is stamped immediately before the first import. If iOS terminates in
  // that crash window, the pending marker proves this is the interrupted guest
  // adoption rather than an older same-owner journey with a lost generation.
  const interruptedInitialAdoption =
    storedGeneration === null &&
    previousOwner === userId &&
    initialSyncIsPending(userId);
  let requiresServerReset =
    accountSyncResetRequired(userId) ||
    (storedGeneration !== null && storedGeneration !== observedGeneration) ||
    (storedGeneration === null &&
      previousOwner === userId &&
      !localJourneyClaimIsPending(userId) &&
      !interruptedInitialAdoption);

  // Resolve destructive intent before the pull so condemned rows can never
  // enter the merge. A successful whole-account purge intentionally makes
  // this device's empty/restored snapshot the new account baseline.
  const pendingBeforePull = useQuestOS.getState().tombstones;
  const propagated = await propagateTombstones(
    controlClient,
    pendingBeforePull,
    userId,
    storedGeneration ?? observedGeneration,
    observedGeneration,
    isCurrent,
  );
  if (!isCurrent()) return;
  requiresServerReset = propagated.preserveLocalBaseline
    ? false
    : propagated.recoveredOwnAdvance
      ? false
      : requiresServerReset || propagated.requiresServerReset;
  if (propagated.purged) {
    configureDailyQuestSyncContext(dailyQuestSyncContext, [], true);
  }
  if (mutableRevisionContext.generation !== propagated.generation) {
    const partialDelete =
      pendingBeforePull.purgeAccount !== userId &&
      hasSyncTombstones(pendingBeforePull, userId);
    if (partialDelete && !propagated.requiresServerReset) {
      // A safe partial delete preserves every unrelated row revision across
      // reload, so offline edits still rebase instead of becoming server loss.
      advanceMutableRevisionGeneration(
        mutableRevisionContext,
        userId,
        propagated.generation,
        mutableRevisionRemovals(pendingBeforePull),
      );
    } else {
      replaceMutableRevisionGeneration(
        mutableRevisionContext,
        userId,
        propagated.generation,
      );
    }
  }

  const supabase = createSyncClient(userId, propagated.generation);
  const pulled = await pullAll(supabase, userId);
  if (!isCurrent()) return;
  const verifiedGeneration = await readAccountSyncGeneration(supabase, userId);
  if (verifiedGeneration !== propagated.generation) {
    throw new AccountSyncGenerationConflictError();
  }
  const remote = pulled.snapshot;

  let tombstones: SyncTombstones;
  let mergeLocal: QuestOSSnapshot;
  let remoteKept: RemoteData;
  let revisioned: Partial<QuestOSSnapshot>;
  // Hashing is asynchronous. If a local edit lands during reconciliation,
  // repeat against the new store snapshot before the synchronous import so
  // the write-through latch never has to recover an edit already overwritten.
  while (true) {
    const mergeVersion = localMutationVersion;
    tombstones = useQuestOS.getState().tombstones;
    const local = snapshotFromStore();
    mergeLocal = requiresServerReset
      ? serverAuthoritativeBaseline(local)
      : local;
    // A genuinely first account may adopt an already-onboarded guest journey
    // without a separate cross-account handoff. A fresh/empty browser and a
    // same-owner v4 upgrade remain server-authoritative when no CAS baseline
    // exists, so default local settings cannot replace an account copy.
    const firstGuestAdoption =
      (previousOwner === null || interruptedInitialAdoption) &&
      Boolean(local.profile?.onboardingCompleted);
    const existingOnboardedAccount = pulled.mutableRows.profile.some(
      (row) => row.onboarding_completed === true,
    );
    const explicitLocalAuthority =
      localJourneyClaimIsPending(userId) ||
      (mutableLocalRebase?.userId === userId &&
        mutableLocalRebase.generation === propagated.generation) ||
      propagated.preserveLocalBaseline ||
      propagated.recoveredOwnAdvance;
    // A pending purge for this account condemns the whole account copy.
    remoteKept =
      tombstones.purgeAccount === userId
        ? {}
        : filterByTombstones(remote, tombstones);
    revisioned = await reconcileRevisionedMutableSnapshot(
      userId,
      mergeLocal,
      pulled.mutableRows,
      tombstones,
      explicitLocalAuthority ||
        (firstGuestAdoption && !existingOnboardedAccount),
      firstGuestAdoption && existingOnboardedAccount,
    );
    if (!isCurrent()) return;
    if (mergeVersion === localMutationVersion) break;
  }
  const dailyAssignments = reconcileDailyQuestPull(
    dailyQuestSyncContext,
    mergeLocal.assignments,
    remoteKept.assignments ?? {},
    pulled.dailyQuestRevisions,
    pulled.transactionalDailyQuestsAvailable,
  );
  const merged = normalizeIds({
    ...mergeSnapshots(mergeLocal, remoteKept),
    ...revisioned,
    assignments: dailyAssignments,
  });

  // Stamp the owner before applying account data. A failed durable write must
  // never leave an account journey looking like adoptable guest data.
  await setLastSyncedUserId(userId);
  applyingRemote = true;
  try {
    useQuestOS.getState().importData(merged);
  } finally {
    applyingRemote = false;
  }
  if (
    !(await setAccountSyncGeneration(userId, propagated.generation)) ||
    !(await clearAccountSyncResetRequired(userId))
  ) {
    throw new Error("Account sync generation could not be persisted.");
  }
  if (!(await sealJourneyBackupOwner(userId))) {
    throw new Error("The protected journey owner could not be sealed.");
  }
  if (!isCurrent()) return;

  // importData repairs legacy ledgers; push that normalized store snapshot so
  // its stable Journey sources survive deletion and the next device restore.
  await pushFields(
    supabase,
    userId,
    propagated.generation,
    snapshotFromStore(),
    new Set(SYNCED_FIELDS),
    isCurrent,
  );
  if (
    mutableLocalRebase?.userId === userId &&
    mutableLocalRebase.generation === propagated.generation
  ) {
    mutableLocalRebase = null;
  }
}

function snapshotFromStore(): QuestOSSnapshot {
  const s = useQuestOS.getState();
  return {
    profile: s.profile,
    settings: s.settings,
    assignments: s.assignments,
    myQuests: s.myQuests,
    completions: s.completions,
    prayers: s.prayers,
    reflections: s.reflections,
    journeyEvents: s.journeyEvents,
    growthEvents: s.growthEvents,
    earnedMilestones: s.earnedMilestones,
    bookmarks: s.bookmarks,
    readingPosition: s.readingPosition,
    chaptersRead: s.chaptersRead,
    recentVerses: s.recentVerses,
    pendingMilestones: s.pendingMilestones,
    lastVisitDateKey: s.lastVisitDateKey,
    // Device-local; not synced, but MUST ride through the merge-apply —
    // importData resets any omitted field to its default, which would
    // extinguish the candle on every signed-in launch.
    streak: s.streak,
    // Same deal: device-local nudge bookkeeping must survive merge-apply
    // or every signed-in launch would forget past dismissals.
    accountNudge: s.accountNudge,
    guidedProgress: s.guidedProgress,
  };
}

/** Build an empty account baseline while preserving intentionally local UI state. */
export function serverAuthoritativeBaseline(
  local: QuestOSSnapshot,
): QuestOSSnapshot {
  return {
    profile: null,
    settings: {
      ...DEFAULT_SETTINGS,
      appearance: { ...local.settings.appearance },
      notifications: { ...DEFAULT_SETTINGS.notifications },
      questDurationPreference: [],
      questCategoryPreference: [],
      analyticsConsent: local.settings.analyticsConsent,
    },
    assignments: {},
    myQuests: {},
    completions: [],
    prayers: [],
    reflections: [],
    journeyEvents: [],
    growthEvents: [],
    earnedMilestones: [],
    bookmarks: [],
    readingPosition: null,
    chaptersRead: [],
    recentVerses: [],
    pendingMilestones: local.pendingMilestones,
    lastVisitDateKey: local.lastVisitDateKey,
    streak: local.streak,
    accountNudge: local.accountNudge,
    guidedProgress: Object.fromEntries(
      Object.entries(local.guidedProgress ?? {}).filter(
        ([, progress]) => progress.kind === "daily",
      ),
    ),
  };
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

type RemoteData = Partial<QuestOSSnapshot> & {
  /** Distinguishes an absent row from real all-disabled preferences. */
  notificationPreferencesPresent?: boolean;
};

interface PulledData {
  snapshot: RemoteData;
  dailyQuestRevisions: DailyQuestRevisionRow[];
  mutableRows: MutablePulledRows;
  transactionalDailyQuestsAvailable: boolean;
}

interface MutablePulledRows {
  bookmarks: Record<string, unknown>[];
  notificationPreferences: Record<string, unknown>[];
  prayers: Record<string, unknown>[];
  profile: Record<string, unknown>[];
  readingPosition: Record<string, unknown>[];
  recentVerses: Record<string, unknown>[];
  reflections: Record<string, unknown>[];
  settings: Record<string, unknown>[];
  userQuests: Record<string, unknown>[];
}

interface PullOrder {
  column: string;
  ascending?: boolean;
}

interface PaginatedPullResult {
  data: Record<string, unknown>[] | null;
  error: unknown;
}

const ACCOUNT_PULL_PAGE_SIZE = 1_000;
const ACCOUNT_PULL_MAX_PAGES = 100;
const ACCOUNT_PULL_MAX_ROWS: Readonly<Record<string, number>> = {
  user_daily_quest_days: 5_000,
  user_daily_quests: 20_000,
  user_quests: 5_000,
  quest_completions: 25_000,
  prayers: 10_000,
  reflections: 10_000,
  verse_bookmarks: 10_000,
  chapters_read: 2_000,
  user_recent_verses: 100,
  user_guided_movements: 20_000,
  journey_events: 50_000,
  growth_events: 50_000,
  user_milestones: 1_000,
};

/**
 * Read a complete account collection without trusting PostgREST's 1,000-row
 * response cap. Every order ends in a unique key, so adjacent ranges cannot
 * silently skip tied rows; the hard page ceiling fails closed instead of
 * treating a truncated account as canonical deletion evidence.
 */
async function pullAccountRows(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  orders: readonly PullOrder[],
  userId?: string,
): Promise<PaginatedPullResult> {
  const maxRows = ACCOUNT_PULL_MAX_ROWS[table];
  if (!maxRows) {
    throw new Error(`Account pull limit is missing for ${table}.`);
  }
  const rows: Record<string, unknown>[] = [];
  let start = 0;
  for (let page = 0; page < ACCOUNT_PULL_MAX_PAGES; page += 1) {
    let query = supabase.from(table).select(columns);
    if (userId) query = query.eq("user_id", userId);
    for (const order of orders) {
      query = query.order(order.column, {
        ascending: order.ascending ?? true,
      });
    }
    const response = await withSyncRequestDeadline(
      query.range(start, start + ACCOUNT_PULL_PAGE_SIZE - 1),
      `Account ${table} pull`,
    );
    if (response.error) return { data: null, error: response.error };
    const pageRows = (response.data ?? []) as unknown as Record<
      string,
      unknown
    >[];
    if (pageRows.length === 0) {
      return { data: rows, error: null };
    }
    rows.push(...pageRows);
    if (rows.length > maxRows) {
      throw new Error(`Account pull exceeded the safe row limit for ${table}.`);
    }
    // Advance by what the server actually returned because a project-level
    // max_rows setting may be lower than the requested 1,000-row range.
    start += pageRows.length;
  }
  throw new Error(`Account pull exceeded the safe page limit for ${table}.`);
}

/** Encode the recent-verse natural key without using device timestamps. */
function recentVerseNaturalKey(row: object): string {
  const key = mutableResourceKey("user_recent_verses", row);
  return JSON.stringify([
    key.book_slug,
    key.chapter,
    key.verse_start,
    key.verse_end,
  ]);
}

/** Validate and index the server-owned receipt clock used for bounded history. */
function recentVerseServerOrder(
  rows: readonly Record<string, unknown>[],
): Map<string, number> {
  const order = new Map<string, number>();
  for (const row of rows) {
    const seenAt = row.server_seen_at;
    const timestamp = typeof seenAt === "string" ? Date.parse(seenAt) : NaN;
    if (
      typeof seenAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(seenAt) ||
      !Number.isFinite(timestamp)
    ) {
      throw new Error("Recent verse server ordering is unavailable.");
    }
    order.set(recentVerseNaturalKey(row), timestamp);
  }
  return order;
}

/** Keep local actions first, then rank canonical rows by server receipt time. */
function orderRecentVerseRows(
  rows: readonly ReconciledMutableRow[],
  localRows: readonly object[],
  remoteRows: readonly Record<string, unknown>[],
): ReconciledMutableRow[] {
  const localOrder = new Map(
    localRows.map((row, index) => [recentVerseNaturalKey(row), index]),
  );
  const serverOrder = recentVerseServerOrder(remoteRows);
  return [...rows].sort((left, right) => {
    if (left.localIntent !== right.localIntent) {
      return left.localIntent ? -1 : 1;
    }
    const leftKey = recentVerseNaturalKey(left.key);
    const rightKey = recentVerseNaturalKey(right.key);
    if (left.localIntent) {
      const localDelta =
        (localOrder.get(leftKey) ?? Number.MAX_SAFE_INTEGER) -
        (localOrder.get(rightKey) ?? Number.MAX_SAFE_INTEGER);
      if (localDelta !== 0) return localDelta;
    } else {
      const leftSeenAt = serverOrder.get(leftKey);
      const rightSeenAt = serverOrder.get(rightKey);
      if (leftSeenAt === undefined || rightSeenAt === undefined) {
        throw new Error("Recent verse server ordering is unavailable.");
      }
      if (leftSeenAt !== rightSeenAt) return rightSeenAt - leftSeenAt;
    }
    return leftKey.localeCompare(rightKey);
  });
}

async function pullAll(
  supabase: SupabaseClient,
  userId: string,
): Promise<PulledData> {
  // Observe revisions before rows. A write between these statements advances
  // the revision and guarantees the later replace conflicts instead of pairing
  // an older row snapshot with a newer revision.
  const dailyRevisionRes = await pullAccountRows(
    supabase,
    "user_daily_quest_days",
    "assigned_date,revision",
    [{ column: "assigned_date" }],
  );
  const dailyRevisionsUnavailable = isMissingDailyQuestRevisionTable(
    dailyRevisionRes.error,
  );
  if (dailyRevisionRes.error && !dailyRevisionsUnavailable) {
    throw dailyRevisionRes.error;
  }

  const [
    profileRes,
    settingsRes,
    notifRes,
    dailyRes,
    myQuestsRes,
    completionsRes,
    prayersRes,
    reflectionsRes,
    bookmarksRes,
    readingRes,
    chaptersRes,
    recentVersesRes,
    guidedMovementsRes,
    journeyRes,
    growthRes,
    milestonesRes,
  ] = await Promise.all([
    withSyncRequestDeadline(
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      "Account profile pull",
    ),
    withSyncRequestDeadline(
      supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      "Account settings pull",
    ),
    withSyncRequestDeadline(
      supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      "Account notification preferences pull",
    ),
    pullAccountRows(
      supabase,
      "user_daily_quests",
      "*",
      [{ column: "assigned_date" }, { column: "quest_slug" }],
      userId,
    ),
    pullAccountRows(
      supabase,
      "user_quests",
      "*",
      [{ column: "quest_slug" }],
      userId,
    ),
    pullAccountRows(
      supabase,
      "quest_completions",
      "*",
      [{ column: "completed_at" }, { column: "id" }],
      userId,
    ),
    pullAccountRows(
      supabase,
      "prayers",
      "*",
      [{ column: "created_at" }, { column: "id" }],
      userId,
    ),
    pullAccountRows(
      supabase,
      "reflections",
      "*",
      [{ column: "created_at" }, { column: "id" }],
      userId,
    ),
    pullAccountRows(
      supabase,
      "verse_bookmarks",
      "*",
      [{ column: "created_at" }, { column: "id" }],
      userId,
    ),
    withSyncRequestDeadline(
      supabase
        .from("reading_progress")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      "Account reading position pull",
    ),
    pullAccountRows(
      supabase,
      "chapters_read",
      "*",
      [{ column: "read_on" }, { column: "id" }],
      userId,
    ),
    pullAccountRows(
      supabase,
      "user_recent_verses",
      "*",
      [
        { column: "server_seen_at" },
        { column: "book_slug" },
        { column: "chapter" },
        { column: "verse_start" },
        { column: "verse_end" },
      ],
      userId,
    ),
    pullAccountRows(
      supabase,
      "user_guided_movements",
      "*",
      [
        { column: "occurred_at" },
        { column: "session_key" },
        { column: "movement_key" },
      ],
      userId,
    ),
    pullAccountRows(
      supabase,
      "journey_events",
      "*",
      [{ column: "occurred_at" }, { column: "id" }],
      userId,
    ),
    pullAccountRows(
      supabase,
      "growth_events",
      "*",
      [{ column: "occurred_at" }, { column: "id" }],
      userId,
    ),
    pullAccountRows(
      supabase,
      "user_milestones",
      "*",
      [{ column: "achieved_at" }, { column: "id" }],
      userId,
    ),
  ]);

  // Recent-verse history was introduced in 0010 and is non-essential to the
  // core journey restore. A pre-0010 database may omit only this table while a
  // compatible client keeps the rest of the account usable. Permission,
  // policy, query, and every other table error remain fatal.
  const recentVersesUnavailable = isMissingRecentVersesTable(
    recentVersesRes.error,
  );
  const all = [
    profileRes,
    settingsRes,
    notifRes,
    dailyRes,
    myQuestsRes,
    completionsRes,
    prayersRes,
    reflectionsRes,
    bookmarksRes,
    readingRes,
    chaptersRes,
    journeyRes,
    growthRes,
    milestonesRes,
    guidedMovementsRes,
  ];
  for (const res of all) {
    if (res.error) throw res.error;
  }
  if (recentVersesRes.error && !recentVersesUnavailable) {
    throw recentVersesRes.error;
  }

  const assignments: QuestOSSnapshot["assignments"] = {};
  for (const row of dailyRes.data ?? []) {
    const a = rowToAssignment(row as never);
    (assignments[a.dateKey] ??= []).push(a);
  }

  const myQuests: NonNullable<QuestOSSnapshot["myQuests"]> = {};
  for (const row of myQuestsRes.data ?? []) {
    const q = rowToMyQuest(row as never);
    myQuests[q.questSlug] = q;
  }

  return {
    dailyQuestRevisions: dailyRevisionsUnavailable
      ? []
      : ((dailyRevisionRes.data ?? []) as unknown as DailyQuestRevisionRow[]),
    transactionalDailyQuestsAvailable: !dailyRevisionsUnavailable,
    mutableRows: {
      bookmarks: (bookmarksRes.data ?? []) as Record<string, unknown>[],
      notificationPreferences: notifRes.data
        ? [notifRes.data as Record<string, unknown>]
        : [],
      prayers: (prayersRes.data ?? []) as Record<string, unknown>[],
      profile: profileRes.data
        ? [profileRes.data as Record<string, unknown>]
        : [],
      readingPosition: readingRes.data
        ? [readingRes.data as Record<string, unknown>]
        : [],
      recentVerses: recentVersesUnavailable
        ? []
        : ((recentVersesRes.data ?? []) as Record<string, unknown>[]),
      reflections: (reflectionsRes.data ?? []) as Record<string, unknown>[],
      settings: settingsRes.data
        ? [settingsRes.data as Record<string, unknown>]
        : [],
      userQuests: (myQuestsRes.data ?? []) as Record<string, unknown>[],
    },
    snapshot: {
      profile: profileRes.data ? rowToProfile(profileRes.data) : null,
      settings:
        settingsRes.data || notifRes.data
          ? rowsToSettings(settingsRes.data ?? null, notifRes.data ?? null)
          : undefined,
      notificationPreferencesPresent: Boolean(notifRes.data),
      assignments,
      myQuests,
      completions: (completionsRes.data ?? []).map((row) =>
        rowToCompletion(row as never),
      ),
      prayers: (prayersRes.data ?? []).map((row) =>
        rowToPrayer(row as never),
      ),
      reflections: (reflectionsRes.data ?? []).map((row) =>
        rowToReflection(row as never),
      ),
      bookmarks: (bookmarksRes.data ?? []).map((row) =>
        rowToBookmark(row as never),
      ),
      readingPosition: readingRes.data
        ? rowToReadingPosition(readingRes.data)
        : null,
      chaptersRead: (chaptersRes.data ?? []).map((row) =>
        rowToChapterRead(row as never),
      ),
      recentVerses: recentVersesUnavailable
        ? undefined
        : (recentVersesRes.data ?? []).map((row) =>
            rowToRecentVerse(row as never),
          ),
      journeyEvents: (journeyRes.data ?? []).map((row) =>
        rowToJourneyEvent(row as never),
      ),
      growthEvents: (growthRes.data ?? []).map((row) =>
        rowToGrowthEvent(row as never),
      ),
      earnedMilestones: (milestonesRes.data ?? []).map((row) =>
        rowToMilestone(row as never),
      ),
      guidedProgress: rowsToGuidedProgress(
        (guidedMovementsRes.data ?? []) as never,
      ),
    },
  };
}

/** Reconcile every mutable row through revision fingerprints, never wall time. */
async function reconcileRevisionedMutableSnapshot(
  userId: string,
  local: QuestOSSnapshot,
  remote: MutablePulledRows,
  tombstones: SyncTombstones,
  allowLocalWithoutBaseline: boolean,
  allowGuestInsertsWithoutBaseline: boolean,
): Promise<Partial<QuestOSSnapshot>> {
  const localSettingsRows = settingsToRows(userId, local.settings);
  const defaultSettingsRows = settingsToRows(userId, DEFAULT_SETTINGS);
  const localRecentVerseRows = (local.recentVerses ?? []).map((row) =>
    recentVerseToRow(userId, row),
  );
  const options = { allowLocalWithoutBaseline, expectedUserId: userId };
  const collectionOptions = {
    ...options,
    allowLocalInsertWithoutBaseline: allowGuestInsertsWithoutBaseline,
  };
  const remotePrayers = remote.prayers.filter(
    (row) => !tombstones.prayers.includes(String(row.id)),
  );
  const remoteReflections = remote.reflections.filter(
    (row) => !tombstones.reflections.includes(String(row.id)),
  );
  const remoteQuests = remote.userQuests.filter(
    (row) => !tombstones.myQuests.includes(String(row.quest_slug)),
  );
  const remoteBookmarks = remote.bookmarks.filter(
    (row) =>
      !tombstones.bookmarks.some(
        (deleted) =>
          deleted.bookSlug === row.book_slug &&
          deleted.chapter === row.chapter &&
          deleted.verse === row.verse &&
          (deleted.translationKey ?? "web") === row.translation_key,
      ),
  );

  // Absent preference rows have a logical all-default canonical baseline.
  // This prevents an untouched client from inserting defaults merely because
  // its local store always carries a complete Settings object.
  const remoteSettings = remote.settings.length
    ? remote.settings
    : [{ ...defaultSettingsRows.settings, sync_revision: 0 }];
  const remoteNotifications = remote.notificationPreferences.length
    ? remote.notificationPreferences
    : [{ ...defaultSettingsRows.notifications, sync_revision: 0 }];

  const [
    profiles,
    settings,
    notifications,
    prayers,
    reflections,
    quests,
    reading,
    bookmarks,
    recentVerses,
  ] = await Promise.all([
    reconcileMutableRows(
      mutableRevisionContext,
      "profiles",
      local.profile ? [profileToRow(userId, local.profile)] : [],
      remote.profile,
      options,
    ),
    reconcileMutableRows(
      mutableRevisionContext,
      "user_settings",
      [localSettingsRows.settings],
      remoteSettings,
      options,
    ),
    reconcileMutableRows(
      mutableRevisionContext,
      "notification_preferences",
      [localSettingsRows.notifications],
      remoteNotifications,
      options,
    ),
    reconcileMutableRows(
      mutableRevisionContext,
      "prayers",
      local.prayers.map((row) => prayerToRow(userId, row)),
      remotePrayers,
      collectionOptions,
    ),
    reconcileMutableRows(
      mutableRevisionContext,
      "reflections",
      local.reflections.map((row) => reflectionToRow(userId, row)),
      remoteReflections,
      collectionOptions,
    ),
    reconcileMutableRows(
      mutableRevisionContext,
      "user_quests",
      Object.values(local.myQuests ?? {}).map((row) =>
        myQuestToRow(userId, row),
      ),
      remoteQuests,
      collectionOptions,
    ),
    reconcileMutableRows(
      mutableRevisionContext,
      "reading_progress",
      local.readingPosition
        ? [readingPositionToRow(userId, local.readingPosition)]
        : [],
      remote.readingPosition,
      options,
    ),
    reconcileMutableRows(
      mutableRevisionContext,
      "verse_bookmarks",
      local.bookmarks.map((row) => bookmarkToRow(userId, row)),
      remoteBookmarks,
      collectionOptions,
    ),
    reconcileMutableRows(
      mutableRevisionContext,
      "user_recent_verses",
      localRecentVerseRows,
      remote.recentVerses,
      collectionOptions,
    ),
  ]);

  const settingRow = settings[0]?.row ?? null;
  const notificationRow = notifications[0]?.row ?? null;
  const accountSettings = rowsToSettings(
    settingRow as unknown as Parameters<typeof rowsToSettings>[0],
    notificationRow as unknown as Parameters<typeof rowsToSettings>[1],
  );
  const mergedSettings: Settings = {
    ...accountSettings,
    // Consent remains privacy-first even when the local settings row has a
    // pending revision: both observed copies must explicitly remain enabled.
    analyticsConsent:
      local.settings.analyticsConsent &&
      remote.settings[0]?.analytics_consent === true,
    appearance: {
      ...accountSettings.appearance,
      boldText: local.settings.appearance.boldText,
      wallpaperId: local.settings.appearance.wallpaperId,
      wallpaperMode: local.settings.appearance.wallpaperMode,
      glassSurfaces: local.settings.appearance.glassSurfaces,
      glassOpacity: local.settings.appearance.glassOpacity,
      myShepherdFloatingButton:
        local.settings.appearance.myShepherdFloatingButton,
    },
  };

  const localQuestRows = new Map(
    Object.values(local.myQuests ?? {}).map((quest) => [quest.questSlug, quest]),
  );
  const remoteQuestRows = new Map(
    remoteQuests.map((row) => [String(row.quest_slug), rowToMyQuest(row as never)]),
  );
  const myQuests = Object.fromEntries(
    quests.map((result) => {
      const chosen = rowToMyQuest(result.row as never);
      const localQuest = localQuestRows.get(chosen.questSlug);
      const remoteQuest = remoteQuestRows.get(chosen.questSlug);
      if (!localQuest || !remoteQuest) return [chosen.questSlug, chosen];
      const timesCompleted = Math.max(
        chosen.timesCompleted,
        localQuest.timesCompleted,
        remoteQuest.timesCompleted,
      );
      const completionSource =
        localQuest.timesCompleted > remoteQuest.timesCompleted
          ? localQuest
          : remoteQuest.timesCompleted > localQuest.timesCompleted
            ? remoteQuest
            : chosen;
      return [
        chosen.questSlug,
        {
          ...chosen,
          timesCompleted,
          completedAt: completionSource.completedAt ?? chosen.completedAt,
        },
      ];
    }),
  );

  const reconciledProfile = profiles[0]
    ? rowToProfile(profiles[0].row as never)
    : null;

  return {
    profile: preserveDeviceAvatarMarker(reconciledProfile, local.profile),
    settings: mergedSettings,
    myQuests,
    prayers: prayers.map((result) => rowToPrayer(result.row as never)),
    reflections: reflections.map((result) =>
      rowToReflection(result.row as never),
    ),
    readingPosition: reading[0]
      ? rowToReadingPosition(reading[0].row as never)
      : null,
    bookmarks: bookmarks.map((result) => rowToBookmark(result.row as never)),
    recentVerses: orderRecentVerseRows(
      recentVerses,
      localRecentVerseRows,
      remote.recentVerses,
    )
      .slice(0, 20)
      .map((result) => rowToRecentVerse(result.row as never)),
  };
}

export function filterByTombstones(
  remote: RemoteData,
  t: SyncTombstones
): RemoteData {
  const myQuests = remote.myQuests
    ? Object.fromEntries(
        Object.entries(remote.myQuests).filter(
          ([slug]) => !t.myQuests.includes(slug)
        )
      )
    : remote.myQuests;
  return {
    ...remote,
    prayers: remote.prayers?.filter((p) => !t.prayers.includes(p.id)),
    reflections: remote.reflections?.filter(
      (r) => !t.reflections.includes(r.id)
    ),
    bookmarks: remote.bookmarks?.filter(
      (b) =>
        !t.bookmarks.some(
          (d) =>
            d.bookSlug === b.bookSlug &&
            d.chapter === b.chapter &&
            d.verse === b.verse &&
            (d.translationKey ?? "web") === (b.translationKey ?? "web")
        )
    ),
    myQuests,
  };
}

// ---------------------------------------------------------------------------
// Merge — append-only unions plus revision-reconciled mutable overrides
// ---------------------------------------------------------------------------

function unionById<T extends { id: string }>(
  local: T[],
  remote: T[] | undefined,
  newerWins?: (a: T, b: T) => T
): T[] {
  if (!remote?.length) return local;
  const byId = new Map<string, T>();
  for (const r of remote) byId.set(r.id, r);
  for (const l of local) {
    const r = byId.get(l.id);
    byId.set(l.id, r && newerWins ? newerWins(l, r) : l);
  }
  return [...byId.values()];
}

/** Lets migrated server avatar state win while preserving pre-0023 behavior. */
function preserveDeviceAvatarMarker(
  accountProfile: QuestOSSnapshot["profile"],
  deviceProfile: QuestOSSnapshot["profile"],
): QuestOSSnapshot["profile"] {
  if (!accountProfile) {
    return accountProfile;
  }
  if (accountProfile.avatarVersion !== undefined) return accountProfile;
  if (!deviceProfile?.avatarUpdatedAt) return accountProfile;
  return {
    ...accountProfile,
    avatarUpdatedAt: deviceProfile.avatarUpdatedAt,
  };
}

export function mergeSnapshots(
  local: QuestOSSnapshot,
  remote: RemoteData
): QuestOSSnapshot {
  // Profile fallback only handles onboarding shape. Revision reconciliation
  // replaces it before an authenticated account snapshot is imported.
  const localOnboarded = Boolean(local.profile?.onboardingCompleted);
  const remoteOnboarded = Boolean(remote.profile?.onboardingCompleted);
  const adoptRemote = !localOnboarded && remoteOnboarded;
  let profile = local.profile ?? remote.profile ?? null;
  if (adoptRemote) {
    profile = remote.profile ?? null;
  } else if (localOnboarded && !remoteOnboarded && local.profile) {
    profile = local.profile;
  }
  profile = preserveDeviceAvatarMarker(profile, local.profile);
  // Accessibility comfort and wallpaper choices are device-local (no remote
  // columns); a phone and desktop can keep different motion/art treatments.
  const remoteSettings = remote.settings;
  const remoteNotificationsPresent =
    remote.notificationPreferencesPresent ??
    remoteSettings?.notificationsUpdatedAt !== undefined;
  const accountSettings = local.settings;
  const accountNotifications =
    remoteSettings &&
    remoteNotificationsPresent &&
    !local.settings.notificationsUpdatedAt
      ? remoteSettings.notifications
      : local.settings.notifications;
  const baseSettings = {
    ...accountSettings,
    notifications: accountNotifications,
    notificationsUpdatedAt:
      accountNotifications === remoteSettings?.notifications
        ? remoteSettings.notificationsUpdatedAt ?? remoteSettings.updatedAt
        : local.settings.notificationsUpdatedAt ?? local.settings.updatedAt,
    appearance: {
      ...accountSettings.appearance,
      boldText: local.settings.appearance.boldText,
      wallpaperId: local.settings.appearance.wallpaperId,
      wallpaperMode: local.settings.appearance.wallpaperMode,
      glassSurfaces: local.settings.appearance.glassSurfaces,
      glassOpacity: local.settings.appearance.glassOpacity,
      myShepherdFloatingButton:
        local.settings.appearance.myShepherdFloatingButton,
    },
  };
  // Privacy-first exception to local-wins: consent must be explicit on BOTH
  // sides. A missing remote setting is ambiguous and therefore remains off.
  const settings = {
    ...baseSettings,
    analyticsConsent:
      local.settings.analyticsConsent &&
      (remote.settings?.analyticsConsent ?? false),
  };

  // Assignments: per-day pick lists, unioned by questSlug so one device's
  // sync can never destroy another device's picks. Completed always wins
  // (a completed pick is history); otherwise the local entry wins. Known
  // tradeoff: an unpick may resurface if another device still holds the
  // pick — benign (unpick again) vs. losing a completed pick (data loss).
  const assignments: QuestOSSnapshot["assignments"] = {
    ...(remote.assignments ?? {}),
  };
  for (const [day, localList] of Object.entries(local.assignments)) {
    const remoteList = assignments[day];
    if (!remoteList?.length) {
      assignments[day] = localList;
      continue;
    }
    const bySlug = new Map(remoteList.map((a) => [a.questSlug, a]));
    for (const l of localList) {
      const r = bySlug.get(l.questSlug);
      bySlug.set(
        l.questSlug,
        r && r.status === "completed" && l.status !== "completed" ? r : l
      );
    }
    assignments[day] = [...bySlug.values()];
  }

  // Shelf fallback keeps the local row and folds lifetime completion counts.
  // Revision reconciliation selects the authoritative row for account sync.
  const localQuests = local.myQuests ?? {};
  const myQuests: NonNullable<QuestOSSnapshot["myQuests"]> = {
    ...(remote.myQuests ?? {}),
  };
  for (const [slug, l] of Object.entries(localQuests)) {
    const r = myQuests[slug];
    if (!r) {
      myQuests[slug] = l;
      continue;
    }
    const winner = l;
    myQuests[slug] = {
      ...winner,
      timesCompleted: Math.max(l.timesCompleted, r.timesCompleted),
      completedAt:
        r.timesCompleted > l.timesCompleted ? r.completedAt : l.completedAt,
    };
  }

  // Bookmarks: union by natural key, local wins duplicates.
  const bookmarks = [...local.bookmarks];
  const bookmarkKeys = new Set(
    local.bookmarks.map(
      (b) => `${b.bookSlug}:${b.chapter}:${b.verse}:${b.translationKey ?? "web"}`,
    )
  );
  for (const b of remote.bookmarks ?? []) {
    const key = `${b.bookSlug}:${b.chapter}:${b.verse}:${b.translationKey ?? "web"}`;
    if (!bookmarkKeys.has(key)) {
      bookmarkKeys.add(key);
      bookmarks.push(b);
    }
  }

  // Chapters read: union by book+chapter.
  const chaptersRead = [...local.chaptersRead];
  const chapterKeys = new Set(
    local.chaptersRead.map((c) => `${c.bookSlug}:${c.chapter}`)
  );
  for (const c of remote.chaptersRead ?? []) {
    const key = `${c.bookSlug}:${c.chapter}`;
    if (!chapterKeys.has(key)) {
      chapterKeys.add(key);
      chaptersRead.push(c);
    }
  }

  // Recent verses: preserve the store's action order and let revision-aware
  // reconciliation apply server ordering for account-backed history.
  const recentVerseMap = new Map(
    (local.recentVerses ?? []).map((verse) => [
      `${verse.bookSlug}:${verse.chapter}:${verse.verseStart}:${verse.verseEnd}`,
      verse,
    ])
  );
  for (const verse of remote.recentVerses ?? []) {
    const key = `${verse.bookSlug}:${verse.chapter}:${verse.verseStart}:${verse.verseEnd}`;
    if (!recentVerseMap.has(key)) recentVerseMap.set(key, verse);
  }
  const recentVerses = [...recentVerseMap.values()].slice(0, 20);

  // Milestones: union by key, keeping the earliest achievement.
  const milestoneMap = new Map(
    (remote.earnedMilestones ?? []).map((m) => [m.key, m])
  );
  for (const m of local.earnedMilestones) {
    const r = milestoneMap.get(m.key);
    milestoneMap.set(m.key, r && r.achievedAt <= m.achievedAt ? r : m);
  }

  // Revision reconciliation replaces this fallback before account import.
  const readingPosition = local.readingPosition ?? remote.readingPosition ?? null;

  return {
    profile,
    settings,
    assignments,
    myQuests,
    completions: unionById(local.completions, remote.completions),
    prayers: unionById(local.prayers, remote.prayers),
    reflections: unionById(local.reflections, remote.reflections),
    journeyEvents: unionById(local.journeyEvents, remote.journeyEvents),
    growthEvents: unionById(local.growthEvents, remote.growthEvents),
    earnedMilestones: [...milestoneMap.values()],
    bookmarks,
    readingPosition,
    chaptersRead,
    recentVerses,
    // Device-local fields pass through untouched.
    pendingMilestones: local.pendingMilestones,
    lastVisitDateKey: local.lastVisitDateKey,
    streak: local.streak,
    accountNudge: local.accountNudge,
    guidedProgress: mergeGuidedProgressRecords(
      local.guidedProgress ?? {},
      remote.guidedProgress,
    ),
  };
}

// ---------------------------------------------------------------------------
// Id normalization — legacy pre-UUID ids can't land in uuid columns
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function freshUuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function normalizeIds(snapshot: QuestOSSnapshot): QuestOSSnapshot {
  const remap = new Map<string, string>();
  const fix = <T extends { id: string }>(items: T[]): T[] =>
    items.map((item) => {
      if (UUID_RE.test(item.id)) return item;
      const next = freshUuid();
      remap.set(item.id, next);
      return { ...item, id: next };
    });

  const reflections = fix(snapshot.reflections);
  const completions = fix(snapshot.completions).map((c) =>
    c.reflectionId && remap.has(c.reflectionId)
      ? { ...c, reflectionId: remap.get(c.reflectionId) }
      : c
  );

  return {
    ...snapshot,
    prayers: fix(snapshot.prayers),
    reflections,
    completions,
    journeyEvents: fix(snapshot.journeyEvents),
    growthEvents: fix(snapshot.growthEvents),
    bookmarks: fix(snapshot.bookmarks),
  };
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

interface TombstonePropagationResult {
  generation: number;
  purged: boolean;
  preserveLocalBaseline: boolean;
  recoveredOwnAdvance: boolean;
  requiresServerReset: boolean;
}

interface TombstoneBatchItem {
  deletion: AccountDeletion;
  cleared: SyncTombstones;
}

/** Return whether this account has a destructive operation waiting to run. */
function hasSyncTombstones(t: SyncTombstones, userId: string): boolean {
  return Boolean(
    t.purgeAccount === userId ||
      t.prayers.length ||
      t.reflections.length ||
      t.bookmarks.length ||
      t.myQuests.length,
  );
}

/** Convert local tombstones into the narrow server deletion vocabulary. */
function tombstoneBatchItems(t: SyncTombstones): TombstoneBatchItem[] {
  return [
    ...t.prayers.map((id) => ({
      deletion: { resource: "prayers" as const, id },
      cleared: { ...emptyTombstones(), prayers: [id] },
    })),
    ...t.reflections.map((id) => ({
      deletion: { resource: "reflections" as const, id },
      cleared: { ...emptyTombstones(), reflections: [id] },
    })),
    ...t.bookmarks.map((bookmark) => ({
      deletion: {
        resource: "bookmarks" as const,
        book_slug: bookmark.bookSlug,
        chapter: bookmark.chapter,
        verse: bookmark.verse,
        translation_key: bookmark.translationKey ?? "web",
      },
      cleared: { ...emptyTombstones(), bookmarks: [bookmark] },
    })),
    ...t.myQuests.map((questSlug) => ({
      deletion: { resource: "user_quests" as const, quest_slug: questSlug },
      cleared: { ...emptyTombstones(), myQuests: [questSlug] },
    })),
  ];
}

/** Identify only the revision observations removed by partial tombstones. */
function mutableRevisionRemovals(
  tombstones: SyncTombstones,
): MutableRevisionRemoval[] {
  return [
    ...tombstones.prayers.map((id) => ({
      resource: "prayers" as const,
      key: { id },
    })),
    ...tombstones.reflections.map((id) => ({
      resource: "reflections" as const,
      key: { id },
    })),
    ...tombstones.bookmarks.map((bookmark) => ({
      resource: "verse_bookmarks" as const,
      key: {
        book_slug: bookmark.bookSlug,
        chapter: bookmark.chapter,
        verse: bookmark.verse,
        translation_key: bookmark.translationKey ?? "web",
      },
    })),
    ...tombstones.myQuests.map((questSlug) => ({
      resource: "user_quests" as const,
      key: { quest_slug: questSlug },
    })),
  ];
}

/** Combine the tombstones acknowledged by one bounded server batch. */
function combineClearedTombstones(
  items: readonly TombstoneBatchItem[],
): SyncTombstones {
  const cleared = emptyTombstones();
  for (const item of items) {
    cleared.prayers.push(...item.cleared.prayers);
    cleared.reflections.push(...item.cleared.reflections);
    cleared.bookmarks.push(...item.cleared.bookmarks);
    cleared.myQuests.push(...item.cleared.myQuests);
  }
  return cleared;
}

/**
 * Apply destructive intent before any merge. The first call uses the locally
 * remembered generation so a response-lost request can be deduplicated; only
 * a proven serialization miss is retried against the newly observed server.
 */
async function propagateTombstones(
  controlClient: SupabaseClient,
  t: SyncTombstones,
  userId: string,
  preferredGeneration: number,
  observedGeneration: number,
  isCurrent: () => boolean,
): Promise<TombstonePropagationResult> {
  let generation = observedGeneration;
  let preferred = preferredGeneration;
  let recoveredOwnAdvance = false;
  let requiresServerReset = accountSyncResetRequired(userId);

  /** Run one destructive request, retrying only a stale remembered generation. */
  const execute = async (
    operation: "delete" | "purge",
    deletions?: readonly AccountDeletion[],
  ) => {
    let attemptedGeneration = preferred;
    let retriedObservedGeneration = false;
    let result;
    try {
      const client = createSyncClient(userId, attemptedGeneration);
      result = operation === "purge"
        ? await purgeAccountSyncRows(client, userId, attemptedGeneration)
        : await deleteAccountSyncRows(
            client,
            userId,
            attemptedGeneration,
            deletions ?? [],
          );
    } catch (error) {
      if (
        !(error instanceof AccountSyncGenerationConflictError) ||
        attemptedGeneration === generation
      ) {
        throw error;
      }
      attemptedGeneration = generation;
      retriedObservedGeneration = true;
      const client = createSyncClient(userId, attemptedGeneration);
      result = operation === "purge"
        ? await purgeAccountSyncRows(client, userId, attemptedGeneration)
        : await deleteAccountSyncRows(
            client,
            userId,
            attemptedGeneration,
            deletions ?? [],
          );
    }

    const currentGeneration = await readAccountSyncGeneration(
      controlClient,
      userId,
    );
    if (currentGeneration < result.generation) {
      throw new Error("The account sync generation moved backward.");
    }
    const recovered =
      preferred !== generation &&
      result.duplicate &&
      result.generation === currentGeneration;
    const operationIsCurrent = result.generation === currentGeneration;
    const unsafePartialDelete =
      operation === "delete" &&
      ((retriedObservedGeneration && !recovered) || !operationIsCurrent);
    const unsafePurge = operation === "purge" && !operationIsCurrent;

    recoveredOwnAdvance ||= recovered;
    requiresServerReset ||= unsafePartialDelete || unsafePurge;
    generation = currentGeneration;
    preferred = currentGeneration;
    if (requiresServerReset) {
      if (!(await markAccountSyncResetRequired(userId, generation))) {
        throw new Error("Account sync reset could not be persisted.");
      }
    } else {
      if (!(await setAccountSyncGeneration(userId, generation))) {
        throw new Error("Account sync generation could not be persisted.");
      }
    }
    return { operationIsCurrent };
  };

  if (t.purgeAccount === userId) {
    const { operationIsCurrent } = await execute("purge");
    if (isCurrent()) useQuestOS.getState().clearSyncTombstones(t);
    return {
      generation,
      purged: true,
      preserveLocalBaseline: operationIsCurrent,
      recoveredOwnAdvance,
      requiresServerReset,
    };
  }

  const items = tombstoneBatchItems(t);
  for (let index = 0; index < items.length; index += 200) {
    const batch = items.slice(index, index + 200);
    await execute("delete", batch.map((item) => item.deletion));
    if (isCurrent()) {
      useQuestOS.getState().clearSyncTombstones(
        combineClearedTombstones(batch),
      );
    }
  }
  return {
    generation,
    purged: false,
    preserveLocalBaseline: false,
    recoveredOwnAdvance,
    requiresServerReset,
  };
}

async function pushFields(
  supabase: SupabaseClient,
  uid: string,
  generation: number,
  snap: QuestOSSnapshot,
  fields: Set<SyncedField>,
  isCurrent: () => boolean,
) {
  const jobs: Array<() => Promise<void>> = [];
  const run = async (
    request: PromiseLike<{ error: unknown }>,
    operation: string,
  ) => {
    const { error } = await withSyncRequestDeadline(request, operation);
    if (error) throw error;
  };
  const directBatched = async <Row>(
    rows: readonly Row[],
    operation: string,
    write: (batch: readonly Row[]) => PromiseLike<{ error: unknown }>,
  ) => {
    for (let index = 0; index < rows.length; index += 200) {
      if (!isCurrent()) return;
      await run(write(rows.slice(index, index + 200)), operation);
      if (!isCurrent()) return;
    }
  };
  const guarded = async <Row extends object>(
    table: MutableAccountTable,
    rows: readonly Readonly<Row>[],
  ) => {
    let stale = 0;
    for (let index = 0; index < rows.length; index += 200) {
      if (!isCurrent()) return;
      const result = await writeMutableAccountRows(
        supabase,
        uid,
        generation,
        table,
        rows.slice(index, index + 200),
        mutableRevisionContext,
        isCurrent,
      );
      if (!isCurrent()) return;
      stale += result.stale;
    }
    if (stale) throw new MutableAccountSyncConflictError(stale);
  };

  const profile = snap.profile;
  if (fields.has("profile") && profile) {
    jobs.push(() => guarded("profiles", [profileToRow(uid, profile)]));
  }
  if (fields.has("settings")) {
    const rows = settingsToRows(uid, snap.settings);
    jobs.push(() => guarded("user_settings", [rows.settings]));
    jobs.push(() => guarded("notification_preferences", [rows.notifications]));
  }
  if (fields.has("assignments")) {
    jobs.push(
      async () => {
        const result = await writeDailyQuestAssignments(
          supabase,
          uid,
          snap.assignments,
          dailyQuestSyncContext,
          generation,
          false,
          isCurrent,
        );
        if (!Object.keys(result.conflicts).length) return;

        // Keep the UI local-first while adopting only the bounded conflicting
        // days. The normal retry uses their newly observed revisions.
        applyingRemote = true;
        try {
          const assignments = useQuestOS.getState().assignments;
          useQuestOS.setState({
            assignments: { ...assignments, ...result.conflicts },
          });
        } finally {
          applyingRemote = false;
        }
        throw new DailyQuestConflictError();
      },
    );
  }
  if (fields.has("myQuests")) {
    const rows = Object.values(snap.myQuests ?? {}).map((q) =>
      myQuestToRow(uid, q)
    );
    if (rows.length) {
      jobs.push(() => guarded("user_quests", rows));
    }
  }
  if (fields.has("completions") && snap.completions.length) {
    const rows = snap.completions.map((completion) =>
      completionToRow(uid, completion),
    );
    jobs.push(
      () =>
        directBatched(rows, "Quest completion sync write", (batch) =>
          supabase.from("quest_completions").upsert(batch),
        ),
    );
  }
  if (fields.has("prayers") && snap.prayers.length) {
    jobs.push(
      () => guarded("prayers", snap.prayers.map((p) => prayerToRow(uid, p))),
    );
  }
  if (fields.has("reflections") && snap.reflections.length) {
    jobs.push(
      () => guarded(
        "reflections",
        snap.reflections.map((r) => reflectionToRow(uid, r)),
      ),
    );
  }
  if (fields.has("journeyEvents") && snap.journeyEvents.length) {
    // Append-only table (no UPDATE policy): insert new rows, skip existing.
    const rows = snap.journeyEvents.map((event) =>
      journeyEventToRow(uid, event),
    );
    jobs.push(
      () =>
        directBatched(rows, "Journey event sync write", (batch) =>
          supabase.from("journey_events").upsert(batch, {
            onConflict: "id",
            ignoreDuplicates: true,
          }),
        ),
    );
  }
  if (fields.has("growthEvents") && snap.growthEvents.length) {
    const rows = snap.growthEvents.map((event) =>
      growthEventToRow(uid, event),
    );
    jobs.push(
      () =>
        directBatched(rows, "Growth event sync write", (batch) =>
          supabase.from("growth_events").upsert(batch, {
            onConflict: "id",
            ignoreDuplicates: true,
          }),
        ),
    );
  }
  if (fields.has("earnedMilestones") && snap.earnedMilestones.length) {
    const rows = snap.earnedMilestones.map((milestone) =>
      milestoneToRow(uid, milestone),
    );
    jobs.push(
      () =>
        directBatched(rows, "Milestone sync write", (batch) =>
          supabase.from("user_milestones").upsert(batch, {
            onConflict: "user_id,milestone_key",
            ignoreDuplicates: true,
          }),
        ),
    );
  }
  if (fields.has("bookmarks") && snap.bookmarks.length) {
    jobs.push(() =>
      guarded(
        "verse_bookmarks",
        snap.bookmarks.map((bookmark) => bookmarkToRow(uid, bookmark)),
      ),
    );
  }
  const readingPosition = snap.readingPosition;
  if (fields.has("readingPosition") && readingPosition) {
    jobs.push(() =>
      guarded("reading_progress", [readingPositionToRow(uid, readingPosition)]),
    );
  }
  if (fields.has("chaptersRead") && snap.chaptersRead.length) {
    const rows = snap.chaptersRead.map((chapter) =>
      chapterReadToRow(uid, chapter),
    );
    jobs.push(
      () =>
        directBatched(rows, "Chapter progress sync write", (batch) =>
          supabase.from("chapters_read").upsert(batch, {
            onConflict: "user_id,book_slug,chapter",
            ignoreDuplicates: true,
          }),
        ),
    );
  }
  if (fields.has("recentVerses") && (snap.recentVerses?.length ?? 0) > 0) {
    // The store and reconciliation already encode action/server order; never
    // let an untrusted device clock reorder passages across natural keys.
    const verses = [...(snap.recentVerses ?? [])].slice(0, 20);
    jobs.push(() =>
      guarded(
        "user_recent_verses",
        transmittableRecentVerseRows(
          verses.map((verse) => recentVerseToRow(uid, verse)),
        ),
      ),
    );
  }
  if (fields.has("guidedProgress")) {
    const rows = guidedProgressToRows(uid, snap.guidedProgress);
    if (rows.length) {
      jobs.push(
        () =>
          directBatched(rows, "Guided progress sync write", (batch) =>
            supabase.from("user_guided_movements").upsert(batch, {
              onConflict: "user_id,session_key,movement_key",
              ignoreDuplicates: true,
            }),
          ),
      );
    }
  }

  // Serialize writes so a failure or auth/lifecycle transition cannot leave
  // sibling requests running after the engine has already begun recovery.
  for (const job of jobs) {
    if (!isCurrent()) return;
    try {
      await job();
    } catch (error) {
      if (isAccountSyncGenerationConflict(error)) {
        throw new AccountSyncGenerationConflictError();
      }
      throw error;
    }
  }
}
