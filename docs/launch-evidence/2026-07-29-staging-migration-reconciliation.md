# Staging migration reconciliation — 2026-07-29

## Verdict

**PASS — STAGING ONLY.** The non-production BibleQuest staging database has
been reconciled to the frozen 31-file migration manifest with one guarded,
forward-only attestation. No migration-history row was repaired or invented,
no application schema or data was changed by the packet, and no production
migration was applied.

## Evidence identity

| Field | Value |
| --- | --- |
| Completed | 2026-07-29 07:09 EDT |
| Source baseline | `69e6189ef140895293c0667949fe4d9c8600ab35` plus the reconciliation files in this change |
| Target | Exact active `BibleQuest-Account-Sync-Staging` project |
| Frozen manifest | 31 SQL files, `0001`–`0012` and `0014`–`0032` |
| Manifest SHA-256 | `1c920b04e155ce593cea485f97a6bf1466a97a6df3750a4eb4bb635926802e28` |
| Forward packet | `20260729110000_reconcile_31_file_manifest.sql` |
| Packet SHA-256 | `571d5f09006c60c4475f74f168a0311525e39ba34a6dc5ffb7c466c54d2e29f4` |

Provider project identifiers, database connection strings, and credentials are
intentionally omitted.

## Reviewed history mapping

The exact staging prehistory contained 28 rows: every frozen version through
`0028`, with the intentional `0013` gap, followed by `0031`. Schema changes
from `0029`, `0030`, and `0032` existed from reviewed sandbox work but did not
have history rows.

The procedure did not backfill those three rows. Instead it:

1. Verified the checked-in manifest hash, exact 31 filenames, and every file
   checksum.
2. Built a clean shadow database from all 31 migrations and compared its
   `public` schema to staging. The diff was empty.
3. Required the exact reviewed 28-row prehistory.
4. Re-asserted the deployed `0029` row-size controls, `0030` operator Plus
   contract, `0031` full subscription uniqueness constraint, and `0032`
   Dispute-object prefix.
5. Required a dry run that proposed exactly the single higher-version packet.
6. Applied that assertion-only packet through normal Supabase migration
   bookkeeping.
7. Repeated the 31-file schema comparison and exact history check.

The posthistory contains 29 rows: the original 28 plus the forward attestation.
The absent `0029`, `0030`, and `0032` rows remain absent because that is the
truthful record of how staging reached the equivalent schema.

## Guard results

| Check | Result |
| --- | --- |
| Exact healthy staging target resolved | PASS |
| Staging target distinct from production | PASS |
| Exact 31-file manifest and all checksums | PASS |
| Clean 31-file build versus staging `public` schema | PASS; empty diff before and after apply |
| Exact reviewed 28-row prehistory | PASS |
| Dry-run proposal | PASS; one packet only |
| Packet SQL | PASS; assertions only, no application-schema or data mutation |
| Normal migration bookkeeping | PASS; forward packet recorded |
| Posthistory | PASS; 29 rows, ending at the forward attestation |
| Repository link after operation | PASS; remained on `BibleQuest`, not staging |
| History repair | NOT USED |
| Production apply | NOT PERFORMED |

## Failed-closed attempt

The first guarded push stopped before recording history because PostgreSQL
rejects schema-qualified `position(... in ...)` syntax. The staging history was
confirmed unchanged at 28 rows. The assertion was changed to the equivalent
`pg_catalog.strpos(...)`, the packet hash was repinned, local parsing and unit
guards passed, and a new real dry run completed before the successful apply.

## Commands

```bash
pnpm exec vitest run tests/staging-migration-reconciliation.test.ts
pnpm check:staging-migration-history
BIBLEQUEST_STAGING_MIGRATION_CONFIRM='apply staging 31-file reconciliation' \
  node scripts/reconcile-staging-migration-history.mjs --apply
pnpm check:staging-migration-history
```

The final read-only rerun returned `applied: true`, `proposed: []`,
`schema_diff_empty: true`, `posthistory_rows: 29`,
`production_apply: false`, and `history_repair: false`.

## Local verification

| Command | Result |
| --- | --- |
| Full Vitest suite | PASS; 90 files and 610 tests |
| `pnpm lint` | PASS |
| `pnpm exec tsc --noEmit` | PASS |
| `git diff --check` | PASS |
