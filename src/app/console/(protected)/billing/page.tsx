import {
  ConsoleEmptyState,
  ConsolePageHeader,
  ConsolePanel,
  ConsoleSourceNotice,
  ConsoleStatus,
} from "@/components/console/ConsolePrimitives";
import { loadConsoleBilling } from "@/lib/console/data.server";
import { formatDateTime, formatUsd, statusTone } from "@/lib/console/format";

export const dynamic = "force-dynamic";

/** Presents recent subscription, contribution, and webhook posture read-only. */
export default async function ConsoleBillingPage() {
  const billing = await loadConsoleBilling();

  return (
    <>
      <ConsolePageHeader
        eyebrow="BILLING OPERATIONS"
        title="Money needs a clear trail."
        description="Server-authoritative subscription and one-time support posture, separated from the free spiritual experience."
      />

      <ConsoleSourceNotice source={billing.source} />

      <ConsolePanel
        title="Subscriptions"
        description="Recent Plus projections; provider identifiers stay hidden."
      >
        {billing.subscriptions.length === 0 ? (
          <ConsoleEmptyState
            title="No subscription records"
            description="This is expected while billing is coming soon or operator data is not connected."
          />
        ) : (
          <div className="console-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>Ownership</th>
                  <th>Provider</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Interval</th>
                  <th>Period end</th>
                  <th>Synced</th>
                </tr>
              </thead>
              <tbody>
                {billing.subscriptions.map((subscription, index) => (
                  <tr
                    key={`${subscription.accountLabel}-${subscription.synchronizedAt}-${index}`}
                  >
                    <td>{subscription.accountLabel}</td>
                    <td className="capitalize">{subscription.provider}</td>
                    <td className="capitalize">{subscription.plan}</td>
                    <td>
                      <ConsoleStatus tone={statusTone(subscription.status)}>
                        {subscription.status}
                      </ConsoleStatus>
                    </td>
                    <td className="capitalize">{subscription.interval}</td>
                    <td>{formatDateTime(subscription.periodEnd)}</td>
                    <td>{formatDateTime(subscription.synchronizedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ConsolePanel>

      <div className="console-two-column">
        <ConsolePanel
          title="One-time support"
          description="Latest contributions, net of recorded refunds."
        >
          {billing.supportPayments.length === 0 ? (
            <ConsoleEmptyState
              title="No support payments"
              description="No contribution records are available."
            />
          ) : (
            <div className="divide-y divide-mist">
              {billing.supportPayments.slice(0, 12).map((payment, index) => (
                <article
                  key={`${payment.createdAt}-${index}`}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium text-graphite">
                      {formatUsd(payment.amountCents - payment.refundedCents)}
                    </p>
                    <p className="mt-1 text-caption text-ash">
                      {payment.authenticated ? "Account linked" : "Guest"} ·{" "}
                      {formatDateTime(payment.createdAt)}
                    </p>
                  </div>
                  <ConsoleStatus tone={statusTone(payment.outcome)}>
                    {payment.outcome}
                  </ConsoleStatus>
                </article>
              ))}
            </div>
          )}
        </ConsolePanel>

        <ConsolePanel
          title="Webhook inbox"
          description="Processing posture without raw event payloads."
        >
          {billing.webhooks.length === 0 ? (
            <ConsoleEmptyState
              title="No webhook records"
              description="No recent Stripe events are available."
            />
          ) : (
            <div className="divide-y divide-mist">
              {billing.webhooks.slice(0, 12).map((webhook, index) => (
                <article
                  key={`${webhook.type}-${webhook.createdAt}-${index}`}
                  className="py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-caption text-graphite">
                        {webhook.type}
                      </p>
                      <p className="mt-1 text-caption text-ash">
                        {formatDateTime(webhook.createdAt)} ·{" "}
                        {webhook.attempts} attempt
                        {webhook.attempts === 1 ? "" : "s"}
                      </p>
                    </div>
                    <ConsoleStatus tone={statusTone(webhook.status)}>
                      {webhook.status}
                    </ConsoleStatus>
                  </div>
                  {webhook.category ? (
                    <p className="mt-2 text-caption text-rose-700">
                      Category: {webhook.category}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </ConsolePanel>
      </div>
    </>
  );
}
