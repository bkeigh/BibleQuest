import "server-only";

import { buildReleaseHealth, type ReleaseHealth } from "@/lib/observability/release";
import { recordServerFailure } from "@/lib/observability/server-failures";
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
import { getConsoleAccess } from "./auth.server";
import { findConsoleAccountByEmail } from "./plus-grants.server";

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
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastSignInAt: string | null;
  onboardingCompleted: boolean;
  syncGeneration: number | null;
  subscriptionStatus: string;
  entitlementSource: "stripe" | "operator" | "free";
  manualGrant: {
    duration: string;
    expiresAt: string | null;
    active: boolean;
  } | null;
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
  } catch (error) {
    recordServerFailure("console", "config", error);
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
  const access = await getConsoleAccess();
  if (access.state !== "authorized") return fallback;
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
    stripePlus,
    operatorPlus,
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
      .select("user_id")
      .eq("plan_key", "plus")
      .in("status", ["active", "trialing"])
      .not("user_id", "is", null)
      .limit(5000),
    admin
      .from("operator_plus_grants")
      .select("user_id")
      .is("revoked_at", null)
      .lte("starts_at", new Date(now).toISOString())
      .or(`expires_at.is.null,expires_at.gt.${new Date(now).toISOString()}`)
      .limit(5000),
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
  const activePlus =
    stripePlus.error || operatorPlus.error
      ? null
      : new Set(
          [...(stripePlus.data ?? []), ...(operatorPlus.data ?? [])]
            .map((row) => row.user_id)
            .filter((userId): userId is string => typeof userId === "string"),
        ).size;

  return {
    source: sourceFor([
      accounts,
      onboarded,
      completions,
      stripePlus,
      operatorPlus,
      supportPayments,
      pushFailures,
      webhookFailures,
    ]),
    release: buildReleaseHealth(),
    metrics: {
      accounts: safeCount(accounts),
      onboardedAccounts: safeCount(onboarded),
      questCompletions7d: safeCount(completions),
      activePlus,
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
  const access = await getConsoleAccess();
  if (access.state !== "authorized") {
    return { source: SETUP_SOURCE, insights: fallback };
  }
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
export async function loadConsoleAccounts(
  query = "",
): Promise<ConsoleAccountsResult> {
  const access = await getConsoleAccess();
  if (access.state !== "authorized") {
    return { source: SETUP_SOURCE, accounts: [] };
  }
  const admin = adminClient();
  if (!admin) return { source: SETUP_SOURCE, accounts: [] };

  const exactEmail =
    query.includes("@") && query.length <= 254
      ? query.trim().toLowerCase()
      : "";
  let users;
  if (exactEmail) {
    const exactUser = await findConsoleAccountByEmail(exactEmail);
    users = exactUser ? [exactUser] : [];
  } else {
    const { data: authData, error: authError } =
      await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
    if (authError) {
      return {
        source: { status: "degraded", label: "Account directory unavailable" },
        accounts: [],
      };
    }
    users = authData.users;
  }
  const ids = users.map((user) => user.id);
  if (ids.length === 0) {
    return {
      source: { status: "live", label: "Live production records" },
      accounts: [],
    };
  }

  const [profiles, syncStates, subscriptions, manualGrants] = await Promise.all([
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
      .select("user_id, status, plan_key, synchronized_at")
      .order("synchronized_at", { ascending: false })
      .in("user_id", ids),
    admin
      .from("operator_plus_grants")
      .select("user_id,duration_key,starts_at,expires_at,revoked_at")
      .is("revoked_at", null)
      .in("user_id", ids),
  ]);

  const profileById = new Map(
    (profiles.data ?? []).map((profile) => [profile.id, profile]),
  );
  const syncById = new Map(
    (syncStates.data ?? []).map((state) => [state.user_id, state]),
  );
  const subscriptionById = new Map();
  for (const subscription of subscriptions.data ?? []) {
    const existing = subscriptionById.get(subscription.user_id);
    const entitled =
      subscription.plan_key === "plus" &&
      ["active", "trialing"].includes(subscription.status);
    const existingEntitled =
      existing?.plan_key === "plus" &&
      ["active", "trialing"].includes(existing.status);
    if (!existing || (entitled && !existingEntitled)) {
      subscriptionById.set(subscription.user_id, subscription);
    }
  }
  const manualGrantById = new Map(
    (manualGrants.data ?? []).map((grant) => [grant.user_id, grant]),
  );
  const now = Date.now();

  return {
    source: sourceFor([profiles, syncStates, subscriptions, manualGrants]),
    accounts: users.map((user) => {
      const profile = profileById.get(user.id);
      const sync = syncById.get(user.id);
      const subscription = subscriptionById.get(user.id);
      const manualGrant = manualGrantById.get(user.id);
      const grantStartsAt = Date.parse(manualGrant?.starts_at ?? "");
      const grantExpiresAt = manualGrant?.expires_at
        ? Date.parse(manualGrant.expires_at)
        : null;
      const manualActive =
        Boolean(manualGrant) &&
        Number.isFinite(grantStartsAt) &&
        grantStartsAt <= now &&
        (grantExpiresAt === null ||
          (Number.isFinite(grantExpiresAt) && grantExpiresAt > now));
      const stripeActive =
        subscription?.plan_key === "plus" &&
        ["active", "trialing"].includes(subscription.status);
      return {
        id: user.id,
        email: user.email ?? "Email unavailable",
        displayName: profile?.display_name ?? "friend",
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
        onboardingCompleted: Boolean(profile?.onboarding_completed),
        syncGeneration:
          typeof sync?.generation === "number" ? sync.generation : null,
        subscriptionStatus: stripeActive
          ? subscription.status
          : manualActive
            ? "operator"
            : subscription?.status ?? "free",
        entitlementSource: stripeActive
          ? "stripe"
          : manualActive
            ? "operator"
            : "free",
        manualGrant: manualGrant
          ? {
              duration: manualGrant.duration_key,
              expiresAt: manualGrant.expires_at,
              active: manualActive,
            }
          : null,
      };
    }),
  };
}

/** Loads recent billing posture without card, address, or full provider IDs. */
export async function loadConsoleBilling(): Promise<ConsoleBillingResult> {
  const access = await getConsoleAccess();
  if (access.state !== "authorized") {
    return {
      source: SETUP_SOURCE,
      subscriptions: [],
      supportPayments: [],
      webhooks: [],
    };
  }
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
  const access = await getConsoleAccess();
  if (access.state !== "authorized") {
    return { source: SETUP_SOURCE, flags: [] };
  }
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
