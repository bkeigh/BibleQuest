# Continuous integration

The `CI` GitHub Actions workflow runs for pull requests targeting `main` and
for pushes to `main`. Superseded runs on the same pull request or ref are
cancelled.

CI uses Node.js 24 and the exact pnpm version declared in `package.json`. Every
job installs from `pnpm-lock.yaml` with `pnpm install --frozen-lockfile`; no job
receives application secrets or production credentials. The build matrix uses
fake browser-safe configuration to exercise guest, contained-account, and
enabled-account bundles while analytics and payments remain disabled.

## Release lanes and protected aggregate

The branch-protected `Quality` context is the final aggregate. It stays pending
until every in-repository lane below completes and fails closed when any lane
fails, is cancelled, or is skipped. This keeps the established protected
context from becoming green before native, browser, or database evidence is
available. CodeQL, deployment-provider, and isolated Preview checks are
separate external release gates and are not implied by this aggregate.

| Check | Commands | Policy |
| --- | --- | --- |
| `Source quality` | `pnpm lint`, `pnpm check:seed`, `git diff --check` over the event changes and working tree | Blocks lint, stale generated Console content, and whitespace errors. |
| `Types and tests` | `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm test:launch-evidence` | Blocks type/test failures and verifies the sanitized evidence command plus alert thresholds with fixtures. Tests run noninteractively. |
| `Production build` | `pnpm build` | Blocks guest, configured-auth-contained, or configured-auth-enabled build failures; each matrix entry times out after 20 minutes. |
| `Native release export` | `pnpm build:native:release` | Blocks a failure in the deterministic, guest-only Capacitor export. |
| `iOS simulator build` | `pnpm ios:release:prepare`, `cap doctor`, `plutil`, and an unsigned Xcode Release build | Blocks native plugin, Apple configuration, generated payload, Swift package, and iOS compilation regressions. |
| `Browser smoke` | `pnpm test:e2e` | Builds the configured-but-contained release and verifies public privacy/framing plus onboarding landmarks in Chromium. |
| `Database policies` | `supabase start`, `supabase db reset`, `supabase test db --local` | Applies every migration and seed to an ephemeral local stack, then blocks schema or RLS acceptance failures without remote credentials. |
| `Dependency risk` | `pnpm audit`, then `pnpm audit --audit-level high` | Reports advisories across runtime and build tooling. High and critical advisories block CI; lower advisories stay visible for triage. |
| `Quality` | Aggregate only | Blocks unless every preceding in-repository lane succeeds. |

The workflow has only `contents: read` permission. Checkout credentials are not
persisted, actions are pinned to reviewed commit SHAs, and no artifacts or logs
are published.

## Branch protection

In the GitHub ruleset or branch protection rule for `main`:

1. Require a pull request before merging.
2. Require the final `Quality` context. Keep direct requirements for individual
   lanes when already configured as defense in depth; the aggregate itself
   requires every `Production build` matrix entry and every other lane above.
3. Require branches to be up to date before merging so the production build is
   tested against the latest `main`.
4. Prevent force pushes and branch deletion. Keep bypass access limited to the
   smallest trusted maintainer group.

Before merge, separately require and inspect CodeQL, the isolated Supabase and
Vercel Preview identities, and any other provider-owned release check. The
workflow cannot aggregate statuses owned by separate workflows or providers.

These repository settings are intentionally manual and are not changed by the
workflow.

## Migration validation

The `Database policies` job starts an ephemeral Docker-backed Supabase stack,
applies every numbered migration and the checked-in seed from a clean database,
runs all pgTAP acceptance files under `supabase/tests`, and always tears the
stack down. It has no application secrets, remote project reference, or
production credentials. The Supabase setup action and CLI version are both
pinned.

The database owner must still complete the remote reconciliation and two-user
isolation procedure in [`SUPABASE_SECURITY_ROLLOUT.md`](SUPABASE_SECURITY_ROLLOUT.md)
at release freeze. `pnpm check:production-readiness` is a read-only compatibility
probe, not proof of migration history, SMTP delivery, or cross-account
isolation.

The repository does include deterministic local acceptance files for the
immutable Journey identity and daily-quest CAS contracts:

```bash
supabase test db --local supabase/tests/0014_journey_event_identity.sql
supabase test db --local supabase/tests/0015_daily_quest_cas.sql
```

The migration contract test also pins the checked-in SHA-256 manifest. A hash
mismatch, a new `0013`, or a change to immutable `0014` is a hard failure even
when a column-level compatibility probe succeeds.

The production probe intentionally stays out of pull-request CI: CI receives no
production credentials, a transient provider incident must not block unrelated
code review, and production state is a release gate rather than a source-code
test. Record its sanitized pass/fail output in the restricted launch evidence.
