# Daily synthetic health

The `Daily synthetic health` GitHub Action runs at 11:23 UTC every day and on
manual dispatch. It performs only read-only requests. It never creates users,
content, subscriptions, checkout sessions, or payments.

## Coverage

The monitor checks the apex redirect, canonical metadata, bounded public health
contract, public home page, app bootstrap, web manifest, service worker, up to
three same-origin static assets, one anonymous public-content row, and the
Supabase email/Google/phone provider posture. It also checks aggregate Vercel
runtime 5xx events when all three optional Vercel monitor secrets are present.

Each request has a five-second timeout and one retry for network, timeout,
rate-limit, or 5xx failures. Response bodies are used only for allowlisted
contract validation and are discarded. The archived JSON and Markdown contain
only check IDs, HTTP status, latency, attempt count, fixed outcome categories,
and a validated release SHA.

## Configuration

Add these GitHub Actions secrets:

- `BIBLEQUEST_MONITOR_SUPABASE_URL`
- `BIBLEQUEST_MONITOR_SUPABASE_ANON_KEY`

Set the repository variable `BIBLEQUEST_MONITOR_EXPECTED_SHA` to the exact
approved production commit after deployment. Also pin the deployed release
contracts with repository variables:

- `BIBLEQUEST_MONITOR_EXPECTED_SCHEMA_CONTRACT`
- `BIBLEQUEST_MONITOR_EXPECTED_CONTENT_CONTRACT`
- `BIBLEQUEST_MONITOR_EXPECTED_SERVICE_WORKER_VERSION`

These values deliberately follow the live customer deployment, not the newer
checkout on `main`. Update them in the same promotion checkpoint as the
expected SHA. When absent, the monitor falls back to the checkout's
`config/observability.json` values. The workflow pins expected auth to
`configured` and billing to `coming-soon`; change those only in a reviewed
release that intentionally changes posture.

Optional Vercel inspection requires all three secrets:

- `BIBLEQUEST_MONITOR_VERCEL_PROJECT_ID`
- `BIBLEQUEST_MONITOR_VERCEL_TEAM_ID`
- `BIBLEQUEST_MONITOR_VERCEL_TOKEN`

Use a narrow, expiring token. The monitor reduces deployment events to a count
and never archives event text, request paths, hosts, user agents, or response
bodies.

## Alert ownership

The repository owner must name a primary and backup monitoring owner before
enabling the schedule. Until names are recorded in the launch evidence packet,
the maintainer on call for `bkeigh/BibleQuest` owns the deduplicated issue titled
`Daily synthetic health failure`. Payment, auth, or privacy failures also route
to the corresponding launch owner and block release.

One marker-bound issue is created on first failure. Later failures replace that
issue body instead of creating issue spam. A passing run comments with the
recovery timestamp and closes the issue.

## Commands

Run fixture proof:

```bash
pnpm test:synthetic-health
```

Run the read-only monitor locally with approved values already stored in
ignored `.env.local`:

```bash
pnpm synthetic:health
```

Manually rerun in GitHub:

```bash
gh workflow run daily-synthetic-health.yml
gh run watch
```

After fixing an incident, rerun the workflow. Do not close the issue by hand
before a passing report; the recovery run closes it. Reports are retained for
14 days. If the workflow itself cannot write the report or issue, inspect the
Actions permissions and secrets, then rerun—never paste credentials into an
issue or chat.

## Rollback

Disable the workflow schedule or move the file out of the default branch. The
manual command remains usable. Monitoring has no database write path and needs
no application rollback.
