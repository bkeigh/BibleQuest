/**
 * Quest engine — picking, filtering, and suggestion.
 *
 * The user picks their own quests now (up to MAX_DAILY_PICKS a day);
 * the old daily-assignment scorer lives on as the "Suggested for today"
 * shelf. Suggestion is deterministic per user + date (seeded), avoids
 * recent repeats, respects preferences, and honors the current season.
 */
import { hashString, seededRandom } from "@/lib/utils/dates";
import type {
  Profile,
  QuestCategory,
  QuestDuration,
  QuestTemplate,
  SeasonKey,
  Settings,
} from "./types";

/**
 * How many quests a user may pick per day. This is the free tier's cap —
 * if Plus ever lifts it, route the number through subscription-engine
 * instead of importing the constant directly.
 */
export const MAX_DAILY_PICKS = 3;

export interface QuestFilters {
  durations?: QuestDuration[];
  categories?: QuestCategory[];
  energy?: string[];
  soloOrSocial?: string;
  indoorOrOutdoor?: string;
  search?: string;
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
  const { count = MAX_DAILY_PICKS, excludeSlugs = [], ...rest } = options;
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
