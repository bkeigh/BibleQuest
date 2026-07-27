import "server-only";

import { buildReleaseHealth, type ReleaseHealth } from "@/lib/observability/release";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import { seedQuests } from "@/data/seed/quests";
import dailyVerses from "@/data/seed/daily-verses.json";
import { prayerPrompts } from "@/data/seed/prayer-prompts";
import { reflectionPrompts } from "@/data/seed/reflection-prompts";
import { seedMilestones } from "@/data/seed/milestones";
import {
  emptyConsoleInsights,
  parseConsoleInsights,
  type ConsoleInsightRange,
  type ConsoleInsights,
} from "./insights";

export type ConsoleDataStatus = "live" | "setup_required" | "degraded";

export interface ConsoleDataSource {
  status: ConsoleDataStatus;
  label: string;
}

export interface ConsoleOverview {
  source: ConsoleDataSource;
  release: ReleaseHealth;
  metrics: {
    accounts: number | null;
    onboardedAccounts: number | null;
    questCompletions7d: number | null;
    activePlus: number | null;
    supportCents30d: number | null;
    pushFailures24h: number | null;
    webhookFailures24h: number | null;
  };
  content: {
    quests: number;
    dailyVerses: number;
    prayerPrompts: number;
    reflectionPrompts: number;
    milestones: number;
    sensitiveQuests: number;
  };
}

export interface ConsoleAccount {
  email: string;
  displayName: string;
  createdAt: string;
  lastSignInAt: string | null;
  onboardingCompleted: boolean;
  syncGeneration: number | null;
  subscriptionStatus: string;
}

export interface ConsoleAccountsResult {
  source: ConsoleDataSource;
  accounts: ConsoleAccount[];
}

export interface ConsoleSubscription {
  accountLabel: string;
  provider: string;
  status: string;
  plan: string;
  interval: string;
  periodEnd: string | null;
  synchronizedAt: string | null;
}

export interface ConsoleSupportPayment {
  amountCents: number;
  refundedCents: number;
  outcome: string;
  authenticated: boolean;
  createdAt: string;
}

export interface ConsoleWebhook {
  type: string;
  status: string;
  attempts: number;
  category: string | null;
  createdAt: string;
}

export interface ConsoleBillingResult {
  source: ConsoleDataSource;
  subscriptions: ConsoleSubscription[];
  supportPayments: ConsoleSupportPayment[];
  webhooks: ConsoleWebhook[];
}

export interface ConsoleFlag {
  key: string;
  description: string;
  enabled: boolean;
  audience: string;
}

export interface ConsoleFlagsResult {
  source: ConsoleDataSource;
  flags: ConsoleFlag[];
}

export interface ConsoleInsightsResult {
  source: ConsoleDataSource;
  insights: ConsoleInsights;
}

const SETUP_SOURCE: ConsoleDataSource = {
  status: "setup_required",
  label: "Connect the server operator key to load live records.",
};

/** Returns the privileged client only when its sealed configuration is valid. */
function adminClient() {
  try {
    return createAdminSupabase();
  } catch {
    return null;
  }
}

/** Converts one Supabase count response into a nullable operational metric. */
function safeCount(result: { count: number | null; error: unknown }) {
  return result.error ? null : (result.count ?? 0);
}

/** Marks a data set live only when every bounded query completed. */
function sourceFor(results: Array<{ error: unknown }>): ConsoleDataSource {
  const failed = results.filter((result) => result.error).length;
  if (failed === 0) {
    return { status: "live", label: "Live production records" };
  }
  return {
    status: "degraded",
    label: `${failed} bounded operator ${failed === 1 ? "query" : "queries"} unavailable`,
  };
}

