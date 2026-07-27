import Link from "next/link";
import { ConsoleActivityChart } from "@/components/console/ConsoleActivityChart";
import { ConsoleActivationFunnel } from "@/components/console/ConsoleActivationFunnel";
import { ConsolePushChart } from "@/components/console/ConsolePushChart";
import { ConsoleTopQuestChart } from "@/components/console/ConsoleTopQuestChart";
import {
  ConsoleEmptyState,
  ConsoleMetric,
  ConsolePageHeader,
  ConsolePanel,
  ConsoleSourceNotice,
  ConsoleStatus,
} from "@/components/console/ConsolePrimitives";
import { loadConsoleInsights } from "@/lib/console/data.server";
import { formatCount, formatDateTime } from "@/lib/console/format";
import {
  CONSOLE_INSIGHT_RANGES,
  parseInsightsRange,
} from "@/lib/console/insights";

interface InsightsPageProps {
  searchParams: Promise<{ range?: string }>;
}

export const dynamic = "force-dynamic";

/** Formats a bounded ratio without implying precision when no denominator exists. */
function percentage(numerator: number, denominator: number) {
  return denominator > 0
    ? `${Math.round((numerator / denominator) * 100)}%`
    : "—";
}

/** Presents aggregate product trends without loading private spiritual writing. */
export default async function ConsoleInsightsPage({
  searchParams,
}: InsightsPageProps) {
  const params = await searchParams;
  const range = parseInsightsRange(params.range);
  const result = await loadConsoleInsights(range);
  const { insights } = result;
  const live = result.source.status === "live";
  const pushResolved = insights.totals.pushSent + insights.totals.pushFailed;

  return (
    <>
      <ConsolePageHeader
        eyebrow="PRODUCT INSIGHTS"
        title="See growth without watching people."
        description="Aggregate activation, quest, and delivery trends. No prayer text, reflection text, journal content, or member-level spiritual scoring."
        actions={
          <ConsoleStatus
            tone={result.source.status === "live" ? "good" : "warning"}
          >
            {result.source.status === "live" ? "Aggregate live" : "Partial"}
          </ConsoleStatus>
        }
      />

      <ConsoleSourceNotice source={result.source} />

      <nav className="console-range-picker" aria-label="Insight date range">
        {CONSOLE_INSIGHT_RANGES.map((days) => (
          <Link
            key={days}
            href={`?range=${days}`}
            aria-current={range === days ? "page" : undefined}
            className={range === days ? "console-range-active" : undefined}
          >
            {days} days
          </Link>
        ))}
      </nav>

      <section
        className="console-metric-grid console-metric-grid-wide"
        aria-label="Insight totals"
      >
        <ConsoleMetric
          label="TOTAL ACCOUNTS"
          value={formatCount(live ? insights.totals.accounts : null)}
          detail={
            live
              ? `${formatCount(insights.totals.onboardedAccounts)} currently onboarded`
              : "Aggregate unavailable"
          }
        />
        <ConsoleMetric
          label="ONBOARDING RATE"
          value={
            live
              ? percentage(
                  insights.totals.onboardedAccounts,
                  insights.totals.accounts,
                )
              : "—"
          }
          detail="Current account completion posture"
          tone="good"
        />
        <ConsoleMetric
          label={`QUESTS · ${range} DAYS`}
          value={formatCount(
            live ? insights.totals.questCompletions : null,
          )}
          detail={
            live
              ? `${formatCount(insights.totals.activeQuesters)} participating accounts`
              : "Aggregate unavailable"
          }
          tone="good"
        />
        <ConsoleMetric
          label="PUSH DELIVERY"
          value={
            live
              ? percentage(insights.totals.pushSent, pushResolved)
              : "—"
          }
          detail={
            live
              ? `${formatCount(insights.totals.pushFailed)} resolved failures`
              : "Aggregate unavailable"
          }
          tone={insights.totals.pushFailed > 0 ? "warning" : "default"}
        />
      </section>

      <ConsolePanel
        title="Quest activity"
        description={`Daily completion volume and distinct participating accounts across ${range} days.`}
      >
        {insights.daily.length === 0 ? (
          <ConsoleEmptyState
            title="Historical aggregates unavailable"
            description="The insights contract must be applied before production trends can load."
          />
        ) : (
          <ConsoleActivityChart daily={insights.daily} />
        )}
      </ConsolePanel>

      <div className="console-two-column">
        <ConsolePanel
          title="Activation funnel"
          description={`Accounts created during the selected ${range}-day cohort and their current progress.`}
        >
          {!live ? (
            <ConsoleEmptyState
              title="Activation aggregate unavailable"
              description="The database contract must be connected before cohort progress can load."
            />
          ) : (
            <ConsoleActivationFunnel funnel={insights.funnel} />
          )}
        </ConsolePanel>

        <ConsolePanel
          title="Most completed quests"
          description="Aggregate completion volume for content stewardship."
        >
          {insights.topQuests.length === 0 ? (
            <ConsoleEmptyState
              title="No quest completions"
              description="No aggregate quest activity is available for this range."
            />
          ) : (
            <ConsoleTopQuestChart quests={insights.topQuests} />
          )}
        </ConsolePanel>
      </div>

      <ConsolePanel
        title="Push reliability"
        description="Daily sent, pending, and failed reminder deliveries. Test sends are excluded."
      >
        {insights.daily.length === 0 ? (
          <ConsoleEmptyState
            title="No delivery history"
            description="Push delivery aggregates are not available."
          />
        ) : (
          <ConsolePushChart daily={insights.daily} />
        )}
      </ConsolePanel>

      <ConsolePanel
        title="Source freshness"
        description={`Aggregate generated ${formatDateTime(insights.generatedAt)}.`}
      >
        <dl className="console-definition-list console-freshness-list">
          <div>
            <dt>Latest account</dt>
            <dd>{formatDateTime(insights.freshness.latestAccount)}</dd>
          </div>
          <div>
            <dt>Latest quest completion</dt>
            <dd>{formatDateTime(insights.freshness.latestQuest)}</dd>
          </div>
          <div>
            <dt>Latest push delivery</dt>
            <dd>{formatDateTime(insights.freshness.latestPush)}</dd>
          </div>
          <div>
            <dt>Latest subscription sync</dt>
            <dd>{formatDateTime(insights.freshness.latestSubscription)}</dd>
          </div>
          <div>
            <dt>Latest billing webhook</dt>
            <dd>{formatDateTime(insights.freshness.latestWebhook)}</dd>
          </div>
        </dl>
      </ConsolePanel>

      <div className="console-callout">
        <p className="font-medium text-graphite">Aggregate by design.</p>
        <p className="mt-1 text-caption leading-relaxed text-ash">
          Charts are computed inside the database and return counts only. They
          never return member IDs, prayer bodies, reflection bodies, journal
          drafts, or raw webhook payloads.
        </p>
      </div>
    </>
  );
}
