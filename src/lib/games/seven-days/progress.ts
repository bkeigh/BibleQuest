import { SEVEN_DAYS_CHAPTERS, SEVEN_DAYS_CONTENT_VERSION } from "./content";
import {
  SEVEN_DAYS_LEVELS,
  SEVEN_DAYS_LEVEL_BY_ID,
  levelsForChapter,
} from "./levels";
import type { SevenDaysChapter, SevenDaysLevel } from "./types";
import {
  removeDevicePrivateStorageItem as removeWebPrivateStorageItem,
  setDevicePrivateStorageItem as setWebPrivateStorageItem,
  devicePrivateStorageReadAllowed as webPrivateStorageReadAllowed,
} from "@/lib/storage/device-private-write";
import {
  DEVICE_SEVEN_DAYS_STORAGE_KEY as LEGACY_SEVEN_DAYS_STORAGE_KEY,
  PROTECTED_SEVEN_DAYS_STORAGE_KEY as WEB_V2_SEVEN_DAYS_STORAGE_KEY,
  selectDevicePrivateStorageKey as selectedWebPrivateStorageKey,
} from "@/lib/storage/device-private-storage";

export const SEVEN_DAYS_STORAGE_KEY = LEGACY_SEVEN_DAYS_STORAGE_KEY;
export const SEVEN_DAYS_STORAGE_VERSION = 3;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const LEVEL_IDS = new Set(SEVEN_DAYS_LEVEL_BY_ID.keys());
const CHAPTER_IDS = new Set(SEVEN_DAYS_CHAPTERS.map((chapter) => chapter.id));
const QUESTION_IDS = new Set(
  SEVEN_DAYS_CHAPTERS.flatMap((chapter) =>
    chapter.questions.map((question) => question.id),
  ),
);

/**
 * What the game remembers, and nothing else: which levels have been cleared,
 * which days have had their questions answered, and which questions were right
 * first time. No score history, no attempt counts, no identity — a match-three
 * board is not a record of anyone's faith.
 */
export interface SevenDaysProgress {
  readonly version: typeof SEVEN_DAYS_STORAGE_VERSION;
  readonly contentVersion: number;
  readonly cleared: readonly string[];
  /** Chapter ids whose seven-question round has been completed. */
  readonly daysAnswered: readonly string[];
  /** Chapter ids opened with a purchased, server-consumed Question Skip. */
  readonly daysSkipped: readonly string[];
  /** Question ids answered correctly the first time they were asked. */
  readonly firstTry: readonly string[];
  readonly updatedAt: number;
}

export function emptySevenDaysProgress(now = Date.now()): SevenDaysProgress {
  return {
    version: SEVEN_DAYS_STORAGE_VERSION,
    contentVersion: SEVEN_DAYS_CONTENT_VERSION,
    cleared: [],
    daysAnswered: [],
    daysSkipped: [],
    firstTry: [],
    updatedAt: now,
  };
}

function knownIds(value: unknown, known: ReadonlySet<string>): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > known.size) return null;
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    if (!known.has(entry)) return null;
    if (ids.includes(entry)) continue;
    ids.push(entry);
  }
  return ids;
}

/**
 * Rejects anything that did not come from this build's content. A stored id
 * that no longer exists means the catalogue moved on, and a fresh start is
 * kinder than a map with holes in it.
 */
export function sanitizeSevenDaysProgress(
  value: unknown,
): SevenDaysProgress | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<Omit<SevenDaysProgress, "version">> & {
    version?: number;
  };
  if (entry.version !== 2 && entry.version !== SEVEN_DAYS_STORAGE_VERSION) {
    return null;
  }
  if (entry.contentVersion !== SEVEN_DAYS_CONTENT_VERSION) return null;
  if (
    !Number.isFinite(entry.updatedAt) ||
    Number(entry.updatedAt) < 0 ||
    Number(entry.updatedAt) > Date.now() + MAX_CLOCK_SKEW_MS
  ) {
    return null;
  }
  const cleared = knownIds(entry.cleared, LEVEL_IDS);
  const daysAnswered = knownIds(entry.daysAnswered, CHAPTER_IDS);
  const daysSkipped =
    entry.version === 2 ? [] : knownIds(entry.daysSkipped, CHAPTER_IDS);
  const firstTry = knownIds(entry.firstTry, QUESTION_IDS);
  if (!cleared || !daysAnswered || !daysSkipped || !firstTry) return null;
  if (daysAnswered.some((id) => daysSkipped.includes(id))) return null;
  // A day cannot be answered or skipped before all of its levels were played.
  for (const chapterId of [...daysAnswered, ...daysSkipped]) {
    if (levelsForChapter(chapterId).some((l) => !cleared.includes(l.id))) {
      return null;
    }
  }
  return {
    version: SEVEN_DAYS_STORAGE_VERSION,
    contentVersion: SEVEN_DAYS_CONTENT_VERSION,
    cleared,
    daysAnswered,
    daysSkipped,
    firstTry,
    updatedAt: Number(entry.updatedAt),
  };
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Resolves the atomically selected guest or installed-account namespace. */
function sevenDaysStorageKey(storage: Storage): string | null {
  return selectedWebPrivateStorageKey(
    storage,
    LEGACY_SEVEN_DAYS_STORAGE_KEY,
    WEB_V2_SEVEN_DAYS_STORAGE_KEY,
  );
}

