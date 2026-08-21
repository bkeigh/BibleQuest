import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminSupabase: vi.fn(),
  getConsoleAccess: vi.fn(),
}));

// Replaces the operator session boundary so each loader can be tested directly.
vi.mock("@/lib/console/auth.server", () => ({
  getConsoleAccess: mocks.getConsoleAccess,
}));

// Prevents a failed access check from ever reaching a real privileged client.
vi.mock("@/lib/supabase/admin.server", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));

beforeEach(() => {
  mocks.createAdminSupabase.mockReset();
  mocks.getConsoleAccess.mockReset();
  mocks.getConsoleAccess.mockResolvedValue({ state: "unauthenticated" });
});

describe("console service-role access checks", () => {
  it("fails every console data loader closed before creating an admin client", async () => {
    const {
      loadConsoleAccounts,
      loadConsoleBilling,
      loadConsoleFlags,
      loadConsoleInsights,
      loadConsoleOverview,
    } = await import("@/lib/console/data.server");

    const [overview, insights, accounts, billing, flags] = await Promise.all([
      loadConsoleOverview(),
      loadConsoleInsights(7),
      loadConsoleAccounts(),
      loadConsoleBilling(),
      loadConsoleFlags(),
    ]);

    expect(mocks.getConsoleAccess).toHaveBeenCalledTimes(5);
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
    expect(overview.source.status).toBe("setup_required");
    expect(insights.source.status).toBe("setup_required");
    expect(accounts).toMatchObject({ accounts: [] });
    expect(billing).toMatchObject({
      subscriptions: [],
      supportPayments: [],
      webhooks: [],
    });
    expect(flags).toMatchObject({ flags: [] });
  });

  it("fails audit reads closed before creating an admin client", async () => {
    const { loadConsoleAuditLogs } = await import(
      "@/lib/console/audit.server"
    );

    const logs = await loadConsoleAuditLogs();

    expect(mocks.getConsoleAccess).toHaveBeenCalledOnce();
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
    expect(logs).toMatchObject({
      source: { status: "setup_required" },
      entries: [],
    });
  });

  it("fails every Plus read helper closed before creating an admin client", async () => {
    const {
      consoleAccountIdentityMatches,
      findConsoleAccountByEmail,
    } = await import("@/lib/console/plus-grants.server");
    const email = "friend@example.com";

    const [account, identityMatches] = await Promise.all([
      findConsoleAccountByEmail(email),
      consoleAccountIdentityMatches("account-id", email),
    ]);

    expect(mocks.getConsoleAccess).toHaveBeenCalledTimes(2);
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
    expect(account).toBeNull();
    expect(identityMatches).toBe(false);
  });
});
