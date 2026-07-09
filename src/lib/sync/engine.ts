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
import {
  assignmentToRow,
  bookmarkToRow,
  chapterReadToRow,
  completionToRow,
  growthEventToRow,
  journeyEventToRow,
  milestoneToRow,
  prayerToRow,
  profileToRow,
  readingPositionToRow,
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
  rowToPrayer,
  rowToProfile,
  rowToReadingPosition,
  rowToReflection,
} from "./mapping";

type SyncedField =
  | "profile"
  | "settings"
  | "assignments"
  | "completions"
  | "prayers"
  | "reflections"
  | "journeyEvents"
  | "growthEvents"
  | "earnedMilestones"
  | "bookmarks"
  | "readingPosition"
  | "chaptersRead";

const SYNCED_FIELDS: SyncedField[] = [
  "profile",
  "settings",
  "assignments",
  "completions",
  "prayers",
  "reflections",
  "journeyEvents",
  "growthEvents",
  "earnedMilestones",
  "bookmarks",
  "readingPosition",
  "chaptersRead",
];

const PUSH_DEBOUNCE_MS = 2_500;
const RETRY_MS = 30_000;

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

function setStatus(state: "off" | "syncing" | "idle" | "error", syncedNow = false) {
  useSyncStatus
    .getState()
    .setState(state, syncedNow ? new Date().toISOString() : undefined);
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
  setStatus("off");
}

