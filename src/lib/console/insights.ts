export const CONSOLE_INSIGHT_RANGES = [7, 30, 90] as const;

export type ConsoleInsightRange =
  (typeof CONSOLE_INSIGHT_RANGES)[number];

export interface ConsoleInsightDay {
  date: string;
  newAccounts: number;
  onboardedCohort: number;
  questCompletions: number;
  activeQuesters: number;
  pushSent: number;
  pushFailed: number;
  pushPending: number;
}

export interface ConsoleInsightFunnel {
  accountsCreated: number;
  onboardingCompleted: number;
  firstQuest: number;
  repeatQuest: number;
}

export interface ConsoleTopQuest {
  slug: string;
  title: string;
  completions: number;
}

export interface ConsoleInsightTotals {
  accounts: number;
  onboardedAccounts: number;
  questCompletions: number;
  activeQuesters: number;
  pushSent: number;
  pushFailed: number;
}

export interface ConsoleInsightFreshness {
  latestAccount: string | null;
  latestQuest: string | null;
  latestPush: string | null;
  latestSubscription: string | null;
  latestWebhook: string | null;
}

export interface ConsoleInsights {
  generatedAt: string | null;
  rangeDays: ConsoleInsightRange;
  daily: ConsoleInsightDay[];
  funnel: ConsoleInsightFunnel;
  topQuests: ConsoleTopQuest[];
  totals: ConsoleInsightTotals;
  freshness: ConsoleInsightFreshness;
}

type JsonRecord = Record<string, unknown>;

/** Narrows unknown JSON values to plain objects before reading fields. */
function record(value: unknown): JsonRecord {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

/** Bounds aggregate counts before they reach chart geometry or labels. */
function count(value: unknown): number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 1_000_000_000
    ? value
    : 0;
}

/** Accepts only date keys emitted by the aggregate database contract. */
function dateKey(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  return Number.isNaN(new Date(`${value}T00:00:00Z`).valueOf()) ? null : value;
}

/** Accepts timestamps without inventing freshness when a source is empty. */
function timestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return Number.isNaN(new Date(value).valueOf()) ? null : value;
}

/** Keeps range query parameters on the three reviewed query sizes. */
export function parseInsightsRange(
  value: string | undefined,
): ConsoleInsightRange {
  const parsed = Number(value);
  return CONSOLE_INSIGHT_RANGES.includes(parsed as ConsoleInsightRange)
    ? (parsed as ConsoleInsightRange)
    : 30;
}

/** Creates a truthful empty result while the aggregate contract is unavailable. */
export function emptyConsoleInsights(
  rangeDays: ConsoleInsightRange,
): ConsoleInsights {
  return {
    generatedAt: null,
    rangeDays,
    daily: [],
    funnel: {
      accountsCreated: 0,
      onboardingCompleted: 0,
      firstQuest: 0,
      repeatQuest: 0,
    },
    topQuests: [],
    totals: {
      accounts: 0,
      onboardedAccounts: 0,
      questCompletions: 0,
      activeQuesters: 0,
      pushSent: 0,
      pushFailed: 0,
    },
    freshness: {
      latestAccount: null,
      latestQuest: null,
      latestPush: null,
      latestSubscription: null,
      latestWebhook: null,
    },
  };
}

/** Parses the server-owned aggregate payload into a bounded UI contract. */
export function parseConsoleInsights(
  value: unknown,
  requestedRange: ConsoleInsightRange,
): ConsoleInsights {
  const payload = record(value);
  const rawDaily = Array.isArray(payload.daily)
    ? payload.daily.slice(0, requestedRange)
    : [];
  const daily = rawDaily.flatMap((entry): ConsoleInsightDay[] => {
    const row = record(entry);
    const date = dateKey(row.date);
    if (!date) return [];
    return [
      {
        date,
        newAccounts: count(row.new_accounts),
        onboardedCohort: count(row.onboarded_cohort),
        questCompletions: count(row.quest_completions),
        activeQuesters: count(row.active_questers),
        pushSent: count(row.push_sent),
        pushFailed: count(row.push_failed),
        pushPending: count(row.push_pending),
      },
    ];
  });
  const funnel = record(payload.funnel);
  const totals = record(payload.totals);
  const freshness = record(payload.freshness);
  const rawTopQuests = Array.isArray(payload.top_quests)
    ? payload.top_quests.slice(0, 8)
    : [];

  return {
    generatedAt: timestamp(payload.generated_at),
    rangeDays: requestedRange,
    daily,
    funnel: {
      accountsCreated: count(funnel.accounts_created),
      onboardingCompleted: count(funnel.onboarding_completed),
      firstQuest: count(funnel.first_quest),
      repeatQuest: count(funnel.repeat_quest),
    },
    topQuests: rawTopQuests.flatMap((entry): ConsoleTopQuest[] => {
      const quest = record(entry);
      const slug =
        typeof quest.slug === "string" &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(quest.slug) &&
        quest.slug.length <= 120
          ? quest.slug
          : null;
      if (!slug) return [];
      return [
        {
          slug,
          title: slug,
          completions: count(quest.completions),
        },
      ];
    }),
    totals: {
      accounts: count(totals.accounts),
      onboardedAccounts: count(totals.onboarded_accounts),
      questCompletions: count(totals.quest_completions),
      activeQuesters: count(totals.active_questers),
      pushSent: count(totals.push_sent),
      pushFailed: count(totals.push_failed),
    },
    freshness: {
      latestAccount: timestamp(freshness.latest_account),
      latestQuest: timestamp(freshness.latest_quest),
      latestPush: timestamp(freshness.latest_push),
      latestSubscription: timestamp(freshness.latest_subscription),
      latestWebhook: timestamp(freshness.latest_webhook),
    },
  };
}
