# Continuous integration

The `CI` GitHub Actions workflow runs for pull requests targeting `main` and
for pushes to `main`. Superseded runs on the same pull request or ref are
cancelled.

CI uses Node.js 24 and the exact pnpm version declared in `package.json`. Every
job installs from `pnpm-lock.yaml` with `pnpm install --frozen-lockfile`; no job
receives application secrets or production credentials. BibleQuest builds in
guest mode with analytics, payments, and Supabase integrations disabled.

## Required checks

| Check | Commands | Policy |
| --- | --- | --- |
| `Quality` | `pnpm lint`, `pnpm check:seed`, `git diff --check` over the event changes and working tree | Blocks lint, stale generated Console content, and whitespace errors. |
| `Types and tests` | `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm test:launch-evidence` | Blocks type/test failures and verifies the sanitized evidence command plus alert thresholds with fixtures. Tests run noninteractively. |
| `Production build` | `pnpm build` | Blocks a guest-mode production build failure; times out after 20 minutes. |
| `Dependency risk` | `pnpm audit --prod`, then `pnpm audit --prod --audit-level high` | Reports every production advisory. High and critical advisories block CI; moderate advisories stay visible for triage without blocking. |

The workflow has only `contents: read` permission. Checkout credentials are not
persisted, actions are pinned to major versions, and no artifacts or logs are
published.

## Branch protection

In the GitHub ruleset or branch protection rule for `main`:

1. Require a pull request before merging.
2. Require the four status checks listed above to pass.
3. Require branches to be up to date before merging so the production build is
   tested against the latest `main`.
4. Prevent force pushes and branch deletion. Keep bypass access limited to the
   smallest trusted maintainer group.

These repository settings are intentionally manual and are not changed by the
workflow.

## Migration validation

Database migration validation is deferred. The repository does not currently
include a credential-free local Supabase CI harness. A later protected job
should start an ephemeral local Supabase stack, apply every numbered migration
from a clean database, run schema and RLS checks, and tear the stack down. It
must never connect to a remote database or receive production credentials. Add
that job as a required check only after it is deterministic and credential-free.

Until then, the database owner must run the clean local reset, migration list,
schema lint, and RLS evidence procedure in
[`SUPABASE_SECURITY_ROLLOUT.md`](SUPABASE_SECURITY_ROLLOUT.md) at release
freeze. After an approved production reconciliation, run
`pnpm check:production-readiness`; it is a non-mutating compatibility probe that
requires both the `0015` daily CAS contract and the `0019` complete account
identity/generation/server-revision boundary contract, not proof of migration history, SMTP
delivery, or cross-account isolation.

The repository does include deterministic local acceptance files for the
immutable Journey identity and daily-quest CAS contracts:

```bash
supabase test db --local supabase/tests/0014_journey_event_identity.sql
supabase test db --local supabase/tests/0015_daily_quest_cas.sql
supabase test db --local supabase/tests/0016_mutable_account_sync_guards.sql
supabase test db --local supabase/tests/0017_mutable_account_sync_boundary.sql
supabase test db --local supabase/tests/0018_account_sync_generation.sql
supabase test db --local supabase/tests/0019_server_ordered_account_sync_revisions.sql
```

The migration contract test also pins the checked-in SHA-256 manifest. A hash
mismatch, a new `0013`, or a change to immutable `0014` is a hard failure even
when a column-level compatibility probe succeeds.

The production probe intentionally stays out of pull-request CI: CI receives no
production credentials, a transient provider incident must not block unrelated
code review, and production state is a release gate rather than a source-code
test. Record its sanitized pass/fail output in the restricted launch evidence.
