import {
  ConsoleMetric,
  ConsolePageHeader,
  ConsolePanel,
  ConsoleSourceNotice,
  ConsoleStatus,
} from "@/components/console/ConsolePrimitives";
import { loadConsoleOverview } from "@/lib/console/data.server";
import { formatCount, formatUsd, statusTone } from "@/lib/console/format";

export const dynamic = "force-dynamic";

/** Keeps the operator dateline current in BibleQuest's launch timezone. */
function consoleDateline() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  })
    .format(new Date())
    .toUpperCase();
}

/** Summarizes mission, revenue, content, and reliability in one first viewport. */
export default async function ConsoleTodayPage() {
  const overview = await loadConsoleOverview();
  const release = overview.release;
  const releaseReady =
    release.status === "ok" &&
    release.canonical_origin_matches &&
    release.auth_posture !== "invalid" &&
    release.billing_mode !== "invalid";
  const attention = [
    !releaseReady
      ? {
          label: "Release posture needs review",
          detail: "One or more launch contracts are not healthy.",
          tone: "danger" as const,
        }
      : null,
    overview.metrics.pushFailures24h &&
    overview.metrics.pushFailures24h > 0
      ? {
          label: `${formatCount(overview.metrics.pushFailures24h)} push failures`,
          detail: "Transient or permanent failures recorded in the last 24 hours.",
          tone: "warning" as const,
        }
      : null,
    overview.metrics.webhookFailures24h &&
    overview.metrics.webhookFailures24h > 0
      ? {
          label: `${formatCount(overview.metrics.webhookFailures24h)} webhook failures`,
          detail: "Failed Stripe events recorded in the last 24 hours.",
          tone: "danger" as const,
        }
      : null,
    overview.source.status === "degraded"
      ? {
          label: "Operator data is partial",
          detail: overview.source.label,
          tone: "warning" as const,
        }
      : null,
  ].filter((item) => item !== null);

  return (
    <>
      <ConsolePageHeader
        eyebrow={consoleDateline()}
        title="Today at BibleQuest"
        description="A quiet operating view of the product: enough signal to act, without turning private faith into surveillance."
        actions={
          <ConsoleStatus tone={releaseReady ? "good" : "danger"}>
            {releaseReady ? "Release healthy" : "Review release"}
          </ConsoleStatus>
        }
      />

      <ConsoleSourceNotice source={overview.source} />

      <section className="console-metric-grid" aria-label="Product metrics">
        <ConsoleMetric
          label="ACCOUNTS"
          value={formatCount(overview.metrics.accounts)}
          detail={`${formatCount(overview.metrics.onboardedAccounts)} completed onboarding`}
        />
        <ConsoleMetric
          label="QUESTS · 7 DAYS"
          value={formatCount(overview.metrics.questCompletions7d)}
          detail="Completed steps of faith, aggregate only"
          tone="good"
        />
        <ConsoleMetric
          label="ACTIVE PLUS"
          value={formatCount(overview.metrics.activePlus)}
          detail="Active or trialing subscriptions"
        />
        <ConsoleMetric
          label="SUPPORT · 30 DAYS"
          value={formatUsd(overview.metrics.supportCents30d)}
          detail="Net one-time support after refunds"
        />
        <ConsoleMetric
          label="PUSH FAILURES · 24H"
          value={formatCount(overview.metrics.pushFailures24h)}
          detail="Transient and permanent delivery failures"
          tone={
            overview.metrics.pushFailures24h &&
            overview.metrics.pushFailures24h > 0
              ? "warning"
              : "default"
          }
        />
        <ConsoleMetric
          label="CONTENT"
          value={formatCount(overview.content.quests)}
          detail={`${overview.content.dailyVerses} passages · ${overview.content.sensitiveQuests} sensitive quests`}
        />
      </section>

      <ConsolePanel
        title="Needs attention"
        description="A short queue of current operational signals, not a stream of noise."
      >
        {attention.length === 0 ? (
          <div className="console-attention-clear">
            <ConsoleStatus tone="good">No active signals</ConsoleStatus>
            <p>Release, delivery, billing webhook, and data-source checks are calm.</p>
          </div>
        ) : (
          <ul className="console-attention-list">
            {attention.map((item) => (
              <li key={item.label}>
                <ConsoleStatus tone={item.tone}>{item.label}</ConsoleStatus>
                <p>{item.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </ConsolePanel>

      <div className="console-two-column">
        <ConsolePanel
          title="Release posture"
          description="Bounded fields from the public health contract."
        >
          <dl className="console-definition-list">
            <div>
              <dt>Application</dt>
              <dd>
                <ConsoleStatus tone="good">{release.status}</ConsoleStatus>
              </dd>
            </div>
            <div>
              <dt>Account sync</dt>
              <dd>
                <ConsoleStatus tone={statusTone(release.auth_posture)}>
                  {release.auth_posture}
                </ConsoleStatus>
              </dd>
            </div>
            <div>
              <dt>Billing</dt>
              <dd>
                <ConsoleStatus tone={statusTone(release.billing_mode)}>
                  {release.billing_mode}
                </ConsoleStatus>
              </dd>
            </div>
            <div>
              <dt>Service worker</dt>
              <dd className="font-mono text-caption">
                {release.service_worker_version}
              </dd>
            </div>
          </dl>
        </ConsolePanel>

        <ConsolePanel
          title="Content stewardship"
          description="The reviewed catalogue currently shipped with BibleQuest."
        >
          <dl className="console-definition-list">
            <div>
              <dt>Quest templates</dt>
              <dd>{overview.content.quests}</dd>
            </div>
            <div>
              <dt>Daily passages</dt>
              <dd>{overview.content.dailyVerses}</dd>
            </div>
            <div>
              <dt>Prayer prompts</dt>
              <dd>{overview.content.prayerPrompts}</dd>
            </div>
            <div>
              <dt>Reflection prompts</dt>
              <dd>{overview.content.reflectionPrompts}</dd>
            </div>
            <div>
              <dt>Milestones</dt>
              <dd>{overview.content.milestones}</dd>
            </div>
          </dl>
        </ConsolePanel>
      </div>
    </>
  );
}