/** Loads aggregate health without reading prayer or reflection content. */
export async function loadConsoleOverview(): Promise<ConsoleOverview> {
  const content = {
    quests: seedQuests.length,
    dailyVerses: dailyVerses.length,
    prayerPrompts: prayerPrompts.length,
    reflectionPrompts: reflectionPrompts.length,
    milestones: seedMilestones.length,
    sensitiveQuests: seedQuests.filter(
      (quest) => quest.sensitivityTags.length > 0,
    ).length,
  };
  const fallback: ConsoleOverview = {
    source: SETUP_SOURCE,
    release: buildReleaseHealth(),
    metrics: {
      accounts: null,
      onboardedAccounts: null,
      questCompletions7d: null,
      activePlus: null,
      supportCents30d: null,
      pushFailures24h: null,
      webhookFailures24h: null,
    },
    content,
  };
  const admin = adminClient();
  if (!admin) return fallback;

  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString();
  const thirtyDaysAgo = new Date(now - 30 * 86_400_000).toISOString();
  const oneDayAgo = new Date(now - 86_400_000).toISOString();

  const [
    accounts,
    onboarded,
    completions,
    activePlus,
    supportPayments,
    pushFailures,
    webhookFailures,
  ] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("onboarding_completed", true),
    admin
      .from("quest_completions")
      .select("id", { count: "exact", head: true })
      .gte("completed_at", sevenDaysAgo),
    admin
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "trialing"]),
    admin
      .from("stripe_support_payments")
      .select("amount_total, amount_refunded, outcome_status")
      .gte("created_at", thirtyDaysAgo)
      .in("outcome_status", [
        "completed",
        "partially_refunded",
        "refunded",
        "disputed",
        "dispute_won",
        "dispute_lost",
      ])
      .limit(1000),
    admin
      .from("push_deliveries")
      .select("id", { count: "exact", head: true })
      .gte("created_at", oneDayAgo)
      .in("status", ["transient_failure", "permanent_failure"]),
    admin
      .from("stripe_webhook_events")
      .select("event_id", { count: "exact", head: true })
      .gte("created_at", oneDayAgo)
      .eq("status", "failed"),
  ]);

  const supportCents30d = supportPayments.error
    ? null
    : (supportPayments.data ?? []).reduce(
        (total, payment) =>
          total +
          Math.max(
            0,
            Number(payment.amount_total ?? 0) -
              Number(payment.amount_refunded ?? 0),
          ),
        0,
      );

  return {
    source: sourceFor([
      accounts,
      onboarded,
      completions,
      activePlus,
      supportPayments,
      pushFailures,
      webhookFailures,
    ]),
    release: buildReleaseHealth(),
    metrics: {
      accounts: safeCount(accounts),
      onboardedAccounts: safeCount(onboarded),
      questCompletions7d: safeCount(completions),
      activePlus: safeCount(activePlus),
      supportCents30d,
      pushFailures24h: safeCount(pushFailures),
      webhookFailures24h: safeCount(webhookFailures),
    },
    content,
  };
}

/** Loads aggregate-only historical insights through the service-role RPC. */
export async function loadConsoleInsights(
  rangeDays: ConsoleInsightRange,
): Promise<ConsoleInsightsResult> {
  const fallback = emptyConsoleInsights(rangeDays);
  const admin = adminClient();
  if (!admin) return { source: SETUP_SOURCE, insights: fallback };

  const { data, error } = await admin.rpc("console_insights", {
    p_days: rangeDays,
  });
  if (error) {
    return {
      source: {
        status: "degraded",
        label: "Insights aggregate contract unavailable",
      },
      insights: fallback,
    };
  }

  const parsed = parseConsoleInsights(data, rangeDays);
  const questTitles = new Map(
    seedQuests.map((quest) => [quest.slug, quest.title]),
  );
  const insights = {
    ...parsed,
    topQuests: parsed.topQuests.map((quest) => ({
      ...quest,
      title: questTitles.get(quest.slug) ?? quest.slug.replaceAll("-", " "),
    })),
  };
  const complete =
    Boolean(insights.generatedAt) && insights.daily.length === rangeDays;

  return {
    source: complete
      ? { status: "live", label: "Privacy-safe production aggregates" }
      : { status: "degraded", label: "Insights aggregate returned partial data" },
    insights,
  };
}

