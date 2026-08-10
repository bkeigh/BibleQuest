/**
 * Quest engine — picking, filtering, and suggestion.
 *
 * The user picks their own quests now (three outstanding quests for free);
 * the old daily-assignment scorer lives on as the "Suggested for today"
 * shelf. Suggestion is deterministic per user + date (seeded), avoids
 * recent repeats, respects preferences, and honors the current season.
 */
import { hashString, seededRandom } from "@/lib/utils/dates";
import type {
  DailyQuestAssignment,
  Profile,
  QuestCategory,
  QuestDuration,
  QuestTemplate,
  SeasonKey,
  Settings,
} from "./types";

/**
 * Free members may hold this many Ready or Active quests. Ready quests have no
 * countdown; the rolling window begins only when the quest becomes Active.
 */
export const FREE_QUEST_SLOTS = 3;
export const QUEST_WINDOW_MS = 24 * 60 * 60 * 1000;

function validTime(value?: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Backfill a legacy calendar-day assignment with a stable rolling window.
 * Existing picked/started timestamps win. Very old rows without either keep
 * their former midnight-to-midnight behavior instead of being resurrected.
 */
export function normalizeAssignmentWindow(
  assignment: DailyQuestAssignment,
): DailyQuestAssignment {
  const legacyDayStart = new Date(`${assignment.dateKey}T00:00:00`).getTime();
  const pickedMs =
    validTime(assignment.pickedAt) ??
    validTime(assignment.startedAt) ??
    validTime(assignment.completedAt) ??
    (Number.isFinite(legacyDayStart) ? legacyDayStart : Date.now());
  const expiresMs = validTime(assignment.expiresAt) ?? pickedMs + QUEST_WINDOW_MS;
  const pickedAt = new Date(pickedMs).toISOString();
  const expiresAt = new Date(Math.max(expiresMs, pickedMs)).toISOString();
  if (
    assignment.pickedAt === pickedAt &&
    assignment.expiresAt === expiresAt
  ) {
    return assignment;
  }
  return { ...assignment, pickedAt, expiresAt };
}

export function questWindowExpiresAt(assignment: DailyQuestAssignment): number {
  return Date.parse(normalizeAssignmentWindow(assignment).expiresAt);
}

export function isQuestWindowOpen(
  assignment: DailyQuestAssignment,
  now: Date | number = Date.now(),
): boolean {
  if (assignment.status === "assigned") return true;
  const nowMs = typeof now === "number" ? now : now.getTime();
  return questWindowExpiresAt(assignment) > nowMs;
}

/** Every Ready or Active quest occupies one spot, even after an Active timer ends. */
export function occupiedQuestAssignments(
  assignments: Record<string, DailyQuestAssignment[]>,
  now: Date | number = Date.now(),
): DailyQuestAssignment[] {
  void now;
  return Object.values(assignments)
    .flat()
    .map(normalizeAssignmentWindow)
    .filter(
      (assignment) =>
        assignment.status === "assigned" || assignment.status === "started",
    )
    .sort((a, b) => a.pickedAt.localeCompare(b.pickedAt));
}

/** Visible Ready and Active board assignments, oldest first. */
export function activeQuestAssignments(
  assignments: Record<string, DailyQuestAssignment[]>,
  now: Date | number = Date.now(),
): DailyQuestAssignment[] {
  return occupiedQuestAssignments(assignments, now);
}

export function questSlotsRemaining(
  assignments: Record<string, DailyQuestAssignment[]>,
  isPlus: boolean,
  now: Date | number = Date.now(),
): number {
  if (isPlus) return Number.POSITIVE_INFINITY;
  return Math.max(
    0,
    FREE_QUEST_SLOTS - occupiedQuestAssignments(assignments, now).length,
  );
}

export function nextQuestSlotAt(
  assignments: Record<string, DailyQuestAssignment[]>,
  isPlus: boolean,
  now: Date | number = Date.now(),
): string | null {
  if (isPlus || questSlotsRemaining(assignments, false, now) > 0) return null;
  return null;
}

/** Compact, human timing for quest cards; exact expiry remains in title/ARIA. */
export function formatQuestWindowRemaining(
  expiresAt: string,
  now: Date | number = Date.now(),
): string {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const remaining = Math.max(0, Date.parse(expiresAt) - nowMs);
  if (remaining === 0) return "Window ended";
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hr left`;
}

export interface QuestFilters {
  durations?: QuestDuration[];
  categories?: QuestCategory[];
  energy?: string[];
  soloOrSocial?: string;
  indoorOrOutdoor?: string;
  search?: string;
}

/**
 * Round-robin a collection across its categories.
 *
 * The seed file is written category by category, so the first twenty-four of
 * one hundred and fifty were six Prayer, six Silence, six Scripture, six
 * Reflection — four of fourteen. A reader had to press "Show 24 more" five
 * times before a Patience or Family quest existed on screen. Round-robin puts
 * one of every category in the first fourteen rows, so the range of the
 * library is visible by scrolling rather than by filtering.
 *
 * Stable, pure, length- and membership-preserving: lanes keep first-appearance
 * order and every quest is emitted exactly once.
 */
export function interleaveByCategory(
  quests: QuestTemplate[]
): QuestTemplate[] {
  const lanes = new Map<QuestCategory, QuestTemplate[]>();
  for (const quest of quests) {
    const lane = lanes.get(quest.category);
    if (lane) lane.push(quest);
    else lanes.set(quest.category, [quest]);
  }
  const rows = [...lanes.values()];
  // Math.max of an empty spread is -Infinity, which would skip the loop
  // silently rather than returning the (empty) input.
  const deepest = Math.max(0, ...rows.map((lane) => lane.length));
  const ordered: QuestTemplate[] = [];
  for (let depth = 0; depth < deepest; depth += 1) {
    for (const lane of rows) {
      const quest = lane[depth];
      if (quest) ordered.push(quest);
    }
  }
  return ordered;
}

export function filterQuests(
  quests: QuestTemplate[],
  filters: QuestFilters
): QuestTemplate[] {
  return quests.filter((q) => {
    if (filters.durations?.length && !filters.durations.includes(q.durationMinutes))
      return false;
    if (filters.categories?.length && !filters.categories.includes(q.category))
      return false;
    if (filters.energy?.length && !filters.energy.includes(q.energyLevel))
      return false;
    if (
      filters.soloOrSocial &&
      filters.soloOrSocial !== "either" &&
      q.soloOrSocial !== "either" &&
      q.soloOrSocial !== filters.soloOrSocial
    )
      return false;
    if (
      filters.indoorOrOutdoor &&
      filters.indoorOrOutdoor !== "either" &&
      q.indoorOrOutdoor !== "either" &&
      q.indoorOrOutdoor !== filters.indoorOrOutdoor
    )
      return false;
    if (filters.search) {
      const s = filters.search.toLowerCase();
      const hay =
        `${q.title} ${q.invitation} ${q.category} ${q.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });
}

