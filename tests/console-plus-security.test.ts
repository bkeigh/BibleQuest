import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/** Reads one checked-in entitlement boundary for static security assertions. */
function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("console Plus security boundary", () => {
  it("authenticates every Server Action and revalidates revoke identity", () => {
    const actions = source("src/app/console/(protected)/actions.ts");
    const server = source("src/lib/console/plus-grants.server.ts");
    expect(actions.match(/getConsoleAccess\(\)/g)).toHaveLength(4);
    expect(actions).toContain("grantOperatorPlusInput(formData)");
    expect(actions).toContain("revokeOperatorPlusInput(formData)");
    expect(actions).toContain("consoleAccountIdentityMatches(");
    expect(server).toContain("admin.auth.admin.getUserById(userId)");
    expect(server).toContain(
      "data.user.email?.trim().toLowerCase() === email.trim().toLowerCase()",
    );
  });

  it("keeps the rare revoke control collapsed under the grant workflow", () => {
    const accounts = source("src/app/console/(protected)/accounts/page.tsx");
    const controls = source(
      "src/components/console/ConsolePlusGrantControls.tsx",
    );
    expect(accounts).toContain(
      "<ConsolePlusGrantForm />\n        <ConsolePlusRevokeForm />",
    );
    expect(controls).toContain("<details");
    expect(controls).toContain("Use sparingly.");
    expect(controls).toContain("only for developer");
    expect(controls).not.toContain('name="userId"');
  });

  it("keeps successful entitlement and audit writes in each transaction", () => {
    const migration = source(
      "supabase/migrations/0030_operator_plus_grants.sql",
    );
    const grantStart = migration.indexOf(
      "create or replace function public.grant_operator_plus",
    );
    const revokeStart = migration.indexOf(
      "create or replace function public.revoke_operator_plus",
    );
    const contractStart = migration.indexOf(
      "create or replace function public.operator_plus_grant_contract",
    );
    const grant = migration.slice(grantStart, revokeStart);
    const revoke = migration.slice(revokeStart, contractStart);
    expect(grant).toContain("insert into public.operator_plus_grants");
    expect(grant).toContain("insert into public.console_audit_logs");
    expect(revoke).toContain("update public.operator_plus_grants");
    expect(revoke).toContain("insert into public.console_audit_logs");
    expect(grant).not.toContain("public.subscriptions");
    expect(revoke).not.toContain("public.subscriptions");
  });

  it("seals grant rows and mutation RPCs from both browser roles", () => {
    const migration = source(
      "supabase/migrations/0030_operator_plus_grants.sql",
    );
    expect(migration).toContain(
      "alter table public.operator_plus_grants force row level security",
    );
    expect(migration).toContain(
      "grant select on table public.operator_plus_grants to service_role",
    );
    expect(migration).toContain(
      ") from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "grant execute on function public.operator_plus_grant_contract()\n  to anon, authenticated, service_role;",
    );
    expect(migration).not.toContain(
      "grant select on table public.operator_plus_grants to authenticated",
    );
  });

  it("makes provider entitlement win while retaining a manual backup grant", () => {
    const billing = source("src/lib/billing/server.ts");
    expect(billing).toContain(
      'entitled\\n      ? ("stripe" as const)'.replace("\\n", "\n"),
    );
    expect(billing).toContain('? ("operator" as const)');
    expect(billing).toContain("const isPlus = Boolean(entitled || operatorGrant)");
  });
});
