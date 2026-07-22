"use client";

/**
 * Sync engine — optional account sync for the local-first QuestOS store.
 *
 * Principles:
 *  - The local store remains the source of truth for the UI; the account is a
 *    backup + bridge between devices. Everything keeps working offline.
 *  - On sign-in: pull the account copy, merge it with local (union by id/key,
 *    newer edit wins for prayers/reflections), apply, then push the merged
 *    result back up.
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
  createClient,
  createSyncClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { useQuestOS } from "@/lib/questos/store";
import type {
  QuestOSSnapshot,
  Settings,
  SyncTombstones,
} from "@/lib/questos/types";
import { DEFAULT_SETTINGS } from "@/lib/questos/types";
import { useSyncStatus } from "./status";
import {
  clearInitialSyncPending,
  clearLocalJourneyClaimPending,
  getLastSyncedUserId,
  localDataBelongsToOtherUser,
  localJourneyClaimIsPending,
  markInitialSyncPending,
  setLastSyncedUserId,
} from "./last-user";
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
  journeyEventToRow,
  milestoneToRow,
  myQuestToRow,
  prayerToRow,
  profileToRow,
  readingPositionToRow,
  recentVerseToRow,
  reflectionToRow,
  rowsToSettings,
  settingsToRows,
  rowToAssignment,
  rowToBookmark,
  rowToChapterRead,
  rowToCompletion,
  rowToGrowthEvent,
  rowToJourneyEvent,
  rowToMilestone,
  rowToMyQuest,
  rowToPrayer,
  rowToProfile,
  rowToReadingPosition,
  rowToRecentVerse,
  rowToReflection,
} from "./mapping";
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
  | "recentVerses";

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
];

const PUSH_DEBOUNCE_MS = 2_500;
const RETRY_MS = 30_000;

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
const dirty = new Set<SyncedField>();
const dailyQuestSyncContext = createDailyQuestSyncContext();

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
  dirty.clear();
  resetDailyQuestSyncContext(dailyQuestSyncContext);
  setStatus("off", { initialSyncComplete: false });
}

export async function startSync(userId: string, retryingFailure = false) {
  // Fail closed before creating a Supabase client or changing local ownership.
  if (!accountSyncAvailable(isSupabaseConfigured())) {
    stopSync();
    return;
  }
  if (currentUserId === userId) return;
  const lastSyncedUserId = getLastSyncedUserId();
  // The device still holds a journey last synced by a DIFFERENT account.
  // Refuse to sync — merging here would copy that user's private prayers and
  // reflections into this account's rows. SyncManager detects the same
  // condition and asks the person to either start fresh or claim the data;
  // resolution calls setLastSyncedUserId and retries.
  if (localDataBelongsToOtherUser(userId)) {
    // Also tear down any previous account subscriber. Refusing the new merge
    // is not enough if an older engine could keep writing through the newly
    // changed auth session while the privacy hand-off is unanswered.
    stopSync();
    return;
  }
  if (lastSyncedUserId !== userId) {
    markInitialSyncPending(userId);
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
  const isCurrent = () => runToken === token && currentUserId === userId;
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
      if (state[field] !== prev[field]) {
        dirty.add(field);
        changed = true;
      }
    }
    if (state.tombstones !== prev.tombstones) changed = true;
    if (changed && writeThroughReady) schedulePush();
  });

  try {
    await initialSync(createClient(), userId, isCurrent);
    if (!isCurrent()) return; // stopped/restarted mid-sync
    clearInitialSyncPending(userId);
    clearLocalJourneyClaimPending(userId);
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
    if (!isCurrent()) return;
    const generationConflict =
      error instanceof AccountSyncGenerationConflictError;
    if (generationConflict) {
      // The merge may already be persisted when another device advances the
      // destructive generation. Quarantine it across reloads until the next
      // pull replaces stale account fields with the server baseline.
      markInitialSyncPending(userId);
      markAccountSyncResetRequired(
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
      if (!isCurrent()) return;
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
    const controlClient = createClient();
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
    setLastSyncedUserId(userId);
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
  isCurrent: () => boolean
) {
  // Fail closed before touching user-owned tables when a deployment is paired
  // with an old, wrong, or incompletely migrated Supabase project.
  await assertAccountSyncContracts(controlClient);
  if (!isCurrent()) return;
  const storedGeneration = getAccountSyncGeneration(userId);
  const previousOwner = getLastSyncedUserId();
  const observedGeneration = await readAccountSyncGeneration(
    controlClient,
    userId,
  );
  if (!isCurrent()) return;
  let requiresServerReset =
    accountSyncResetRequired(userId) ||
    (storedGeneration !== null && storedGeneration !== observedGeneration) ||
    (storedGeneration === null &&
      previousOwner === userId &&
      !localJourneyClaimIsPending(userId));

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

  const supabase = createSyncClient(userId, propagated.generation);
  const pulled = await pullAll(supabase, userId);
  if (!isCurrent()) return;
  const verifiedGeneration = await readAccountSyncGeneration(supabase, userId);
  if (verifiedGeneration !== propagated.generation) {
    throw new AccountSyncGenerationConflictError();
  }
  const remote = pulled.snapshot;

  // Capture tombstones at merge time so deletions made while signed out (or
  // mid-sync) don't resurrect from the account copy.
  const tombstones = useQuestOS.getState().tombstones;
  const local = snapshotFromStore();
  const mergeLocal = requiresServerReset
    ? serverAuthoritativeBaseline(local)
    : local;
  // A pending purge for this account ("Clear my data" / restore-from-file
  // while signed in) condemns the whole account copy — merging any of it
  // back would resurrect exactly what the user erased.
  const remoteKept =
    tombstones.purgeAccount === userId
      ? {}
      : filterByTombstones(remote, tombstones);
  const dailyAssignments = reconcileDailyQuestPull(
    dailyQuestSyncContext,
    mergeLocal.assignments,
    remoteKept.assignments ?? {},
    pulled.dailyQuestRevisions,
    pulled.transactionalDailyQuestsAvailable,
  );
  const merged = normalizeIds({
    ...mergeSnapshots(mergeLocal, remoteKept),
    assignments: dailyAssignments,
  });

  applyingRemote = true;
  try {
    useQuestOS.getState().importData(merged);
  } finally {
    applyingRemote = false;
  }
  setAccountSyncGeneration(userId, propagated.generation);
  clearAccountSyncResetRequired(userId);
  // From this moment the local store holds this account's (merged) journey —
  // record the owner even if the pushes below fail and retry later.
  setLastSyncedUserId(userId);

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
  transactionalDailyQuestsAvailable: boolean;
}

async function pullAll(
  supabase: SupabaseClient,
  userId: string,
): Promise<PulledData> {
  const from = (table: string) =>
    supabase.from(table).select("*").eq("user_id", userId);

  // Observe revisions before rows. A write between these statements advances
  // the revision and guarantees the later replace conflicts instead of pairing
  // an older row snapshot with a newer revision.
  const dailyRevisionRes = await supabase
    .from("user_daily_quest_days")
    .select("assigned_date,revision");
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
    journeyRes,
    growthRes,
    milestonesRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    from("user_settings").maybeSingle(),
    from("notification_preferences").maybeSingle(),
    from("user_daily_quests"),
    from("user_quests"),
    from("quest_completions"),
    from("prayers"),
    from("reflections"),
    from("verse_bookmarks"),
    from("reading_progress").maybeSingle(),
    from("chapters_read"),
    from("user_recent_verses"),
    from("journey_events"),
    from("growth_events"),
    from("user_milestones"),
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
  ];
  for (const res of all) {
    if (res.error) throw res.error;
  }
  if (recentVersesRes.error && !recentVersesUnavailable) {
    throw recentVersesRes.error;
  }

  const assignments: QuestOSSnapshot["assignments"] = {};
  for (const row of dailyRes.data ?? []) {
    const a = rowToAssignment(row);
    (assignments[a.dateKey] ??= []).push(a);
  }

  const myQuests: NonNullable<QuestOSSnapshot["myQuests"]> = {};
  for (const row of myQuestsRes.data ?? []) {
    const q = rowToMyQuest(row);
    myQuests[q.questSlug] = q;
  }

  return {
    dailyQuestRevisions: dailyRevisionsUnavailable
      ? []
      : ((dailyRevisionRes.data ?? []) as DailyQuestRevisionRow[]),
    transactionalDailyQuestsAvailable: !dailyRevisionsUnavailable,
    snapshot: {
      profile: profileRes.data ? rowToProfile(profileRes.data) : null,
      settings:
        settingsRes.data || notifRes.data
          ? rowsToSettings(settingsRes.data ?? null, notifRes.data ?? null)
          : undefined,
      notificationPreferencesPresent: Boolean(notifRes.data),
      assignments,
      myQuests,
      completions: (completionsRes.data ?? []).map(rowToCompletion),
      prayers: (prayersRes.data ?? []).map(rowToPrayer),
      reflections: (reflectionsRes.data ?? []).map(rowToReflection),
      bookmarks: (bookmarksRes.data ?? []).map(rowToBookmark),
      readingPosition: readingRes.data
        ? rowToReadingPosition(readingRes.data)
        : null,
      chaptersRead: (chaptersRes.data ?? []).map(rowToChapterRead),
      recentVerses: recentVersesUnavailable
        ? undefined
        : (recentVersesRes.data ?? []).map(rowToRecentVerse),
      journeyEvents: (journeyRes.data ?? []).map(rowToJourneyEvent),
      growthEvents: (growthRes.data ?? []).map(rowToGrowthEvent),
      earnedMilestones: (milestonesRes.data ?? []).map(rowToMilestone),
    },
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
// Merge — union by id/key; newer edit wins where rows are mutable
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

function newerByUpdatedAt<T extends { updatedAt: string }>(a: T, b: T): T {
  return a.updatedAt >= b.updatedAt ? a : b;
}

/** Returns a stable legacy fallback for last-write-wins comparisons. */
function syncUpdatedAt(value: { updatedAt?: string }, fallback: string): string {
  return value.updatedAt ?? fallback;
}

