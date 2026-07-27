import {
  ConsoleEmptyState,
  ConsoleMetric,
  ConsolePageHeader,
  ConsolePanel,
  ConsoleSourceNotice,
  ConsoleStatus,
} from "@/components/console/ConsolePrimitives";
import { formatAuditAction } from "@/lib/console/audit";
import { loadConsoleAuditLogs } from "@/lib/console/audit.server";
import { formatDateTime, statusTone } from "@/lib/console/format";

interface AuditPageProps {
  searchParams: Promise<{
    q?: string;
    action?: string;
    outcome?: string;
  }>;
}

export const dynamic = "force-dynamic";

/** Lists append-only operator events with bounded investigation filters. */
export default async function ConsoleAuditPage({
  searchParams,
}: AuditPageProps) {
  const [result, params] = await Promise.all([
    loadConsoleAuditLogs(),
    searchParams,
  ]);
  const query = params.q?.trim().toLowerCase().slice(0, 100) ?? "";
  const action = params.action?.slice(0, 96) ?? "";
  const outcome = ["succeeded", "denied", "failed"].includes(
    params.outcome ?? "",
  )
    ? params.outcome!
    : "";
  const actions = [...new Set(result.entries.map((entry) => entry.action))];
  const entries = result.entries.filter((entry) => {
    const matchesQuery =
      !query ||
      [
        entry.operatorEmail,
        entry.action,
        entry.targetType,
        entry.targetKey,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    return (
      matchesQuery &&
      (!action || entry.action === action) &&
      (!outcome || entry.outcome === outcome)
    );
  });
  const now = new Date(result.generatedAt).valueOf();
  const actions24h = result.entries.filter(
    (entry) => now - new Date(entry.createdAt).valueOf() <= 86_400_000,
  ).length;
  const failures7d = result.entries.filter(
    (entry) =>
      entry.outcome === "failed" &&
      now - new Date(entry.createdAt).valueOf() <= 7 * 86_400_000,
  ).length;
  const operators = new Set(
    result.entries.map((entry) => entry.operatorEmail),
  ).size;

  return (
    <>
      <ConsolePageHeader
        eyebrow="GOVERNANCE"
        title="Every operator action leaves a trail."
        description="Append-only records for console authentication and future support, billing, flag, and content mutations."
        actions={
          <ConsoleStatus
            tone={result.source.status === "live" ? "good" : "warning"}
          >
            {result.source.status === "live" ? "Append-only" : "Setup required"}
          </ConsoleStatus>
        }
      />

      <ConsoleSourceNotice source={result.source} />

      <section className="console-metric-grid" aria-label="Audit metrics">
        <ConsoleMetric
          label="ACTIONS · 24H"
          value={actions24h}
          detail="Verified operator events"
        />
        <ConsoleMetric
          label="FAILURES · 7 DAYS"
          value={failures7d}
          detail="Actions requiring investigation"
          tone={failures7d > 0 ? "warning" : "good"}
        />
        <ConsoleMetric
          label="OPERATORS"
          value={operators}
          detail="Distinct actors in the latest 100 records"
        />
      </section>

      <form className="console-filter-bar" role="search">
        <label className="sr-only" htmlFor="audit-search">
          Search audit records
        </label>
        <input
          id="audit-search"
          name="q"
          type="search"
          defaultValue={params.q ?? ""}
          placeholder="Search operator, action, or target"
          className="console-filter-input"
        />
        <label className="sr-only" htmlFor="audit-action">
          Filter by action
        </label>
        <select
          id="audit-action"
          name="action"
          defaultValue={action}
          className="console-filter-select"
        >
          <option value="">All actions</option>
          {actions.map((value) => (
            <option key={value} value={value}>
              {formatAuditAction(value)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="audit-outcome">
          Filter by outcome
        </label>
        <select
          id="audit-outcome"
          name="outcome"
          defaultValue={outcome}
          className="console-filter-select"
        >
          <option value="">All outcomes</option>
          <option value="succeeded">Succeeded</option>
          <option value="denied">Denied</option>
          <option value="failed">Failed</option>
        </select>
        <button className="console-filter-button" type="submit">
          Filter
        </button>
      </form>

      <ConsolePanel
        title={`${entries.length} ${entries.length === 1 ? "event" : "events"}`}
        description="Latest 100 records. Entries cannot be edited or deleted through the console."
      >
        {entries.length === 0 ? (
          <ConsoleEmptyState
            title={
              result.source.status === "live"
                ? "No matching audit events"
                : "Audit foundation not connected"
            }
            description={
              result.source.status === "live"
                ? "Clear the filters or perform a new operator sign-in."
                : "Apply the console audit database contract to begin recording events."
            }
          />
        ) : (
          <div className="console-table-wrap">
            <table className="console-table console-audit-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Operator</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Outcome</th>
                  <th>Context</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDateTime(entry.createdAt)}</td>
                    <td>{entry.operatorEmail}</td>
                    <td className="capitalize">
                      {formatAuditAction(entry.action)}
                    </td>
                    <td>
                      {entry.targetType
                        ? `${entry.targetType}${entry.targetKey ? ` · ${entry.targetKey}` : ""}`
                        : "—"}
                    </td>
                    <td>
                      <ConsoleStatus tone={statusTone(entry.outcome)}>
                        {entry.outcome}
                      </ConsoleStatus>
                    </td>
                    <td>
                      {Object.keys(entry.details).length === 0
                        ? "—"
                        : Object.entries(entry.details)
                            .map(([key, value]) => `${key}: ${String(value)}`)
                            .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ConsolePanel>

      <div className="console-callout">
        <p className="font-medium text-graphite">Mutation gate.</p>
        <p className="mt-1 text-caption leading-relaxed text-ash">
          Future operator actions must require a verified operator, a bounded
          target, a recorded outcome, and an audit event. Destructive actions
          will also require an explicit reason and confirmation.
        </p>
      </div>
    </>
  );
}
