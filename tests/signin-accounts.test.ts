import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SigninAccountsError,
  listSigninAccounts,
} from "@/lib/observability/signin-accounts.server";
import { createAdminSupabase } from "@/lib/supabase/admin.server";

vi.mock("@/lib/supabase/admin.server", () => ({
  createAdminSupabase: vi.fn(),
}));

const admin = vi.mocked(createAdminSupabase);

/** Stands in for the admin client, recording which function was called. */
function stubRpc(result: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn(async () => result);
  admin.mockReturnValue({ rpc } as never);
  return rpc;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("listSigninAccounts", () => {
  it("reads the counts over PostgREST, never GoTrue's admin API", async () => {
    // The admin API answers 403 at the edge from production with an HTML
    // block page, whatever header shape the secret key travels in. PostgREST
    // from the same egress works, so this is the channel — a fetch to
    // /auth/v1/admin here would be the regression.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const rpc = stubRpc({
      data: [
        { created_at: "2026-08-01T00:00:00.000Z", last_sign_in_at: null },
        {
          created_at: "2026-08-02T00:00:00.000Z",
          last_sign_in_at: "2026-08-03T00:00:00.000Z",
        },
      ],
    });

    const accounts = await listSigninAccounts();

    expect(rpc).toHaveBeenCalledWith("signin_health_accounts");
    expect(fetchSpy, "no direct HTTP call belongs here now").not.toHaveBeenCalled();
    expect(accounts).toEqual([
      { created_at: "2026-08-01T00:00:00.000Z", last_sign_in_at: null },
      {
        created_at: "2026-08-02T00:00:00.000Z",
        last_sign_in_at: "2026-08-03T00:00:00.000Z",
      },
    ]);
  });

  it("keeps only the two fields it needs, so identities cannot travel", async () => {
    stubRpc({
      data: [
        {
          created_at: "2026-08-01T00:00:00.000Z",
          last_sign_in_at: null,
          // The function does not select these, but the boundary should hold
          // even if someone widens it later.
          id: "identifier",
          email: "person@example.com",
        },
      ],
    });

    const accounts = await listSigninAccounts();

    expect(JSON.stringify(accounts)).not.toMatch(
      /person@example\.com|identifier/,
    );
    expect(Object.keys(accounts[0]).sort()).toEqual([
      "created_at",
      "last_sign_in_at",
    ]);
  });

  it("names why it failed rather than reporting unknown", async () => {
    for (const [code, reason] of [
      ["42501", "permission"],
      ["42883", "permission"],
      ["PGRST301", "auth"],
      ["XX000", "provider"],
    ] as const) {
      stubRpc({ error: { code, message: "nope" } });
      await expect(listSigninAccounts(), code).rejects.toMatchObject({ reason });
    }
  });

  it("records the upstream code without echoing a credential", async () => {
    const logged: string[] = [];
    vi.spyOn(console, "error").mockImplementation(
      (line: unknown) => void logged.push(String(line)),
    );
    stubRpc({ error: { code: "42501", message: "permission denied" } });

    await expect(listSigninAccounts()).rejects.toBeInstanceOf(
      SigninAccountsError,
    );

    const line = logged.find((l) => l.includes("signin_accounts_failure"));
    expect(line, "the failure must describe itself").toBeDefined();
    expect(line).toContain("42501");
    expect(line).toContain("permission");
  });

  it("reports missing configuration instead of calling out with nothing", async () => {
    const rpc = vi.fn();
    admin.mockImplementation(() => {
      throw new Error("Supabase admin configuration unavailable.");
    });

    await expect(listSigninAccounts()).rejects.toMatchObject({
      reason: "configuration",
    });
    expect(rpc, "no request may leave without a key").not.toHaveBeenCalled();
  });

  it("treats a non-array payload as a provider fault, not an empty roster", async () => {
    // An empty array is a real answer ("no accounts"); null is the database
    // failing to answer. Reporting the second as the first would let the
    // monitor announce all-clear while it is blind — the exact shape of every
    // auth failure this project has had.
    stubRpc({ data: null });
    await expect(listSigninAccounts()).rejects.toMatchObject({
      reason: "provider",
    });
  });
});
