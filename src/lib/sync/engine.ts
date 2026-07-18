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
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useQuestOS } from "@/lib/questos/store";
import type { QuestOSSnapshot, SyncTombstones } from "@/lib/questos/types";
import { useSyncStatus } from "./status";
import { localDataBelongsToOtherUser, setLastSyncedUserId } from "./last-user";
import { track } from "@/lib/analytics/events";
import {
  assignmentToRow,
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

/**
 * Migration 0011 is intentionally deployed separately from the web bundle.
 * During that rolling window PostgREST can report either PostgreSQL's missing
 * column code or its own stale-schema-cache code. Only downgrade the two
 * additive Bible fields; every other sync error must still fail closed.
 */
export function isMissingBibleSyncColumn(
  error: unknown,
  column: "preferred_bible_translation" | "translation_key",
): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  return (
    message.includes(column) &&
    (code === "42703" || code === "PGRST204")
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
let rerunAfterPush = false;
let applyingRemote = false;
const dirty = new Set<SyncedField>();

function setStatus(
  state: "off" | "syncing" | "idle" | "error",
  options?: { syncedNow?: boolean; initialSyncComplete?: boolean }
) {
  useSyncStatus.getState().setState(state, {
    lastSyncedAt: options?.syncedNow ? new Date().toISOString() : undefined,
    userId: currentUserId,
    initialSyncComplete: options?.initialSyncComplete ?? false,
  });
}

export function stopSync() {
  currentUserId = null;
  runToken++;
  unsubscribe?.();
  unsubscribe = null;
  if (pushTimer) clearTimeout(pushTimer);
  if (retryTimer) clearTimeout(retryTimer);
  pushTimer = null;
  retryTimer = null;
  dirty.clear();
  setStatus("off", { initialSyncComplete: false });
}

export async function startSync(userId: string, retryingFailure = false) {
  if (!isSupabaseConfigured()) return;
  if (currentUserId === userId) return;
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
  const previousStatus = useSyncStatus.getState();
  const wasError =
    retryingFailure ||
    (previousStatus.state === "error" && previousStatus.userId === userId);
  stopSync();
  currentUserId = userId;
  const token = ++runToken;
  const isCurrent = () => runToken === token && currentUserId === userId;
  // Remember whether we're inside a failure streak BEFORE flipping to
  // "syncing", so retries don't re-count sync_failed every 30s.
  setStatus("syncing", { initialSyncComplete: false });

  try {
    await initialSync(createClient(), userId, isCurrent);
    if (!isCurrent()) return; // stopped/restarted mid-sync
    setStatus("idle", { syncedNow: true, initialSyncComplete: true });
    track("sync_completed", { status: "initial" });
  } catch {
    if (!isCurrent()) return;
    // One event per failure streak, not one per 30s retry — a long
    // offline stretch shouldn't flood the queue with identical failures.
    if (!wasError) {
      track("sync_failed", { status: "initial" });
    }
    setStatus("error", { initialSyncComplete: false });
    // NEVER fall through to write-through pushes before a successful pull —
    // a blind push would upsert this device's (possibly default/stale) data
    // over the account. Retry the full pull→merge instead, and install no
    // subscriber until it succeeds.
    retryTimer = setTimeout(() => {
      if (!isCurrent()) return;
      void retrySync(userId);
    }, RETRY_MS);
    return;
  }

  if (!isCurrent()) return;

  // Write-through: watch the store and push only what changed.
  unsubscribe = useQuestOS.subscribe((state, prev) => {
    if (applyingRemote) return;
    let changed = false;
    for (const f of SYNCED_FIELDS) {
      if (state[f] !== prev[f]) {
        dirty.add(f);
        changed = true;
      }
    }
    if (state.tombstones !== prev.tombstones) changed = true;
    if (changed) schedulePush();
  });

  // A clear/restore/deletion that landed while the initial sync's network
  // calls were in flight predates the subscriber and would otherwise sit
  // unpushed until the next local change — catch it up now. (runPush widens
  // a purge push to all fields itself.)
  const pending = useQuestOS.getState().tombstones;
  if (
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

async function runPush() {
  const userId = currentUserId;
  if (!userId) return;
  if (pushing) {
    rerunAfterPush = true;
    return;
  }
  pushing = true;
  const wasError = useSyncStatus.getState().state === "error";
  setStatus("syncing", { initialSyncComplete: true });
  try {
    const supabase = createClient();
    const state = useQuestOS.getState();
    const tombstones = state.tombstones;
    // A purge empties the whole account copy, so the push that follows must
    // rebuild every collection from local state — not just the dirty ones.
    const fields = new Set(
      tombstones.purgeAccount === userId ? SYNCED_FIELDS : dirty
    );
    dirty.clear();

    const cleared = await propagateTombstones(supabase, tombstones, userId);
    // Only clear when there was something to propagate — an unconditional
    // clear writes a fresh tombstones object every push, which the
    // subscriber sees as a change and turns into an endless push loop.
    if (
      cleared.prayers.length ||
      cleared.reflections.length ||
      cleared.bookmarks.length ||
      cleared.myQuests.length ||
      cleared.purgeAccount
    ) {
      useQuestOS.getState().clearSyncTombstones(cleared);
    }
    await pushFields(supabase, userId, snapshotFromStore(), fields);
    // Re-stamp ownership on every successful push: "Clear my data" in
    // settings drops the marker, but anything written afterwards while still
    // signed in lands in this account's rows and belongs to it.
    setLastSyncedUserId(userId);
    if (currentUserId === userId) {
      setStatus("idle", { syncedNow: true, initialSyncComplete: true });
    }
  } catch {
    // Push failed (offline, etc.) — mark everything dirty again and retry.
    for (const f of SYNCED_FIELDS) dirty.add(f);
    if (currentUserId === userId) {
      // One event per failure streak (retries repeat every 30s).
      if (!wasError) {
        track("sync_failed", { status: "push" });
      }
      setStatus("error", { initialSyncComplete: true });
      scheduleRetry();
    }
  } finally {
    pushing = false;
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
  supabase: SupabaseClient,
  userId: string,
  isCurrent: () => boolean
) {
  const remote = await pullAll(supabase, userId);
  if (!isCurrent()) return;

  // Capture tombstones at merge time so deletions made while signed out (or
  // mid-sync) don't resurrect from the account copy.
  const tombstones = useQuestOS.getState().tombstones;
  const local = snapshotFromStore();
  // A pending purge for this account ("Clear my data" / restore-from-file
  // while signed in) condemns the whole account copy — merging any of it
  // back would resurrect exactly what the user erased.
  const remoteKept =
    tombstones.purgeAccount === userId
      ? {}
      : filterByTombstones(remote, tombstones);
  const merged = normalizeIds(mergeSnapshots(local, remoteKept));

  applyingRemote = true;
  try {
    useQuestOS.getState().importData(merged);
  } finally {
    applyingRemote = false;
  }
  // From this moment the local store holds this account's (merged) journey —
  // record the owner even if the pushes below fail and retry later.
  setLastSyncedUserId(userId);

  const cleared = await propagateTombstones(supabase, tombstones, userId);
  useQuestOS.getState().clearSyncTombstones(cleared);

  if (!isCurrent()) return;
  await pushFields(supabase, userId, merged, new Set(SYNCED_FIELDS));
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

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

type RemoteData = Partial<QuestOSSnapshot>;

async function pullAll(
  supabase: SupabaseClient,
  userId: string
): Promise<RemoteData> {
  const from = (table: string) =>
    supabase.from(table).select("*").eq("user_id", userId);

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

  const all = [
    profileRes, settingsRes, notifRes, dailyRes, myQuestsRes, completionsRes,
    prayersRes, reflectionsRes, bookmarksRes, readingRes, chaptersRes,
    recentVersesRes,
    journeyRes, growthRes, milestonesRes,
  ];
  for (const res of all) {
    if (res.error) throw res.error;
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
    profile: profileRes.data ? rowToProfile(profileRes.data) : null,
    settings:
      settingsRes.data || notifRes.data
        ? rowsToSettings(settingsRes.data ?? null, notifRes.data ?? null)
        : undefined,
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
    recentVerses: (recentVersesRes.data ?? []).map(rowToRecentVerse),
    journeyEvents: (journeyRes.data ?? []).map(rowToJourneyEvent),
    growthEvents: (growthRes.data ?? []).map(rowToGrowthEvent),
    earnedMilestones: (milestonesRes.data ?? []).map(rowToMilestone),
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

export function mergeSnapshots(
  local: QuestOSSnapshot,
  remote: RemoteData
): QuestOSSnapshot {
  // Profile: prefer whichever side has a real (onboarded) profile; if both,
  // keep this device's — the account copy gets updated by the push that
  // follows. A fresh device (no onboarded local profile) adopts the account.
  const localOnboarded = Boolean(local.profile?.onboardingCompleted);
  const remoteOnboarded = Boolean(remote.profile?.onboardingCompleted);
  const adoptRemote = !localOnboarded && remoteOnboarded;

  const profile = adoptRemote
    ? remote.profile ?? null
    : local.profile ?? remote.profile ?? null;
  // boldText is a device-local accessibility preference (no remote column;
  // like OS-level bold text it shouldn't follow the account across devices).
  const baseSettings =
    adoptRemote && remote.settings
      ? {
          ...remote.settings,
          appearance: {
            ...remote.settings.appearance,
            boldText: local.settings.appearance.boldText,
          },
        }
      : local.settings;
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

/**
 * Deletes tombstoned rows from the account, returning what actually
 * propagated so the caller clears exactly that. A pending account purge
 * ("Clear my data" / restore-from-file while signed in) deletes EVERY
 * user-data row via the purge_user_data RPC (migration 0004) and subsumes
 * the per-row tombstones. A purge marker for a DIFFERENT account is left
 * pending — it propagates only when that user signs back in.
 */
async function propagateTombstones(
  supabase: SupabaseClient,
  t: SyncTombstones,
  userId: string
): Promise<SyncTombstones> {
  if (t.purgeAccount === userId) {
    const { error } = await supabase.rpc("purge_user_data");
    if (error) throw error;
    return t;
  }
  if (t.prayers.length) {
    const { error } = await supabase.from("prayers").delete().in("id", t.prayers);
    if (error) throw error;
  }
  if (t.reflections.length) {
    const { error } = await supabase
      .from("reflections")
      .delete()
      .in("id", t.reflections);
    if (error) throw error;
  }
  for (const b of t.bookmarks) {
    const result = await supabase
      .from("verse_bookmarks")
      .delete()
      .match({
        book_slug: b.bookSlug,
        chapter: b.chapter,
        verse: b.verse,
        translation_key: b.translationKey ?? "web",
      });
    if (!result.error) continue;
    if (!isMissingBibleSyncColumn(result.error, "translation_key")) {
      throw result.error;
    }
    // Pre-0011 compatibility: the legacy schema has exactly one row per
    // verse, so the same tombstone can safely delete it without an edition.
    const legacy = await supabase
      .from("verse_bookmarks")
      .delete()
      .match({
        book_slug: b.bookSlug,
        chapter: b.chapter,
        verse: b.verse,
      });
    if (legacy.error) throw legacy.error;
  }
  if (t.myQuests.length) {
    const { error } = await supabase
      .from("user_quests")
      .delete()
      .eq("user_id", userId)
      .in("quest_slug", t.myQuests);
    if (error) throw error;
  }
  return { ...t, purgeAccount: null };
}

async function pushFields(
  supabase: SupabaseClient,
  uid: string,
  snap: QuestOSSnapshot,
  fields: Set<SyncedField>
) {
  const jobs: Array<Promise<void>> = [];
  const run = async (p: PromiseLike<{ error: unknown }>) => {
    const { error } = await p;
    if (error) throw error;
  };

  if (fields.has("profile") && snap.profile) {
    jobs.push(
      run(supabase.from("profiles").upsert(profileToRow(uid, snap.profile)))
    );
  }
  if (fields.has("settings")) {
    const rows = settingsToRows(uid, snap.settings);
    jobs.push(
      (async () => {
        const current = await supabase.from("user_settings").upsert(rows.settings);
        if (!current.error) return;
        if (
          !isMissingBibleSyncColumn(
            current.error,
            "preferred_bible_translation",
          )
        ) {
          throw current.error;
        }
        // Safe rolling-deploy fallback. The preference remains device-local
        // until migration 0011 is applied; all older settings still sync.
        const { preferred_bible_translation: _pending, ...legacySettings } =
          rows.settings;
        void _pending;
        const legacy = await supabase
          .from("user_settings")
          .upsert(legacySettings);
        if (legacy.error) throw legacy.error;
      })(),
    );
    jobs.push(
      run(supabase.from("notification_preferences").upsert(rows.notifications))
    );
  }
  if (fields.has("assignments")) {
    // Day-level replace: a day's pick list is owned wholesale by the device
    // (mergeSnapshots gives local days precedence), so clear every locally
    // known day and re-insert its picks. Upserting alone would leave stale
    // rows behind after an unpick.
    const days = Object.keys(snap.assignments);
    if (days.length) {
      const rows = Object.values(snap.assignments)
        .flat()
        .map((a) => assignmentToRow(uid, a));
      jobs.push(
        (async () => {
          const del = await supabase
            .from("user_daily_quests")
            .delete()
            .eq("user_id", uid)
            .in("assigned_date", days);
          if (del.error) throw del.error;
          if (rows.length) {
            const ins = await supabase.from("user_daily_quests").insert(rows);
            if (ins.error) throw ins.error;
          }
        })()
      );
    }
  }
  if (fields.has("myQuests")) {
    const rows = Object.values(snap.myQuests ?? {}).map((q) =>
      myQuestToRow(uid, q)
    );
    if (rows.length) {
      jobs.push(
        run(
          supabase
            .from("user_quests")
            .upsert(rows, { onConflict: "user_id,quest_slug" })
        )
      );
    }
  }
  if (fields.has("completions") && snap.completions.length) {
    jobs.push(
      run(
        supabase
          .from("quest_completions")
          .upsert(snap.completions.map((c) => completionToRow(uid, c)))
      )
    );
  }
  if (fields.has("prayers") && snap.prayers.length) {
    jobs.push(
      run(
        supabase
          .from("prayers")
          .upsert(snap.prayers.map((p) => prayerToRow(uid, p)))
      )
    );
  }
  if (fields.has("reflections") && snap.reflections.length) {
    jobs.push(
      run(
        supabase
          .from("reflections")
          .upsert(snap.reflections.map((r) => reflectionToRow(uid, r)))
      )
    );
  }
  if (fields.has("journeyEvents") && snap.journeyEvents.length) {
    // Append-only table (no UPDATE policy): insert new rows, skip existing.
    jobs.push(
      run(
        supabase.from("journey_events").upsert(
          snap.journeyEvents.map((e) => journeyEventToRow(uid, e)),
          { onConflict: "id", ignoreDuplicates: true }
        )
      )
    );
  }
  if (fields.has("growthEvents") && snap.growthEvents.length) {
    jobs.push(
      run(
        supabase.from("growth_events").upsert(
          snap.growthEvents.map((e) => growthEventToRow(uid, e)),
          { onConflict: "id", ignoreDuplicates: true }
        )
      )
    );
  }
  if (fields.has("earnedMilestones") && snap.earnedMilestones.length) {
    jobs.push(
      run(
        supabase.from("user_milestones").upsert(
          snap.earnedMilestones.map((m) => milestoneToRow(uid, m)),
          { onConflict: "user_id,milestone_key", ignoreDuplicates: true }
        )
      )
    );
  }
  if (fields.has("bookmarks") && snap.bookmarks.length) {
    jobs.push(
      (async () => {
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
      })(),
    );
  }
  if (fields.has("readingPosition") && snap.readingPosition) {
    jobs.push(
      run(
        supabase
          .from("reading_progress")
          .upsert(readingPositionToRow(uid, snap.readingPosition))
      )
    );
  }
  if (fields.has("chaptersRead") && snap.chaptersRead.length) {
    jobs.push(
      run(
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
      (async () => {
        const upsert = await supabase.from("user_recent_verses").upsert(
          verses.map((verse) => recentVerseToRow(uid, verse)),
          {
            onConflict:
              "user_id,book_slug,chapter,verse_start,verse_end",
          }
        );
        if (upsert.error) throw upsert.error;

        // The local/account merge keeps the newest twenty. Prune only rows
        // strictly older than that shared cutoff, so a concurrent newer visit
        // from another device can never be erased by this write-through.
        const oldestKeptAt = verses.at(-1)?.viewedAt;
        if (verses.length === 20 && oldestKeptAt) {
          const prune = await supabase
            .from("user_recent_verses")
            .delete()
            .eq("user_id", uid)
            .lt("viewed_at", oldestKeptAt);
          if (prune.error) throw prune.error;
        }
      })()
    );
  }

  await Promise.all(jobs);
}
