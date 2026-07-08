/**
 * Import validation for a previously-exported journey.
 *
 * Reject files that clearly aren't a BibleQuest export, but be forgiving about
 * nested detail so a backup from a slightly different app version still
 * restores. We validate the KIND of each top-level field (array / object /
 * nullable) and drop anything malformed so it falls back to a safe default on
 * import. Deep field-by-field validation would risk rejecting a valid backup
 * over trivial drift, which for a restore is worse than accepting it.
 *
 * PRIVACY: this never logs the file and never echoes any of its contents in an
 * error message — prayer & reflection text must not leave the device.
 */
import type { QuestOSSnapshot } from "./types";

const ARRAY_FIELDS = [
  "completions",
  "prayers",
  "reflections",
  "journeyEvents",
  "growthEvents",
  "earnedMilestones",
  "bookmarks",
  "chaptersRead",
  "pendingMilestones",
] as const;

const OBJECT_FIELDS = ["settings", "assignments"] as const;
const NULLABLE_OBJECT_FIELDS = ["profile", "readingPosition"] as const;

const ALL_KEYS: string[] = [
  ...ARRAY_FIELDS,
  ...OBJECT_FIELDS,
  ...NULLABLE_OBJECT_FIELDS,
  "lastVisitDateKey",
];

export type ParseResult =
  | { ok: true; data: Partial<QuestOSSnapshot> }
  | { ok: false; error: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parse an untrusted JSON string into a sanitized snapshot. Returns a friendly,
 * content-free error on failure.
 */
export function parseSnapshot(rawText: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    return { ok: false, error: "That file isn’t valid JSON." };
  }
  if (!isPlainObject(json)) {
    return { ok: false, error: "That doesn’t look like a BibleQuest journey." };
  }
  // Require at least one recognized data key so we don't accept arbitrary {}.
  if (!ALL_KEYS.some((k) => k in json)) {
    return { ok: false, error: "That doesn’t look like a BibleQuest journey." };
  }

  const src = json;
  const out: Record<string, unknown> = {};

  for (const key of ARRAY_FIELDS) {
    const v = src[key];
    if (Array.isArray(v)) out[key] = v;
  }
  for (const key of OBJECT_FIELDS) {
    const v = src[key];
    if (isPlainObject(v)) out[key] = v;
  }
  for (const key of NULLABLE_OBJECT_FIELDS) {
    const v = src[key];
    if (v === null || isPlainObject(v)) out[key] = v;
  }
  const lastVisit = src.lastVisitDateKey;
  if (typeof lastVisit === "string" || lastVisit === null) {
    out.lastVisitDateKey = lastVisit;
  }

  return { ok: true, data: out as Partial<QuestOSSnapshot> };
}
