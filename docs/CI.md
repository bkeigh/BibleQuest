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
| `Quality` | `pnpm lint`, `git diff --check` over the event changes and working tree | Blocks lint and whitespace errors. |
| `Types and tests` | `pnpm exec tsc --noEmit`, `pnpm test` | Blocks type errors and test failures. Tests run noninteractively. |
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