/** Returns the notification-row timestamp, including legacy snapshot fallback. */
function notificationSyncUpdatedAt(value: Settings): string {
  return (
    value.notificationsUpdatedAt ??
    value.updatedAt ??
    "1970-01-01T00:00:00.000Z"
  );
}

export function mergeSnapshots(
  local: QuestOSSnapshot,
  remote: RemoteData
): QuestOSSnapshot {
  // Profile: an onboarded journey beats an empty signup row. When both devices
  // are onboarded, the most recently edited account fields win.
  const localOnboarded = Boolean(local.profile?.onboardingCompleted);
  const remoteOnboarded = Boolean(remote.profile?.onboardingCompleted);
  const adoptRemote = !localOnboarded && remoteOnboarded;
  let profile = local.profile ?? remote.profile ?? null;
  if (adoptRemote) {
    profile = remote.profile ?? null;
  } else if (localOnboarded && !remoteOnboarded && local.profile) {
    profile = local.profile;
  } else if (local.profile && remote.profile) {
    profile =
      syncUpdatedAt(local.profile, local.profile.createdAt) >=
      syncUpdatedAt(remote.profile, remote.profile.createdAt)
        ? local.profile
        : remote.profile;
  }
  // Accessibility comfort and wallpaper choices are device-local (no remote
  // columns); a phone and desktop can keep different motion/art treatments.
  const remoteSettings = remote.settings;
  const remoteNotificationsPresent =
    remote.notificationPreferencesPresent ??
    remoteSettings?.notificationsUpdatedAt !== undefined;
  const accountSettings =
    remoteSettings &&
    syncUpdatedAt(remoteSettings, "1970-01-01T00:00:00.000Z") >
      syncUpdatedAt(local.settings, "1970-01-01T00:00:00.000Z")
      ? remoteSettings
      : local.settings;
  const accountNotifications =
    remoteSettings &&
    remoteNotificationsPresent &&
    notificationSyncUpdatedAt(remoteSettings) >
      notificationSyncUpdatedAt(local.settings)
      ? remoteSettings.notifications
      : local.settings.notifications;
  const baseSettings = {
    ...accountSettings,
    notifications: accountNotifications,
    notificationsUpdatedAt:
      remoteSettings &&
      remoteNotificationsPresent &&
      notificationSyncUpdatedAt(remoteSettings) >
        notificationSyncUpdatedAt(local.settings)
        ? remoteSettings.notificationsUpdatedAt ?? remoteSettings.updatedAt
        : local.settings.notificationsUpdatedAt ?? local.settings.updatedAt,
    appearance: {
      ...accountSettings.appearance,
      boldText: local.settings.appearance.boldText,
      wallpaperId: local.settings.appearance.wallpaperId,
      wallpaperMode: local.settings.appearance.wallpaperMode,
      glassSurfaces: local.settings.appearance.glassSurfaces,
      glassOpacity: local.settings.appearance.glassOpacity,
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

  // Shelf quests: union by slug. On conflict the side touched most
  // recently wins the row (status, steps, timestamps travel together so a
  // walk never mixes two devices' step lists) — but the lifetime completion
  // count and latest completion date are folded in from both sides, so a
  // completion on one device is never erased by activity on another.
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
    const winner = l.lastActivityAt >= r.lastActivityAt ? l : r;
    const loser = winner === l ? r : l;
    myQuests[slug] = {
      ...winner,
      timesCompleted: Math.max(l.timesCompleted, r.timesCompleted),
      completedAt:
        winner.completedAt && loser.completedAt
          ? winner.completedAt >= loser.completedAt
            ? winner.completedAt
            : loser.completedAt
          : winner.completedAt ?? loser.completedAt,
      addedAt: l.addedAt <= r.addedAt ? l.addedAt : r.addedAt,
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

  // Recent verses: de-duplicate by passage, keep the newest visit, and cap
  // the account-backed history to the same small list used on-device.
  const recentVerseMap = new Map(
    (remote.recentVerses ?? []).map((verse) => [
      `${verse.bookSlug}:${verse.chapter}:${verse.verseStart}:${verse.verseEnd}`,
      verse,
    ])
  );
  for (const verse of local.recentVerses ?? []) {
    const key = `${verse.bookSlug}:${verse.chapter}:${verse.verseStart}:${verse.verseEnd}`;
    const remoteVerse = recentVerseMap.get(key);
    if (!remoteVerse || verse.viewedAt >= remoteVerse.viewedAt) {
      recentVerseMap.set(key, verse);
    }
  }
  const recentVerses = [...recentVerseMap.values()]
    .sort((a, b) => b.viewedAt.localeCompare(a.viewedAt))
    .slice(0, 20);

  // Milestones: union by key, keeping the earliest achievement.
  const milestoneMap = new Map(
    (remote.earnedMilestones ?? []).map((m) => [m.key, m])
  );
  for (const m of local.earnedMilestones) {
    const r = milestoneMap.get(m.key);
    milestoneMap.set(m.key, r && r.achievedAt <= m.achievedAt ? r : m);
  }

  // Reading position: newest wins.
  let readingPosition = local.readingPosition ?? remote.readingPosition ?? null;
  if (local.readingPosition && remote.readingPosition) {
    readingPosition =
      local.readingPosition.updatedAt >= remote.readingPosition.updatedAt
        ? local.readingPosition
        : remote.readingPosition;
  }

  return {
    profile,
    settings,
    assignments,
    myQuests,
    completions: unionById(local.completions, remote.completions),
    prayers: unionById(local.prayers, remote.prayers, newerByUpdatedAt),
    reflections: unionById(local.reflections, remote.reflections, newerByUpdatedAt),
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
      cleared: { ...emptySyncTombstones(), prayers: [id] },
    })),
    ...t.reflections.map((id) => ({
      deletion: { resource: "reflections" as const, id },
      cleared: { ...emptySyncTombstones(), reflections: [id] },
    })),
    ...t.bookmarks.map((bookmark) => ({
      deletion: {
        resource: "bookmarks" as const,
        book_slug: bookmark.bookSlug,
        chapter: bookmark.chapter,
        verse: bookmark.verse,
        translation_key: bookmark.translationKey ?? "web",
      },
      cleared: { ...emptySyncTombstones(), bookmarks: [bookmark] },
    })),
    ...t.myQuests.map((questSlug) => ({
      deletion: { resource: "user_quests" as const, quest_slug: questSlug },
      cleared: { ...emptySyncTombstones(), myQuests: [questSlug] },
    })),
  ];
}