/** Loads bounded account diagnostics without sacred writing or auth tokens. */
export async function loadConsoleAccounts(): Promise<ConsoleAccountsResult> {
  const admin = adminClient();
  if (!admin) return { source: SETUP_SOURCE, accounts: [] };

  const { data: authData, error: authError } =
    await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
  if (authError) {
    return {
      source: { status: "degraded", label: "Account directory unavailable" },
      accounts: [],
    };
  }

  const users = authData.users;
  const ids = users.map((user) => user.id);
  if (ids.length === 0) {
    return {
      source: { status: "live", label: "Live production records" },
      accounts: [],
    };
  }

  const [profiles, syncStates, subscriptions] = await Promise.all([
    admin
      .from("profiles")
      .select("id, display_name, onboarding_completed")
      .in("id", ids),
    admin
      .from("user_sync_state")
      .select("user_id, generation")
      .in("user_id", ids),
    admin
      .from("subscriptions")
      .select("user_id, status")
      .in("user_id", ids),
  ]);

  const profileById = new Map(
    (profiles.data ?? []).map((profile) => [profile.id, profile]),
  );
  const syncById = new Map(
    (syncStates.data ?? []).map((state) => [state.user_id, state]),
  );
  const subscriptionById = new Map(
    (subscriptions.data ?? []).map((subscription) => [
      subscription.user_id,
      subscription,
    ]),
  );

  return {
    source: sourceFor([profiles, syncStates, subscriptions]),
    accounts: users.map((user) => {
      const profile = profileById.get(user.id);
      const sync = syncById.get(user.id);
      const subscription = subscriptionById.get(user.id);
      return {
        email: user.email ?? "Email unavailable",
        displayName: profile?.display_name ?? "friend",
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
        onboardingCompleted: Boolean(profile?.onboarding_completed),
        syncGeneration:
          typeof sync?.generation === "number" ? sync.generation : null,
        subscriptionStatus: subscription?.status ?? "free",
      };
    }),
  };
}

/** Loads recent billing posture without card, address, or full provider IDs. */
export async function loadConsoleBilling(): Promise<ConsoleBillingResult> {
  const admin = adminClient();
  if (!admin) {
    return {
      source: SETUP_SOURCE,
      subscriptions: [],
      supportPayments: [],
      webhooks: [],
    };
  }

  const [subscriptions, supportPayments, webhooks] = await Promise.all([
    admin
      .from("subscriptions")
      .select(
        "user_id, provider, status, plan_key, billing_interval, current_period_end, synchronized_at",
      )
      .order("updated_at", { ascending: false })
      .limit(50),
    admin
      .from("stripe_support_payments")
      .select(
        "user_id, amount_total, requested_amount, amount_refunded, outcome_status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("stripe_webhook_events")
      .select("event_type, status, attempt_count, error_category, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    source: sourceFor([subscriptions, supportPayments, webhooks]),
    subscriptions: (subscriptions.data ?? []).map((subscription) => ({
      accountLabel: subscription.user_id ? "Account linked" : "Account removed",
      provider: subscription.provider ?? "unconfigured",
      status: subscription.status,
      plan: subscription.plan_key,
      interval: subscription.billing_interval ?? "—",
      periodEnd: subscription.current_period_end,
      synchronizedAt: subscription.synchronized_at,
    })),
    supportPayments: (supportPayments.data ?? []).map((payment) => ({
      amountCents: Number(payment.amount_total ?? payment.requested_amount ?? 0),
      refundedCents: Number(payment.amount_refunded ?? 0),
      outcome: payment.outcome_status,
      authenticated: Boolean(payment.user_id),
      createdAt: payment.created_at,
    })),
    webhooks: (webhooks.data ?? []).map((webhook) => ({
      type: webhook.event_type,
      status: webhook.status,
      attempts: webhook.attempt_count,
      category: webhook.error_category,
      createdAt: webhook.created_at,
    })),
  };
}

/** Loads the complete flag registry through the server-only operator boundary. */
export async function loadConsoleFlags(): Promise<ConsoleFlagsResult> {
  const admin = adminClient();
  if (!admin) return { source: SETUP_SOURCE, flags: [] };

  const result = await admin
    .from("feature_flags")
    .select("key, description, enabled, audience")
    .order("key");

  return {
    source: sourceFor([result]),
    flags: (result.data ?? []).map((flag) => ({
      key: flag.key,
      description: flag.description ?? "No description",
      enabled: flag.enabled,
      audience: flag.audience ?? "all",
    })),
  };
}
