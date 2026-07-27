import {
  ConsoleEmptyState,
  ConsolePageHeader,
  ConsolePanel,
  ConsoleSourceNotice,
  ConsoleStatus,
} from "@/components/console/ConsolePrimitives";
import { loadConsoleAccounts } from "@/lib/console/data.server";
import { formatDateTime, statusTone } from "@/lib/console/format";

interface AccountsPageProps {
  searchParams: Promise<{ q?: string }>;
}

export const dynamic = "force-dynamic";

/** Lists privacy-safe account diagnostics for support work. */
export default async function ConsoleAccountsPage({
  searchParams,
}: AccountsPageProps) {
  const [result, params] = await Promise.all([
    loadConsoleAccounts(),
    searchParams,
  ]);
  const query = params.q?.trim().toLowerCase().slice(0, 100) ?? "";
  const accounts = query
    ? result.accounts.filter((account) =>
        `${account.email} ${account.displayName}`.toLowerCase().includes(query),
      )
    : result.accounts;

  return (
    <>
      <ConsolePageHeader
        eyebrow="SUPPORT COCKPIT"
        title="Help without intruding."
        description="Account identity, onboarding, sync, and subscription posture. Prayer, reflection, bookmark, and journal content are intentionally absent."
      />

      <ConsoleSourceNotice source={result.source} />

      <form className="console-filter-bar" role="search">
        <label className="sr-only" htmlFor="account-search">
          Search accounts
        </label>
        <input
          id="account-search"
          name="q"
          type="search"
          defaultValue={params.q ?? ""}
          placeholder="Search exact email or display name"
          className="console-filter-input"
        />
        <button className="console-filter-button" type="submit">
          Search
        </button>
      </form>

      <ConsolePanel
        title={`${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`}
        description="Newest 50 authentication records. Read-only."
      >
        {accounts.length === 0 ? (
          <ConsoleEmptyState
            title={query ? "No matching account" : "No account records"}
            description={
              result.source.status === "setup_required"
                ? "Connect the server operator key to load bounded support diagnostics."
                : "Try an exact email or clear the search."
            }
          />
        ) : (
          <div className="console-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Created</th>
                  <th>Last sign-in</th>
                  <th>Onboarding</th>
                  <th>Sync</th>
                  <th>Plan</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.email}>
                    <td>
                      <p className="font-medium text-graphite">
                        {account.displayName}
                      </p>
                      <p className="mt-1 text-caption text-ash">
                        {account.email}
                      </p>
                    </td>
                    <td>{formatDateTime(account.createdAt)}</td>
                    <td>{formatDateTime(account.lastSignInAt)}</td>
                    <td>
                      <ConsoleStatus
                        tone={account.onboardingCompleted ? "good" : "warning"}
                      >
                        {account.onboardingCompleted ? "complete" : "pending"}
                      </ConsoleStatus>
                    </td>
                    <td>
                      {account.syncGeneration === null ? (
                        "—"
                      ) : (
                        <span className="font-mono text-caption">
                          generation {account.syncGeneration}
                        </span>
                      )}
                    </td>
                    <td>
                      <ConsoleStatus
                        tone={statusTone(account.subscriptionStatus)}
                      >
                        {account.subscriptionStatus}
                      </ConsoleStatus>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ConsolePanel>

      <div className="console-callout">
        <p className="font-medium text-graphite">No impersonation.</p>
        <p className="mt-1 text-caption leading-relaxed text-ash">
          Support uses bounded diagnostics and synthetic accounts. The console
          never opens a member’s private app session.
        </p>
      </div>
    </>
  );
}