export function readSevenDaysProgress(storage?: Storage): SevenDaysProgress {
  const target = storage ?? browserStorage();
  if (!target) return emptySevenDaysProgress();
  try {
    if (!webPrivateStorageReadAllowed(target, storage !== undefined)) {
      return emptySevenDaysProgress();
    }
    const key = sevenDaysStorageKey(target);
    if (!key) return emptySevenDaysProgress();
    const raw = target.getItem(key);
    if (
      !webPrivateStorageReadAllowed(target, storage !== undefined) ||
      !raw
    ) {
      return emptySevenDaysProgress();
    }
    const progress = sanitizeSevenDaysProgress(JSON.parse(raw));
    if (
      progress &&
      webPrivateStorageReadAllowed(target, storage !== undefined)
    ) {
      return progress;
    }
    if (!webPrivateStorageReadAllowed(target, storage !== undefined)) {
      return emptySevenDaysProgress();
    }
    void removeWebPrivateStorageItem(target, key, storage !== undefined, raw);
  } catch {
    // Restricted storage simply means this device does not keep a map.
  }
  return emptySevenDaysProgress();
}

export function writeSevenDaysProgress(
  progress: SevenDaysProgress,
  storage?: Storage,
): Promise<boolean> {
  const safe = sanitizeSevenDaysProgress(progress);
  const target = storage ?? browserStorage();
  if (!safe || !target) return Promise.resolve(false);
  const key = sevenDaysStorageKey(target);
  if (!key) return Promise.resolve(false);
  return setWebPrivateStorageItem(
    target,
    key,
    JSON.stringify(safe),
    storage !== undefined,
  );
}

/**
 * Reports storage eligibility without an unguarded probe mutation.
 */
export function sevenDaysStorageAvailable(storage?: Storage): boolean {
  const target = storage ?? browserStorage();
  if (!target) return false;
  return (
    webPrivateStorageReadAllowed(target, storage !== undefined) &&
    sevenDaysStorageKey(target) !== null
  );
}

export function clearSevenDaysProgress(storage?: Storage): Promise<boolean> {
  const target = storage ?? browserStorage();
  if (!target) return Promise.resolve(false);
  const key = sevenDaysStorageKey(target);
  if (!key) return Promise.resolve(false);
  return removeWebPrivateStorageItem(target, key, storage !== undefined);
}

/** Removes both web namespaces after terminal account deletion. */
export async function purgeSevenDaysProgress(
  storage?: Storage,
): Promise<boolean> {
  const target = storage ?? browserStorage();
  if (!target) return false;
  const results = await Promise.all([
    removeWebPrivateStorageItem(
      target,
      LEGACY_SEVEN_DAYS_STORAGE_KEY,
      storage !== undefined,
    ),
    removeWebPrivateStorageItem(
      target,
      WEB_V2_SEVEN_DAYS_STORAGE_KEY,
      storage !== undefined,
    ),
  ]);
  return results.every(Boolean);
}

export function markLevelCleared(
  progress: SevenDaysProgress,
  level: SevenDaysLevel,
  now = Date.now(),
): SevenDaysProgress {
  if (progress.cleared.includes(level.id)) return progress;
  return {
    ...progress,
    cleared: [...progress.cleared, level.id],
    updatedAt: now,
  };
}

/**
 * Records a finished question round.
 *
 * The round opens the next day whatever the score. The explanations are the
 * point, and a wall would only stop the reader who most needs the next one —
 * what the score changes is the mark on the map, never the road.
 */
export function markDayAnswered(
  progress: SevenDaysProgress,
  chapter: SevenDaysChapter,
  firstTryQuestionIds: readonly string[],
  now = Date.now(),
): SevenDaysProgress {
  const daysAnswered = progress.daysAnswered.includes(chapter.id)
    ? progress.daysAnswered
    : [...progress.daysAnswered, chapter.id];
  const firstTry = [...progress.firstTry];
  for (const id of firstTryQuestionIds) {
    if (QUESTION_IDS.has(id) && !firstTry.includes(id)) firstTry.push(id);
  }
  return {
    ...progress,
    daysAnswered,
    daysSkipped: progress.daysSkipped.filter((id) => id !== chapter.id),
    firstTry,
    updatedAt: now,
  };
}

