"use client";

/**
 * Persisted client-side observations for the revision-guarded mutable account
 * protocol. Only canonical SHA-256 fingerprints and revisions are retained;
 * prayer and reflection content is never duplicated into sync metadata.
 */

export type MutableAccountResource =
  | "profiles"
  | "user_settings"
  | "notification_preferences"
  | "prayers"
  | "reflections"
  | "user_quests"
  | "reading_progress"
  | "verse_bookmarks"
  | "user_recent_verses";

export type MutableResourceKey = Record<string, string | number>;

export interface MutableRevisionRemoval {
  key: MutableResourceKey;
  resource: MutableAccountResource;
}

export interface MutableRevisionEnvelope {
  expected_revision: number;
  row: Record<string, unknown>;
}

export interface PreparedMutableWrite {
  envelope: MutableRevisionEnvelope;
  fingerprint: string;
  key: MutableResourceKey;
  keyId: string;
}

export interface MutableRevisionAcknowledgement {
  key: MutableResourceKey;
  revision: number;
  status: "applied" | "conflict";
}

export interface ReconciledMutableRow {
  key: MutableResourceKey;
  localIntent: boolean;
  revision: number;
  row: Record<string, unknown>;
}

interface MutableObservation {
  fingerprint: string | null;
  revision: number;
}

interface StoredMutableObservation extends MutableObservation {
  key: MutableResourceKey;
  resource: MutableAccountResource;
}

interface StoredMutableSyncState {
  entries: StoredMutableObservation[];
  generation: number;
  observedResources: MutableAccountResource[];
  userId: string;
}

interface StoredMutableSyncLedger {
  accounts: StoredMutableSyncState[];
  version: 1;
}

interface MutableRevisionStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface MutableRevisionContext {
  entries: Map<string, MutableObservation>;
  generation: number | null;
  observedResources: Set<MutableAccountResource>;
  storage: MutableRevisionStorage | null;
  userId: string | null;
}

const STORAGE_KEY = "biblequest:mutable-account-cas:v1";
const MAX_STORED_ENTRIES = 10_000;
const MAX_STORED_ACCOUNTS = 4;
const RESOURCE_SET = new Set<MutableAccountResource>([
  "profiles",
  "user_settings",
  "notification_preferences",
  "prayers",
  "reflections",
  "user_quests",
  "reading_progress",
  "verse_bookmarks",
  "user_recent_verses",
]);
const WRITABLE_KEYS: Record<MutableAccountResource, readonly string[]> = {
  profiles: [
    "display_name",
    "tradition",
    "primary_goal",
    "calling",
    "daily_rhythm",
    "quest_style",
    "onboarding_completed",
    "created_at",
    "updated_at",
  ],
  user_settings: [
    "theme",
    "reduced_motion",
    "text_size",
    "quest_duration_pref",
    "quest_category_pref",
    "language",
    "preferred_bible_translation",
    "analytics_consent",
    "updated_at",
  ],
  notification_preferences: [
    "daily_verse_enabled",
    "daily_quest_enabled",
    "prayer_reminders_enabled",
    "weekly_recap_enabled",
    "preferred_time",
    "updated_at",
  ],
  prayers: [
    "id",
    "title",
    "body",
    "category",
    "status",
    "answered_at",
    "answer_reflection",
    "archived_at",
    "created_at",
    "updated_at",
  ],
  reflections: [
    "id",
    "prompt",
    "body",
    "mood",
    "related_quest_slug",
    "related_verse_reference",
    "archived_at",
    "created_at",
    "updated_at",
  ],
  user_quests: [
    "quest_slug",
    "status",
    "steps_done",
    "times_completed",
    "added_at",
    "started_at",
    "paused_at",
    "completed_at",
    "archived_at",
    "last_activity_at",
  ],
  reading_progress: ["book_slug", "book_name", "chapter", "updated_at"],
  verse_bookmarks: [
    "id",
    "book_slug",
    "book_name",
    "chapter",
    "verse",
    "text",
    "translation_key",
    "note",
    "created_at",
  ],
  user_recent_verses: [
    "book_slug",
    "book_name",
    "chapter",
    "verse_start",
    "verse_end",
    "reference",
    "text",
    "viewed_at",
  ],
};