const STYLE_CATEGORY_AFFINITY: Record<string, QuestCategory[]> = {
  quiet: ["silence", "prayer", "reflection", "gratitude"],
  scripture: ["scripture", "reflection", "prayer"],
  service: ["service", "generosity", "community"],
  kindness: ["kindness", "generosity", "family", "community"],
  discipline: ["discipline", "patience", "silence"],
  surprise: [],
};

/**
 * Select today's quest. Deterministic for a given (profile, date, reroll)
 * so the same quest greets the user all day — unless they gently ask for
 * another.
 */
function selectDailyQuest(options: {
  quests: QuestTemplate[];
  dateKey: string;
  profile: Profile | null;
  settings: Settings;
  season: SeasonKey;
  recentSlugs: string[];
  reroll?: number;
  excludeSlugs?: string[];
}): QuestTemplate | null {
  const {
    quests,
    dateKey,
    profile,
    settings,
    season,
    recentSlugs,
    reroll = 0,
    excludeSlugs = [],
  } = options;

  const active = quests.filter(
    (q) => !q.isPremium && !excludeSlugs.includes(q.slug)
  );
  if (active.length === 0) return null;

  const recent = new Set(recentSlugs.slice(-14));
  const affinity = profile?.questStyle
    ? STYLE_CATEGORY_AFFINITY[profile.questStyle] ?? []
    : [];

  const scored = active.map((q) => {
    let score = 1;
    // Prefer categories the user leaned toward.
    if (affinity.includes(q.category)) score += 2;
    if (settings.questCategoryPreference.includes(q.category)) score += 2;
    if (
      settings.questDurationPreference.length &&
      settings.questDurationPreference.includes(q.durationMinutes)
    )
      score += 1.5;
    // Seasonal fit is a gentle nudge, not a mandate.
    if (q.seasonTags.includes(season) && season !== "ordinary_time") score += 2;
    // Short quests carry the daily loop.
    if (q.durationMinutes <= 15) score += 1;
    // Avoid recent repeats strongly.
    if (recent.has(q.slug)) score -= 4;
    return { quest: q, score };
  });

  const max = Math.max(...scored.map((s) => s.score));
  // Keep everything within 2 points of the best so days stay varied.
  const pool = scored.filter((s) => s.score >= max - 2);
  const seed = hashString(
    `${dateKey}:${profile?.createdAt ?? "guest"}:${reroll}`
  );
  const rand = seededRandom(seed);
  return pool[Math.floor(rand() * pool.length)].quest;
}

/**
 * The "Suggested for today" shelf — the scorer above, run for up to
 * `count` distinct quests. Deterministic for a given (profile, date),
 * so the shelf holds steady all day. Callers pass already-picked and
 * already-completed slugs via `excludeSlugs`.
 */
export function selectSuggestedQuests(options: {
  quests: QuestTemplate[];
  dateKey: string;
  profile: Profile | null;
  settings: Settings;
  season: SeasonKey;
  recentSlugs: string[];
  excludeSlugs?: string[];
  count?: number;
}): QuestTemplate[] {
  const { count = FREE_QUEST_SLOTS, excludeSlugs = [], ...rest } = options;
  const picked: QuestTemplate[] = [];
  const exclude = [...excludeSlugs];
  for (let i = 0; i < count; i++) {
    const quest = selectDailyQuest({
      ...rest,
      reroll: i,
      excludeSlugs: exclude,
    });
    if (!quest) break;
    picked.push(quest);
    exclude.push(quest.slug);
  }
  return picked;
}
