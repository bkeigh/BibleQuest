import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "0033_guided_pilgrimage_progress.sql",
  ),
  "utf8",
);
const twoUserProof = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "tests",
    "0033_guided_progress.sql",
  ),
  "utf8",
);
// The release gate must require the same migration contract as the client.
const productionReadiness = readFileSync(
  join(process.cwd(), "scripts", "check-production-readiness.mjs"),
  "utf8",
);

describe("guided progress database boundary", () => {
  it("pins owner RLS, append-only grants, generation binding, and purge", () => {
    expect(migration).toContain(
      "alter table public.user_guided_movements force row level security",
    );
    expect(migration).toContain(
      "grant select, insert on table public.user_guided_movements to authenticated",
    );
    expect(migration).toContain(
      "before insert or delete on public.user_guided_movements",
    );
    expect(migration).toContain(
      "for each row execute function public.enforce_user_sync_generation()",
    );
    expect(migration).toContain(
      "delete from public.user_guided_movements",
    );
    expect(migration).not.toMatch(
      /grant\s+(?:all|update|delete).*user_guided_movements\s+to authenticated/i,
    );
  });

  it("checks two-owner isolation, stale writes, and owner-only purge in SQL", () => {
    expect(twoUserProof).toContain("owner A cannot read owner B progress");
    expect(twoUserProof).toContain(
      "owner A cannot append progress for owner B",
    );
    expect(twoUserProof).toContain("a stale account generation fails closed");
    expect(twoUserProof).toContain("purge preserves owner B guided progress");
  });

  it("requires the current schema contract before production can be declared ready", () => {
    expect(productionReadiness).toContain(
      'candidate.schema_contract !== "0036"',
    );
    expect(productionReadiness).toContain(
      'table: "user_guided_movements"',
    );
    expect(productionReadiness).toContain(
      'rpc: "guided_progress_sync_contract"',
    );
    expect(productionReadiness).toContain(
      'contract: "biblequest_guided_progress_sync_v1"',
    );
  });
});
