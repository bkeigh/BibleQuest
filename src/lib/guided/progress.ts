import {
  GUIDED_MOVEMENT_KEYS,
  type GuidedMovementKey,
  type GuidedSessionKind,
  type GuidedSessionProgress,
} from "@/lib/questos/types";
import { isValidDateKey } from "@/lib/utils/dates";

export const MAX_GUIDED_PROGRESS_RECORDS = 500;
const MAX_GUIDED_CLOCK_SKEW_MS = 5 * 60 * 1000;
const GUIDED_CONTENT_ID =
  /^(?:guide|pilgrimage)\.[a-z0-9]+(?:[.-][a-z0-9]+)*\.v[1-9]\d*$/;
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const GUIDED_MOVEMENT_SET = new Set<string>(GUIDED_MOVEMENT_KEYS);

/** Versioned ids keep progress attached to the exact reviewed content edition. */
export function isGuidedContentId(value: unknown): value is string {
  return typeof value === "string" && GUIDED_CONTENT_ID.test(value);
}

/** Daily sessions are day-scoped; pilgrimage days remain available indefinitely. */
export function makeGuidedSessionKey(
  kind: GuidedSessionKind,
  contentId: string,
  dateKey?: string,
): string {
  if (!isGuidedContentId(contentId)) {
    throw new Error("Guided content must use a stable versioned id.");
  }
  if (kind === "daily") {
    if (!dateKey || !isValidDateKey(dateKey)) {
      throw new Error("Daily guided sessions require a valid local date.");
    }
    return `daily|${dateKey}|${contentId}`;
  }
  return `pilgrimage|${contentId}`;
}

/** Validates a persisted key without trusting object property names on import. */
export function isGuidedSessionKey(
  value: unknown,
  kind: GuidedSessionKind,
  contentId: string,
): value is string {
  if (typeof value !== "string" || value.length > 180) return false;
  if (!isGuidedContentId(contentId)) return false;
  if (kind === "pilgrimage_day") {
    return value === `pilgrimage|${contentId}`;
  }
  const [prefix, dateKey, embeddedId, extra] = value.split("|");
  return (
    extra === undefined &&
    prefix === "daily" &&
    isValidDateKey(dateKey) &&
    embeddedId === contentId
  );
}

/** An ISO instant must parse to the same canonical moment before it is trusted. */
function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString() === value &&
    parsed.valueOf() <= Date.now() + MAX_GUIDED_CLOCK_SKEW_MS
  );
}

/**
 * Keeps the completed prefix canonical. Later movements cannot survive a
 * missing earlier one, which prevents imported or remote rows from skipping.
 */
export function normalizeGuidedMovements(
  values: readonly unknown[],
): GuidedMovementKey[] {
  const present = new Set(
    values.filter(
      (value): value is GuidedMovementKey =>
        typeof value === "string" && GUIDED_MOVEMENT_SET.has(value),
    ),
  );
  const completed: GuidedMovementKey[] = [];
  for (const movement of GUIDED_MOVEMENT_KEYS) {
    if (!present.has(movement)) break;
    completed.push(movement);
  }
  return completed;
}

/** Rejects malformed records before they can affect resume or progress UI. */
export function isGuidedSessionProgress(
  value: unknown,
): value is GuidedSessionProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    record.kind !== "daily" &&
    record.kind !== "pilgrimage_day"
  ) {
    return false;
  }
  if (
    !isGuidedContentId(record.contentId) ||
    !isGuidedSessionKey(record.sessionKey, record.kind, record.contentId) ||
    !Array.isArray(record.completedMovements) ||
    !record.completedMovements.every(
      (movement) =>
        typeof movement === "string" && GUIDED_MOVEMENT_SET.has(movement),
    ) ||
    !isIsoTimestamp(record.startedAt) ||
    !isIsoTimestamp(record.updatedAt) ||
    record.updatedAt < record.startedAt ||
    (record.completedAt !== undefined &&
      (!isIsoTimestamp(record.completedAt) ||
        record.completedAt < record.startedAt ||
        record.completedAt > record.updatedAt))
  ) {
    return false;
  }
  const normalized = normalizeGuidedMovements(record.completedMovements);
  const isComplete = normalized.length === GUIDED_MOVEMENT_KEYS.length;
  return isComplete === (record.completedAt !== undefined);
}

/**
 * Imports the newest bounded set. Old daily sessions may fall away, while
 * every retained pilgrimage day remains resumable without calendar pressure.
 */