export async function startSync(userId: string) {
  if (!isSupabaseConfigured()) return;
  if (currentUserId === userId) return;
  stopSync();
  currentUserId = userId;
  const token = ++runToken;
  const isCurrent = () => runToken === token && currentUserId === userId;
  setStatus("syncing");

  try {
    await initialSync(createClient(), userId, isCurrent);
    if (!isCurrent()) return; // stopped/restarted mid-sync
    setStatus("idle", true);
  } catch {
    if (!isCurrent()) return;
    setStatus("error");
    // NEVER fall through to write-through pushes before a successful pull —
    // a blind push would upsert this device's (possibly default/stale) data
    // over the account. Retry the full pull→merge instead, and install no
    // subscriber until it succeeds.
    retryTimer = setTimeout(() => {
      if (!isCurrent()) return;
      currentUserId = null; // release the same-user guard for re-entry
      void startSync(userId);
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
  setStatus("syncing");
  try {
    const supabase = createClient();
    const state = useQuestOS.getState();
    const tombstones = state.tombstones;
    const fields = new Set(dirty);
    dirty.clear();

    await propagateTombstones(supabase, tombstones);
    // Only clear when there was something to propagate — an unconditional
    // clear writes a fresh tombstones object every push, which the
    // subscriber sees as a change and turns into an endless push loop.
    if (
      tombstones.prayers.length ||
      tombstones.reflections.length ||
      tombstones.bookmarks.length
    ) {
      useQuestOS.getState().clearSyncTombstones(tombstones);
    }
    await pushFields(supabase, userId, snapshotFromStore(), fields);
    if (currentUserId === userId) setStatus("idle", true);
  } catch {
    // Push failed (offline, etc.) — mark everything dirty again and retry.
    for (const f of SYNCED_FIELDS) dirty.add(f);
    if (currentUserId === userId) {
      setStatus("error");
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
  const merged = normalizeIds(
    mergeSnapshots(local, filterByTombstones(remote, tombstones))
  );

  applyingRemote = true;
  try {
    useQuestOS.getState().importData(merged);
  } finally {
    applyingRemote = false;
  }

  await propagateTombstones(supabase, tombstones);
  useQuestOS.getState().clearSyncTombstones(tombstones);

  if (!isCurrent()) return;
  await pushFields(supabase, userId, merged, new Set(SYNCED_FIELDS));
}

function snapshotFromStore(): QuestOSSnapshot {
  const s = useQuestOS.getState();
  return {
    profile: s.profile,
    settings: s.settings,
    assignments: s.assignments,
    completions: s.completions,
    prayers: s.prayers,
    reflections: s.reflections,
    journeyEvents: s.journeyEvents,
    growthEvents: s.growthEvents,
    earnedMilestones: s.earnedMilestones,
    bookmarks: s.bookmarks,
    readingPosition: s.readingPosition,
    chaptersRead: s.chaptersRead,
    pendingMilestones: s.pendingMilestones,
    lastVisitDateKey: s.lastVisitDateKey,
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
    completionsRes,
    prayersRes,
    reflectionsRes,
    bookmarksRes,
    readingRes,
    chaptersRes,
    journeyRes,
    growthRes,
    milestonesRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    from("user_settings").maybeSingle(),
    from("notification_preferences").maybeSingle(),
    from("user_daily_quests"),
    from("quest_completions"),
    from("prayers"),
    from("reflections"),
    from("verse_bookmarks"),
    from("reading_progress").maybeSingle(),
    from("chapters_read"),
    from("journey_events"),
    from("growth_events"),
    from("user_milestones"),
  ]);

  const all = [
    profileRes, settingsRes, notifRes, dailyRes, completionsRes, prayersRes,
    reflectionsRes, bookmarksRes, readingRes, chaptersRes, journeyRes,
    growthRes, milestonesRes,
  ];
  for (const res of all) {
    if (res.error) throw res.error;
  }

  const assignments: QuestOSSnapshot["assignments"] = {};
  for (const row of dailyRes.data ?? []) {
    const a = rowToAssignment(row);
    (assignments[a.dateKey] ??= []).push(a);
  }

  return {
    profile: profileRes.data ? rowToProfile(profileRes.data) : null,
    settings:
      settingsRes.data || notifRes.data
        ? rowsToSettings(settingsRes.data ?? null, notifRes.data ?? null)
        : undefined,
    assignments,
    completions: (completionsRes.data ?? []).map(rowToCompletion),
    prayers: (prayersRes.data ?? []).map(rowToPrayer),
    reflections: (reflectionsRes.data ?? []).map(rowToReflection),
    bookmarks: (bookmarksRes.data ?? []).map(rowToBookmark),
    readingPosition: readingRes.data
      ? rowToReadingPosition(readingRes.data)
      : null,
    chaptersRead: (chaptersRes.data ?? []).map(rowToChapterRead),
    journeyEvents: (journeyRes.data ?? []).map(rowToJourneyEvent),
    growthEvents: (growthRes.data ?? []).map(rowToGrowthEvent),
    earnedMilestones: (milestonesRes.data ?? []).map(rowToMilestone),
  };
}

function filterByTombstones(remote: RemoteData, t: SyncTombstones): RemoteData {
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
            d.verse === b.verse
        )
    ),
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
  const settings = adoptRemote && remote.settings ? remote.settings : local.settings;

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

  // Bookmarks: union by natural key, local wins duplicates.
  const bookmarks = [...local.bookmarks];
  const bookmarkKeys = new Set(
    local.bookmarks.map((b) => `${b.bookSlug}:${b.chapter}:${b.verse}`)
  );
  for (const b of remote.bookmarks ?? []) {
    const key = `${b.bookSlug}:${b.chapter}:${b.verse}`;
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
    completions: unionById(local.completions, remote.completions),
    prayers: unionById(local.prayers, remote.prayers, newerByUpdatedAt),
    reflections: unionById(local.reflections, remote.reflections, newerByUpdatedAt),
    journeyEvents: unionById(local.journeyEvents, remote.journeyEvents),
    growthEvents: unionById(local.growthEvents, remote.growthEvents),
    earnedMilestones: [...milestoneMap.values()],
    bookmarks,
    readingPosition,
    chaptersRead,
    // Device-local fields pass through untouched.
    pendingMilestones: local.pendingMilestones,
    lastVisitDateKey: local.lastVisitDateKey,
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

async function propagateTombstones(
  supabase: SupabaseClient,
  t: SyncTombstones
) {
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
    const { error } = await supabase
      .from("verse_bookmarks")
      .delete()
      .match({ book_slug: b.bookSlug, chapter: b.chapter, verse: b.verse });
    if (error) throw error;
  }
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
    jobs.push(run(supabase.from("user_settings").upsert(rows.settings)));
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
      run(
        supabase.from("verse_bookmarks").upsert(
          snap.bookmarks.map((b) => bookmarkToRow(uid, b)),
          { onConflict: "user_id,book_slug,chapter,verse" }
        )
      )
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

  await Promise.all(jobs);
}
