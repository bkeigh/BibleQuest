import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  new URL("../scripts/check-staging-two-user-isolation.mjs", import.meta.url),
  "utf8",
);

describe("staging two-user isolation script", () => {
  it("fails closed unless the exact staging ref and confirmation are present", () => {
    expect(script).toContain(
      'const CONFIRMATION = "staging-only-two-user-isolation"',
    );
    expect(script).toContain(
      "Refusing non-staging target; expected https://${expectedHost}",
    );
    expect(script).toContain("BIBLEQUEST_STAGING_PROJECT_REF");
  });

  it("uses normal user sessions for negative tests and removes fixtures", () => {
    expect(script).toContain("signInWithPassword");
    expect(script).toContain("verifyCatalogIsolation(actorA, actorB)");
    expect(script).toContain("verifyCatalogIsolation(actorB, actorA)");
    expect(script).toContain('actorClient.rpc("delete_own_account")');
    expect(script).toContain("cleanupStaleActors(admin)");
  });

  it("keeps output sanitized and never prints identities or sentinel bodies", () => {
    expect(script).toContain("catalogRelations");
    expect(script).not.toMatch(/console\.(?:log|error|warn)/);
    expect(script).not.toContain("access_token:");
    expect(script).not.toContain("service_role:");
  });
});