/** Records one server-authorized skip without pretending questions were answered. */
export function markDaySkipped(
  progress: SevenDaysProgress,
  chapter: SevenDaysChapter,
  now = Date.now(),
): SevenDaysProgress {
  if (
    progress.daysAnswered.includes(chapter.id) ||
    progress.daysSkipped.includes(chapter.id) ||
    !isDayReadyForQuestions(progress, chapter)
  ) {
    return progress;
  }
  return {
    ...progress,
    daysSkipped: [...progress.daysSkipped, chapter.id],
    updatedAt: now,
  };
}

export function isLevelCleared(
  progress: SevenDaysProgress,
  level: SevenDaysLevel,
): boolean {
  return progress.cleared.includes(level.id);
}

export function isDayAnswered(
  progress: SevenDaysProgress,
  chapter: SevenDaysChapter,
): boolean {
  return progress.daysAnswered.includes(chapter.id);
}

export function isDaySkipped(
  progress: SevenDaysProgress,
  chapter: SevenDaysChapter,
): boolean {
  return progress.daysSkipped.includes(chapter.id);
}

/** Answered and purchased-skip chapters both satisfy the chapter gate. */
export function isDayComplete(
  progress: SevenDaysProgress,
  chapter: SevenDaysChapter,
): boolean {
  return isDayAnswered(progress, chapter) || isDaySkipped(progress, chapter);
}

/** True once every level of a day is cleared and its questions are waiting. */
export function isDayReadyForQuestions(
  progress: SevenDaysProgress,
  chapter: SevenDaysChapter,
): boolean {
  if (isDayComplete(progress, chapter)) return false;
  return levelsForChapter(chapter.id).every((level) =>
    progress.cleared.includes(level.id),
  );
}

/** A day opens when the day before it has answered its questions. */
export function isDayUnlocked(
  progress: SevenDaysProgress,
  chapter: SevenDaysChapter,
  bypassQuestions = false,
): boolean {
  if (chapter.day === 1 || bypassQuestions) return true;
  const previous = SEVEN_DAYS_CHAPTERS[chapter.day - 2];
  return isDayComplete(progress, previous);
}

/**
 * A level opens when the one before it in the same day has been cleared, and
 * the day itself has been opened. Levels already cleared stay open, so a
 * reader can revisit a day whenever they like.
 */
export function isLevelUnlocked(
  progress: SevenDaysProgress,
  level: SevenDaysLevel,
  bypassQuestions = false,
): boolean {
  const chapter = SEVEN_DAYS_CHAPTERS[level.day - 1];
  if (!chapter || !isDayUnlocked(progress, chapter, bypassQuestions)) {
    return false;
  }
  if (level.level === 1) return true;
  const previous = levelsForChapter(level.chapterId)[level.level - 2];
  return progress.cleared.includes(previous.id);
}

/** The level a "Continue" button should open: the first one not yet cleared. */
export function nextLevel(progress: SevenDaysProgress): SevenDaysLevel {
  const pending = SEVEN_DAYS_LEVELS.find(
    (level) => !progress.cleared.includes(level.id),
  );
  return pending ?? SEVEN_DAYS_LEVELS[SEVEN_DAYS_LEVELS.length - 1];
}

/** The day whose questions are waiting, if any. */
export function pendingQuestionDay(
  progress: SevenDaysProgress,
): SevenDaysChapter | null {
  return (
    SEVEN_DAYS_CHAPTERS.find((chapter) =>
      isDayReadyForQuestions(progress, chapter),
    ) ?? null
  );
}

export interface SevenDaysSummary {
  readonly cleared: number;
  readonly total: number;
  readonly firstTry: number;
  readonly daysAnswered: number;
  readonly daysSkipped: number;
  readonly daysOpened: number;
  readonly complete: boolean;
}

export function summarize(
  progress: SevenDaysProgress,
  bypassQuestions = false,
): SevenDaysSummary {
  const daysOpened = SEVEN_DAYS_CHAPTERS.filter((chapter) =>
    isDayUnlocked(progress, chapter, bypassQuestions),
  ).length;
  const completedDays = new Set([
    ...progress.daysAnswered,
    ...progress.daysSkipped,
  ]).size;
  return {
    cleared: progress.cleared.length,
    total: SEVEN_DAYS_LEVELS.length,
    firstTry: progress.firstTry.length,
    daysAnswered: progress.daysAnswered.length,
    daysSkipped: progress.daysSkipped.length,
    daysOpened,
    complete:
      progress.cleared.length === SEVEN_DAYS_LEVELS.length &&
      (bypassQuestions || completedDays === SEVEN_DAYS_CHAPTERS.length),
  };
}