/** Create isolated protocol state for one engine or deterministic test. */
export function createMutableRevisionContext(): MutableRevisionContext {
  return {
    entries: new Map(),
    generation: null,
    observedResources: new Set(),
    storage: null,
    userId: null,
  };
}

/** Reset in-memory observations without deleting a safe persisted baseline. */
export function resetMutableRevisionContext(context: MutableRevisionContext) {
  context.entries.clear();
  context.generation = null;
  context.observedResources.clear();
  context.storage = null;
  context.userId = null;
}

/** Remove persisted row-revision observations with a deleted device journey. */
export function clearStoredMutableRevisionContext(
  storage: MutableRevisionStorage | null = browserStorage(),
) {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing may make local storage unavailable.
  }
}

/** Restore observations only for the exact account and destructive generation. */
export function restoreMutableRevisionContext(
  context: MutableRevisionContext,
  userId: string,
  generation: number,
  allowStoredState: boolean,
  storage: MutableRevisionStorage | null = browserStorage(),
) {
  resetMutableRevisionContext(context);
  context.userId = userId;
  context.generation = generation;
  context.storage = storage;
  if (!allowStoredState || !storage) return;

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return;
    const ledger = parseStoredLedger(JSON.parse(raw));
    const parsed = ledger?.accounts.find(
      (account) =>
        account.userId === userId && account.generation === generation,
    );
    if (!parsed) return;
    for (const entry of parsed.entries) {
      context.entries.set(observationId(entry.resource, entry.key), {
        fingerprint: entry.fingerprint,
        revision: entry.revision,
      });
    }
    for (const resource of parsed.observedResources) {
      context.observedResources.add(resource);
    }
  } catch {
    // Unavailable or corrupt metadata must not expose content or permit a
    // blind local overwrite. The next pull establishes a fresh baseline.
  }
}

/** Start a new generation with no reusable per-row revision observations. */
export function replaceMutableRevisionGeneration(
  context: MutableRevisionContext,
  userId: string,
  generation: number,
) {
  const storage = context.storage ?? browserStorage();
  resetMutableRevisionContext(context);
  context.userId = userId;
  context.generation = generation;
  context.storage = storage;
  persistContext(context);
}

/** Carry surviving row observations across one proven partial-delete generation. */
export function advanceMutableRevisionGeneration(
  context: MutableRevisionContext,
  userId: string,
  generation: number,
  removals: readonly MutableRevisionRemoval[],
) {
  assertContextOwner(context, userId);
  if (
    !Number.isSafeInteger(generation) ||
    generation < 0 ||
    generation < (context.generation ?? 0)
  ) {
    throw new Error("Mutable account sync generation cannot move backward.");
  }
  for (const removal of removals) {
    const key = mutableResourceKey(removal.resource, removal.key, userId);
    if (stableStringify(key) !== stableStringify(removal.key)) {
      throw new Error("Mutable account sync removal key is invalid.");
    }
    context.entries.delete(observationId(removal.resource, key));
  }
  context.generation = generation;
  persistContext(context);
}

