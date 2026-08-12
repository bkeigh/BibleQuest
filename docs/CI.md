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
| `Production build` | `pnpm build` | Blocks guest, configured-auth-contained, or configured-auth-enabled build failures; each matrix entry times out after 20 minutes. |
| `Native release export` | `pnpm build:native:release` | Blocks a failure in the deterministic, guest-only Capacitor export. |
| `iOS simulator build` | `pnpm ios:release:prepare`, `cap doctor`, `plutil`, and an unsigned Xcode Release build | Blocks native plugin, Apple configuration, generated payload, Swift package, and iOS compilation regressions. |
| `Browser smoke` | `pnpm test:e2e` | Builds the configured-but-contained release and verifies public privacy/framing plus onboarding landmarks in Chromium. |
| `Database policies` | `supabase start`, `supabase db reset`, `supabase test db --local` | Applies every migration and seed to an ephemeral local stack, then blocks schema or RLS acceptance failures without remote credentials. |
| `Dependency risk` | `pnpm audit`, then `pnpm audit --audit-level high` | Reports advisories across runtime and build tooling. High and critical advisories block CI; lower advisories stay visible for triage. |

The workflow has only `contents: read` permission. Checkout credentials are not
persisted, actions are pinned to reviewed commit SHAs, and no artifacts or logs
are published.

## Account-enabled US release gate

The account-enabled United States package remains separate from the required
guest CI jobs above. Its gate logic and negative fixtures run inside
`pnpm test`; an actual account artifact is checked at release freeze with
`pnpm check:ios:account-us-release` and a restricted, non-secret owner
attestation. See
[`IOS_US_ACCOUNT_RELEASE_COMPLIANCE.md`](IOS_US_ACCOUNT_RELEASE_COMPLIANCE.md).
Do not add production credentials or reviewer mailbox access to CI merely to
turn that manual evidence gate green.

Xcode Cloud defaults to the guest profile. The separate account-US workflow
must set `BIBLEQUEST_IOS_BUILD_PROFILE=account-us` and provide only the
fingerprint-matched `BIBLEQUEST_IOS_ACCOUNT_US_PUBLISHABLE_KEY` as a secret.
Its post-clone script builds the production account payload and selects the
account privacy manifest before Xcode compiles the signed bundle.

## Branch protection

In the GitHub ruleset or branch protection rule for `main`:

1. Require a pull request before merging.
2. Require every status check listed above to pass, including every
   `Production build` matrix entry.
3. Require branches to be up to date before merging so the production build is
   tested against the latest `main`.
4. Prevent force pushes and branch deletion. Keep bypass access limited to the
   smallest trusted maintainer group.

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

Before enabling the account-US build, dry-run its exact production packets:

```bash
pnpm check:production:ios-account-release
```

The guarded runner accepts only the reviewed production history, exact source
hashes, a completed physical backup no older than 30 hours, and exactly the
two expected migrations. Never repair migration history or use `--include-all`
to bypass this lane.