export function sanitizeGuidedProgress(
  value: unknown,
): Record<string, GuidedSessionProgress> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const valid = Object.entries(value)
    .filter(
      (entry): entry is [string, GuidedSessionProgress] =>
        isGuidedSessionProgress(entry[1]) && entry[0] === entry[1].sessionKey,
    )
    .sort(([, left], [, right]) => {
      // Pilgrimage days never expire, so routine daily history cannot evict
      // an older multi-day path from the bounded device ledger.
      if (left.kind !== right.kind) {
        return left.kind === "pilgrimage_day" ? -1 : 1;
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, MAX_GUIDED_PROGRESS_RECORDS);
  return Object.fromEntries(
    valid.map(([key, progress]) => [
      key,
      {
        ...progress,
        completedMovements: normalizeGuidedMovements(
          progress.completedMovements,
        ),
      },
    ]),
  );
}

/** Creates a progress record without touching Journey, growth, or the candle. */
export function beginGuidedSession(
  sessionKey: string,
  contentId: string,
  kind: GuidedSessionKind,
  at: string,
): GuidedSessionProgress | null {
  if (
    !isIsoTimestamp(at) ||
    !isGuidedSessionKey(sessionKey, kind, contentId)
  ) {
    return null;
  }
  return {
    sessionKey,
    contentId,
    kind,
    completedMovements: [],
    startedAt: at,
    updatedAt: at,
  };
}

/** Adds one movement idempotently and marks the session complete at movement six. */
export function advanceGuidedSession(
  progress: GuidedSessionProgress,
  movement: GuidedMovementKey,
  at: string,
): GuidedSessionProgress {
  const alreadyCompleted = progress.completedMovements.includes(movement);
  const nextMovement = nextGuidedMovement(progress);
  if (
    !GUIDED_MOVEMENT_SET.has(movement) ||
    !isIsoTimestamp(at) ||
    (!alreadyCompleted && movement !== nextMovement)
  ) {
    return progress;
  }
  const completedMovements = normalizeGuidedMovements([
    ...progress.completedMovements,
    movement,
  ]);
  const completed =
    completedMovements.length === GUIDED_MOVEMENT_KEYS.length;
  return {
    ...progress,
    completedMovements,
    updatedAt: at >= progress.updatedAt ? at : progress.updatedAt,
    completedAt: completed
      ? progress.completedAt ?? (at >= progress.startedAt ? at : progress.updatedAt)
      : undefined,
  };
}

/** Returns the first unfinished movement for a calm deterministic Resume action. */
export function nextGuidedMovement(
  progress?: GuidedSessionProgress,
): GuidedMovementKey {
  return (
    GUIDED_MOVEMENT_KEYS.find(
      (movement) => !progress?.completedMovements.includes(movement),
    ) ?? "pray"
  );
}

/** Progress is an orientation aid, never a score or spiritual ranking. */
export function guidedProgressPercent(
  progress?: GuidedSessionProgress,
): number {
  return Math.round(
    ((progress?.completedMovements.length ?? 0) /
      GUIDED_MOVEMENT_KEYS.length) *
      100,
  );
}

/** Rebounds the ledger after adding a record so local storage cannot grow forever. */
export function upsertGuidedProgress(
  progress: Record<string, GuidedSessionProgress>,
  record: GuidedSessionProgress,
): Record<string, GuidedSessionProgress> {
  return sanitizeGuidedProgress({ ...progress, [record.sessionKey]: record });
}

/**
 * Monotonic account merge for one pilgrimage day. Devices union completed
 * movements, so a stale device can never make another device walk backward.
 */
export function mergeGuidedSessionProgress(
  left: GuidedSessionProgress,
  right: GuidedSessionProgress,
): GuidedSessionProgress {
  if (
    left.sessionKey !== right.sessionKey ||
    left.contentId !== right.contentId ||
    left.kind !== right.kind
  ) {
    return left.updatedAt >= right.updatedAt ? left : right;
  }
  const completedMovements = normalizeGuidedMovements([
    ...left.completedMovements,
    ...right.completedMovements,
  ]);
  const complete =
    completedMovements.length === GUIDED_MOVEMENT_KEYS.length;
  const completedCandidates = [left.completedAt, right.completedAt].filter(
    (value): value is string => Boolean(value),
  );
  return {
    ...left,
    completedMovements,
    startedAt:
      left.startedAt <= right.startedAt ? left.startedAt : right.startedAt,
    updatedAt:
      left.updatedAt >= right.updatedAt ? left.updatedAt : right.updatedAt,
    completedAt: complete
      ? completedCandidates.sort()[0] ??
        (left.updatedAt >= right.updatedAt ? left.updatedAt : right.updatedAt)
      : undefined,
  };
}

/** Daily records remain local while pilgrimage-day rows merge monotonically. */
export function mergeGuidedProgressRecords(
  local: Record<string, GuidedSessionProgress>,
  remote: Record<string, GuidedSessionProgress> | undefined,
): Record<string, GuidedSessionProgress> {
  const merged = { ...local };
  for (const [sessionKey, remoteProgress] of Object.entries(remote ?? {})) {
    if (remoteProgress.kind !== "pilgrimage_day") continue;
    const localProgress = merged[sessionKey];
    merged[sessionKey] =
      localProgress?.kind === "pilgrimage_day"
        ? mergeGuidedSessionProgress(localProgress, remoteProgress)
        : remoteProgress;
  }
  return sanitizeGuidedProgress(merged);
}