/** Return the collision-free protocol key for a mutable row. */
export function mutableResourceKey(
  resource: MutableAccountResource,
  row: object,
  expectedUserId?: string,
): MutableResourceKey {
  const record = row as Record<string, unknown>;
  const text = (field: string) => {
    const value = record[field];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Mutable account row is missing ${field}.`);
    }
    return value;
  };
  const integer = (field: string) => {
    const value = record[field];
    if (!Number.isSafeInteger(value)) {
      throw new Error(`Mutable account row is missing ${field}.`);
    }
    return value as number;
  };

  switch (resource) {
    case "profiles":
      return { id: expectedUserId ?? text("id") };
    case "user_settings":
    case "notification_preferences":
    case "reading_progress":
      return { user_id: expectedUserId ?? text("user_id") };
    case "prayers":
    case "reflections":
      return { id: text("id") };
    case "user_quests":
      return { quest_slug: text("quest_slug") };
    case "verse_bookmarks":
      return {
        book_slug: text("book_slug"),
        chapter: integer("chapter"),
        verse: integer("verse"),
        translation_key: text("translation_key"),
      };
    case "user_recent_verses":
      return {
        book_slug: text("book_slug"),
        chapter: integer("chapter"),
        verse_start: integer("verse_start"),
        verse_end: integer("verse_end"),
      };
  }
}

/** Remove owner and server-only revision fields before hashing or writing. */
export function mutablePayloadRow(
  resource: MutableAccountResource,
  row: object,
): Record<string, unknown> {
  const record = row as Record<string, unknown>;
  return Object.fromEntries(
    WRITABLE_KEYS[resource]
      .filter((key) => Object.hasOwn(record, key))
      .map((key) => [key, record[key]]),
  );
}

/** Hash a canonical row without retaining its private content. */
export async function fingerprintMutableRow(
  resource: MutableAccountResource,
  row: object,
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Secure account sync hashing is unavailable.");
  const bytes = new TextEncoder().encode(
    stableStringify(mutablePayloadRow(resource, row)),
  );
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Rebase one resource against the last canonical fingerprints. A trusted
 * local difference remains pending regardless of its wall-clock timestamps;
 * otherwise the pulled server row is authoritative.
 */
export async function reconcileMutableRows(
  context: MutableRevisionContext,
  resource: MutableAccountResource,
  localRows: readonly object[],
  remoteRows: readonly object[],
  options: {
    allowLocalInsertWithoutBaseline?: boolean;
    allowLocalWithoutBaseline?: boolean;
    expectedUserId: string;
  },
): Promise<ReconciledMutableRow[]> {
  assertContextOwner(context, options.expectedUserId);
  const local = await indexRows(resource, localRows, options.expectedUserId, false);
  const remote = await indexRows(resource, remoteRows, options.expectedUserId, true);
  const hadResourceBaseline = context.observedResources.has(resource);
  const keys = new Set([...local.keys(), ...remote.keys()]);
  const reconciled: ReconciledMutableRow[] = [];

  for (const keyId of [...keys].sort()) {
    const localRow = local.get(keyId);
    const remoteRow = remote.get(keyId);
    const previous = context.entries.get(observationMapId(resource, keyId));
    const localIntent = Boolean(
      localRow &&
        (previous
          ? localRow.fingerprint !== previous.fingerprint
          : hadResourceBaseline ||
            options.allowLocalWithoutBaseline ||
            (options.allowLocalInsertWithoutBaseline && !remoteRow)),
    );
    const winner = localIntent ? localRow : remoteRow;
    const canonical = remoteRow
      ? { fingerprint: remoteRow.fingerprint, revision: remoteRow.revision }
      : { fingerprint: null, revision: 0 };
    context.entries.set(observationMapId(resource, keyId), canonical);

    if (winner) {
      reconciled.push({
        key: winner.key,
        localIntent,
        revision: canonical.revision,
        row: winner.row,
      });
    }
  }

  context.observedResources.add(resource);
  persistContext(context);
  return reconciled;
}

/** Filter a mutable batch to rows that differ from its pulled/acknowledged base. */
export async function prepareMutableWrites(
  context: MutableRevisionContext,
  resource: MutableAccountResource,
  rows: readonly object[],
  expectedUserId: string,
): Promise<PreparedMutableWrite[]> {
  assertContextOwner(context, expectedUserId);
  if (!context.observedResources.has(resource)) {
    throw new Error("Mutable account sync has no canonical baseline.");
  }

  const indexed = await indexRows(resource, rows, expectedUserId, false);
  const prepared: PreparedMutableWrite[] = [];
  for (const [keyId, current] of indexed) {
    const observation = context.entries.get(observationMapId(resource, keyId));
    if (observation?.fingerprint === current.fingerprint) continue;
    prepared.push({
      envelope: {
        expected_revision: observation?.revision ?? 0,
        row: mutablePayloadRow(resource, current.row),
      },
      fingerprint: current.fingerprint,
      key: current.key,
      keyId,
    });
  }
  return prepared;
}

/** Persist successful rows before reporting any sibling CAS conflicts. */
export function acknowledgeMutableWrites(
  context: MutableRevisionContext,
  resource: MutableAccountResource,
  prepared: readonly PreparedMutableWrite[],
  results: readonly MutableRevisionAcknowledgement[],
): number {
  if (prepared.length !== results.length) {
    throw new Error("Mutable account sync returned an invalid acknowledgement.");
  }

  let conflicts = 0;
  for (let index = 0; index < prepared.length; index += 1) {
    const pending = prepared[index];
    const result = results[index];
    if (stableStringify(result.key) !== stableStringify(pending.key)) {
      throw new Error("Mutable account sync returned an invalid acknowledgement.");
    }
    if (result.status === "applied") {
      if (result.revision !== pending.envelope.expected_revision + 1) {
        throw new Error("Mutable account sync returned an invalid acknowledgement.");
      }
      context.entries.set(observationMapId(resource, pending.keyId), {
        fingerprint: pending.fingerprint,
        revision: result.revision,
      });
    } else {
      if (result.revision === pending.envelope.expected_revision) {
        throw new Error("Mutable account sync returned an invalid acknowledgement.");
      }
      conflicts += 1;
    }
  }
  persistContext(context);
  return conflicts;
}

/** Return a browser storage handle without assuming one during SSR. */
function browserStorage(): MutableRevisionStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Index rows by the same stable key objects returned by the server. */
async function indexRows(
  resource: MutableAccountResource,
  rows: readonly object[],
  expectedUserId: string,
  remote: boolean,
) {
  const indexed = new Map<
    string,
    {
      fingerprint: string;
      key: MutableResourceKey;
      revision: number;
      row: Record<string, unknown>;
    }
  >();
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    if (remote) assertRemoteOwner(resource, record, expectedUserId);
    const key = mutableResourceKey(resource, record, expectedUserId);
    const keyId = stableStringify(key);
    const revision = remote ? readRevision(record) : 0;
    if (indexed.has(keyId)) throw new Error("Duplicate mutable account row key.");
    indexed.set(keyId, {
      fingerprint: await fingerprintMutableRow(resource, record),
      key,
      revision,
      row: mutablePayloadRow(resource, record),
    });
  }
  return indexed;
}

/** Refuse a pulled row that crossed the captured authenticated owner. */
function assertRemoteOwner(
  resource: MutableAccountResource,
  row: Record<string, unknown>,
  expectedUserId: string,
) {
  const owner = resource === "profiles" ? row.id : row.user_id;
  if (owner !== expectedUserId) {
    throw new Error("Mutable account row owner changed during sync.");
  }
}

/** Read only safe nonnegative server revisions. */
function readRevision(row: Record<string, unknown>): number {
  const revision = row.sync_revision;
  if (!Number.isSafeInteger(revision) || (revision as number) < 0) {
    throw new Error("Mutable account sync revision is unavailable.");
  }
  return revision as number;
}

/** Ensure protocol metadata cannot cross an account boundary. */
function assertContextOwner(
  context: MutableRevisionContext,
  expectedUserId: string,
) {
  if (context.userId !== expectedUserId || context.generation === null) {
    throw new Error("Mutable account sync context is unavailable.");
  }
}

/** Persist only bounded revision metadata and canonical hashes. */
function persistContext(context: MutableRevisionContext) {
  if (!context.storage || !context.userId || context.generation === null) return;
  try {
    const entries: StoredMutableObservation[] = [];
    for (const [id, observation] of context.entries) {
      const parsed = parseObservationId(id);
      entries.push({ ...parsed, ...observation });
    }
    if (entries.length > MAX_STORED_ENTRIES) {
      throw new Error("Mutable account sync metadata is too large.");
    }
    const state: StoredMutableSyncState = {
      entries,
      generation: context.generation,
      observedResources: [...context.observedResources].sort(),
      userId: context.userId,
    };
    let accounts: StoredMutableSyncState[] = [];
    const existing = context.storage.getItem(STORAGE_KEY);
    if (existing) {
      accounts = parseStoredLedger(JSON.parse(existing))?.accounts ?? [];
    }
    const ledger: StoredMutableSyncLedger = {
      accounts: [
        state,
        ...accounts.filter((account) => account.userId !== context.userId),
      ].slice(0, MAX_STORED_ACCOUNTS),
      version: 1,
    };
    context.storage.setItem(STORAGE_KEY, JSON.stringify(ledger));
  } catch {
    // An older persisted baseline could misclassify imported canonical data
    // as a local edit after reload, so invalidate it on any failed rewrite.
    try {
      context.storage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be wholly unavailable; this session still uses memory.
    }
  }
}

/** Parse a bounded ledger without trusting arbitrary persisted key objects. */
function parseStoredLedger(value: unknown): StoredMutableSyncLedger | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<StoredMutableSyncLedger>;
  if (
    candidate.version !== 1 ||
    !Array.isArray(candidate.accounts) ||
    candidate.accounts.length > MAX_STORED_ACCOUNTS
  ) {
    return null;
  }

  const accounts: StoredMutableSyncState[] = [];
  for (const valueAccount of candidate.accounts) {
    const account = parseStoredAccount(valueAccount);
    if (!account || accounts.some((item) => item.userId === account.userId)) {
      return null;
    }
    accounts.push(account);
  }
  return { accounts, version: 1 };
}

/** Parse one account's exact generation-bound observations. */
function parseStoredAccount(value: unknown): StoredMutableSyncState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<StoredMutableSyncState>;
  if (
    typeof candidate.userId !== "string" ||
    !candidate.userId ||
    !Number.isSafeInteger(candidate.generation) ||
    (candidate.generation as number) < 0 ||
    !Array.isArray(candidate.entries) ||
    candidate.entries.length > MAX_STORED_ENTRIES ||
    !Array.isArray(candidate.observedResources)
  ) {
    return null;
  }
  const userId = candidate.userId;
  const generation = candidate.generation as number;

  const observedResources = candidate.observedResources.filter(
    (resource): resource is MutableAccountResource =>
      typeof resource === "string" &&
      RESOURCE_SET.has(resource as MutableAccountResource),
  );
  if (observedResources.length !== candidate.observedResources.length) return null;

  const entries: StoredMutableObservation[] = [];
  for (const valueEntry of candidate.entries) {
    if (!valueEntry || typeof valueEntry !== "object" || Array.isArray(valueEntry)) {
      return null;
    }
    const entry = valueEntry as Partial<StoredMutableObservation>;
    if (
      typeof entry.resource !== "string" ||
      !RESOURCE_SET.has(entry.resource as MutableAccountResource) ||
      !entry.key ||
      typeof entry.key !== "object" ||
      Array.isArray(entry.key) ||
      !Number.isSafeInteger(entry.revision) ||
      (entry.revision as number) < 0 ||
      !(
        entry.fingerprint === null ||
        (typeof entry.fingerprint === "string" &&
          /^[0-9a-f]{64}$/.test(entry.fingerprint))
      )
    ) {
      return null;
    }
    const resource = entry.resource as MutableAccountResource;
    let validatedKey: MutableResourceKey;
    try {
      validatedKey = mutableResourceKey(
        resource,
        entry.key as MutableResourceKey,
      );
    } catch {
      return null;
    }
    if (stableStringify(validatedKey) !== stableStringify(entry.key)) return null;
    if (
      ((resource === "profiles" && validatedKey.id !== userId) ||
        ((resource === "user_settings" ||
          resource === "notification_preferences" ||
          resource === "reading_progress") &&
          validatedKey.user_id !== userId))
    ) {
      return null;
    }
    entries.push({
      fingerprint: entry.fingerprint as string | null,
      key: validatedKey,
      resource,
      revision: entry.revision as number,
    });
  }
  return {
    entries,
    generation,
    observedResources,
    userId,
  };
}

/** Build a storage-safe map key from a resource and stable key object. */
function observationId(
  resource: MutableAccountResource,
  key: MutableResourceKey,
) {
  return observationMapId(resource, stableStringify(key));
}

/** Join already-canonical key JSON without ambiguous user-controlled delimiters. */
function observationMapId(resource: MutableAccountResource, keyId: string) {
  return JSON.stringify([resource, keyId]);
}

/** Recover one persisted observation key. */
function parseObservationId(id: string): {
  key: MutableResourceKey;
  resource: MutableAccountResource;
} {
  const parsed = JSON.parse(id) as [MutableAccountResource, string];
  return { resource: parsed[0], key: JSON.parse(parsed[1]) as MutableResourceKey };
}

/** Canonicalize JSON objects while preserving meaningful array order. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
