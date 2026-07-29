import {
  ConsoleEmptyState,
  ConsolePageHeader,
  ConsolePanel,
  ConsoleSourceNotice,
  ConsoleStatus,
} from "@/components/console/ConsolePrimitives";
import {
  ConsolePlusGrantForm,
  ConsolePlusRevokeForm,
} from "@/components/console/ConsolePlusGrantControls";
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
  const params = await searchParams;
  const query = params.q?.trim().toLowerCase().slice(0, 100) ?? "";
  const result = await loadConsoleAccounts(query);
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

      <ConsolePanel
        title="Grant BibleQuest Plus"
        description="Adds a separate manual entitlement. It never creates, edits, or cancels a Stripe subscription."
      >
        <ConsolePlusGrantForm />
        <ConsolePlusRevokeForm />
      </ConsolePanel>

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
        description="Newest 50 accounts, or one exact email match from the bounded auth directory."
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
                  <th>Manual access</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
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
                      <p className="mt-1 text-caption capitalize text-ash">
                        {account.entitlementSource === "free"
                          ? "No Plus entitlement"
                          : `${account.entitlementSource} entitlement`}
                      </p>
                    </td>
                    <td>
                      {account.manualGrant ? (
                        <div className="console-manual-grant">
                          <ConsoleStatus
                            tone={
                              account.manualGrant.active ? "good" : "neutral"
                            }
                          >
                            {account.manualGrant.active ? "active" : "expired"}
                          </ConsoleStatus>
                          <p className="mt-2 text-caption text-ash">
                            {account.manualGrant.duration === "lifetime"
                              ? "Lifetime"
                              : account.manualGrant.duration}
                            {account.manualGrant.expiresAt
                              ? ` · ${formatDateTime(account.manualGrant.expiresAt)}`
                              : ""}
                          </p>
                        </div>
                      ) : (
                        "—"
                      )}
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
          never opens a member’s private app session. Granting or revoking
          manual Plus requires an exact email confirmation and writes an
          append-only audit event.
        </p>
      </div>
    </>
  );
}