/** Return a fresh empty tombstone set without importing store implementation. */
function emptySyncTombstones(): SyncTombstones {
  return {
    prayers: [],
    reflections: [],
    bookmarks: [],
    myQuests: [],
    purgeAccount: null,
  };
}

/** Combine the tombstones acknowledged by one bounded server batch. */
function combineClearedTombstones(
  items: readonly TombstoneBatchItem[],
): SyncTombstones {
  const cleared = emptySyncTombstones();
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
      markAccountSyncResetRequired(userId, generation);
    } else {
      setAccountSyncGeneration(userId, generation);
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
  const run = async (p: PromiseLike<{ error: unknown }>) => {
    const { error } = await p;
    if (error) throw error;
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
      );
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
    jobs.push(
      () => run(
        supabase
          .from("quest_completions")
          .upsert(snap.completions.map((c) => completionToRow(uid, c)))
      )
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
    jobs.push(
      () => run(
        supabase.from("journey_events").upsert(
          snap.journeyEvents.map((e) => journeyEventToRow(uid, e)),
          { onConflict: "id", ignoreDuplicates: true }
        )
      )
    );
  }
  if (fields.has("growthEvents") && snap.growthEvents.length) {
    jobs.push(
      () => run(
        supabase.from("growth_events").upsert(
          snap.growthEvents.map((e) => growthEventToRow(uid, e)),
          { onConflict: "id", ignoreDuplicates: true }
        )
      )
    );
  }
  if (fields.has("earnedMilestones") && snap.earnedMilestones.length) {
    jobs.push(
      () => run(
        supabase.from("user_milestones").upsert(
          snap.earnedMilestones.map((m) => milestoneToRow(uid, m)),
          { onConflict: "user_id,milestone_key", ignoreDuplicates: true }
        )
      )
    );
  }
  if (fields.has("bookmarks") && snap.bookmarks.length) {
    jobs.push(
      async () => {
        const rows = snap.bookmarks.map((b) => bookmarkToRow(uid, b));
        const current = await supabase.from("verse_bookmarks").upsert(rows, {
          onConflict: "user_id,book_slug,chapter,verse,translation_key",
        });
        if (!current.error) return;
        if (!isMissingBibleSyncColumn(current.error, "translation_key")) {
          throw current.error;
        }
        // Pre-0011 compatibility stores the public-domain WEB snapshot in
        // the legacy one-row-per-verse shape. The selected edition remains a
        // local hint until the additive migration is available.
        const legacyByPassage = new Map<string, Omit<(typeof rows)[number], "translation_key">>();
        for (const { translation_key: _pending, ...row } of rows) {
          void _pending;
          const passageKey = [
            row.user_id,
            row.book_slug,
            row.chapter,
            row.verse,
          ].join(":");
          const previous = legacyByPassage.get(passageKey);
          if (!previous || previous.created_at < row.created_at) {
            legacyByPassage.set(passageKey, row);
          }
        }
        const legacyRows = [...legacyByPassage.values()];
        const legacy = await supabase.from("verse_bookmarks").upsert(legacyRows, {
          onConflict: "user_id,book_slug,chapter,verse",
        });
        if (legacy.error) throw legacy.error;
      },
    );
  }
  const readingPosition = snap.readingPosition;
  if (fields.has("readingPosition") && readingPosition) {
    jobs.push(() =>
      guarded("reading_progress", [readingPositionToRow(uid, readingPosition)]),
    );
  }
  if (fields.has("chaptersRead") && snap.chaptersRead.length) {
    jobs.push(
      () => run(
        supabase.from("chapters_read").upsert(
          snap.chaptersRead.map((c) => chapterReadToRow(uid, c)),
          { onConflict: "user_id,book_slug,chapter", ignoreDuplicates: true }
        )
      )
    );
  }
  if (fields.has("recentVerses") && (snap.recentVerses?.length ?? 0) > 0) {
    const verses = [...(snap.recentVerses ?? [])]
      .sort((a, b) => b.viewedAt.localeCompare(a.viewedAt))
      .slice(0, 20);
    jobs.push(
      async () => {
        const upsert = await supabase.from("user_recent_verses").upsert(
          verses.map((verse) => recentVerseToRow(uid, verse)),
          {
            onConflict:
              "user_id,book_slug,chapter,verse_start,verse_end",
          }
        );
        if (upsert.error) {
          if (isMissingRecentVersesTable(upsert.error)) return;
          throw upsert.error;
        }

        // The client keeps only twenty locally. Older account rows remain
        // until a future generation-bound deletion can remove exact passages.
      },
    );
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
