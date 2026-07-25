# Privacy-safe launch observability

BibleQuest records a narrow operational signal because clean server logs do not
prove that browser authentication, Journey sync, or a service-worker upgrade
worked. This foundation adds no database, user/session identifier, fingerprint,
arbitrary URL, request query, or free-form error message.

It does not replace product analytics. Plausible remains consent-gated under
[`ANALYTICS.md`](ANALYTICS.md); operational signals are required reliability
evidence and contain only fixed enums.

## Public health contract

`GET /api/health` is public and `no-store`. It reports only:

- external status and contract version;
- deployed Git SHA and explicitly approved rollback SHA, each only when exactly
  40 hexadecimal characters;
- the fixed canonical origin and whether `NEXT_PUBLIC_APP_URL` matches it;
- `configured`, `guest-only`, or `invalid` auth posture without a host or key;
- schema/content contract labels (`0015` and `seed-manifest-v1`);
- the checked-in service-worker version;
- `coming-soon`, `sandbox`, `live`, or `invalid` billing posture without a key.

`BIBLEQUEST_ROLLBACK_SHA` is a server-only deployment variable. Set it only to
the reviewed, database-compatible rollback commit after the rollback authority
approves that target. This repository change does not set it in Vercel.
The deploy owner must also verify that Vercel's system environment variables are
enabled so `VERCEL_GIT_COMMIT_SHA` reaches the deployment; a missing SHA is a
hard hold and this repository does not change that project setting.

## Browser signal contract

The browser posts to the fixed same-origin
`/api/observability/client` route with `credentials: omit` and
`Referrer-Policy: no-referrer`. The endpoint accepts only these fields:

| Field | Values |
| --- | --- |
| `surface` | `auth`, `sync`, `service_worker` |
| `stage` | bounded stages for that surface: session/request/callback, initial/push, or registration |
| `outcome` | `success`, `failure` |
| `category` | `ok` or a bounded safe failure category such as `offline`, `timeout`, `rate_limited`, `schema`, `conflict`, `provider`, `permission`, `server`, or `unknown` |
| `service_worker_version` | bounded `biblequest-vN` value, only after a successful worker version challenge; evidence compares it with the checked-in version |

Unexpected keys or values reject the entire request. The server reconstructs
the accepted object before `console.info`; it never logs the submitted object,
headers, error text, pathname, or referrer. Failed sends use a 20-item local
queue containing only the reconstructed enums. It is revalidated before every
write and flush, then removed after delivery.

Never add prayer, reflection, note, or Scripture text; a person’s name or email;
tokens, cookies, user/record/request/deployment IDs; query strings; routes; or
URLs to this schema. A new field requires privacy review and deterministic
redaction tests first.

## One evidence command

Use the same command at every required checkpoint:

```bash
pnpm evidence:launch --phase=preflight
pnpm evidence:launch --phase=t+0
pnpm evidence:launch --phase=t+5
pnpm evidence:launch --phase=t+15
```

The command runs the read-only production readiness probe, verifies the health
and canonical metadata contracts, checks public schema/content parity and auth
provider posture, then runs a fixed Vercel Runtime Logs query for the last 15
minutes. Raw log rows remain in memory and are discarded; output contains only
safe counts by surface/stage/category and the checked-in release fields.

Prerequisites:

1. Run from the exact frozen release checkout with an organization-approved
   Vercel CLI already authenticated and linked to this project. A token may be
   supplied through `VERCEL_TOKEN`, but it must never be printed or committed.
2. To filter one deployment, set `BIBLEQUEST_VERCEL_DEPLOYMENT` in the operator
   environment. It is used only as CLI input and is never emitted.
3. If CLI access is unavailable, export the 15-minute JSONL query to a restricted
   temporary file and set `BIBLEQUEST_OBSERVABILITY_LOG_FILE`. Raw exports may
   contain provider request metadata; never attach them to launch evidence, and
   remove them under the organization’s secure retention procedure after the
   aggregate is accepted.
4. `--fixture` is local/CI verification only and is never production evidence:
   `pnpm evidence:launch --phase=preflight --fixture`.

`HOLD` is a hard stop. `REVIEW` requires the named owner and rollback authority
to record a decision before continuing. Missing browser-log access is a warning
at preflight and a hard stop from T+0 onward.

## Actionable thresholds and owners

Owner names remain launch-record placeholders until assigned:

| Signal | Threshold | Owner | Required action |
| --- | --- | --- | --- |
| External health | 2 consecutive failures within 2 minutes | `[MONITORING OWNER]` + `[DEPLOY OWNER]` | Page immediately; hold promotion or begin rollback evaluation. |
| Auth or sync warning | At least 5 attempts, at least 3 failures, and failure rate at least 10% in 15 minutes | `[AUTH OWNER]` / `[SYNC OWNER]` | Investigate bounded categories before the next checkpoint. |
| Auth or sync critical | At least 5 attempts, at least 5 failures, and failure rate at least 25% in 15 minutes | `[AUTH OWNER]` / `[SYNC OWNER]` | Contain the capability and begin rollback evaluation. |
| Sync schema or permission | Any occurrence during launch | `[DATABASE OWNER]` / `[SECURITY OWNER]` | Stop account rollout; verify migration/RLS evidence. |
| SHA, canonical, schema/content, billing, worker, or rollback mismatch | Any mismatch | Responsible owner + `[ROLLBACK AUTHORITY]` | Hard hold; reconcile before traffic moves. |
| Privacy/isolation | Any private content or cross-account exposure | `[SECURITY OWNER]` + `[ROLLBACK AUTHORITY]` | Immediate incident; numeric thresholds do not apply. |

Low traffic is not proof of health. Every launch interval therefore includes the
synthetic below; do not interpret zero signals as success.

## Synthetic and alert-routing test

Use one dedicated staging canary account and a fresh browser profile. Do not put
its email, provider IDs, generated record IDs, or callback query in evidence.
Use no prayer, reflection, or Scripture fixture text.

1. Open the immutable candidate, complete sign-in, and confirm one `auth/session`
   success in the aggregate.
2. Let initial Journey sync finish and confirm one `sync/initial` success.
3. Confirm the worker challenge reports the expected checked-in version.
4. Go offline, cause one sync attempt, reconnect, and wait for recovery. Confirm
   the enum-only offline failure flushes followed by a success; inspect only the
   aggregate categories.
5. Run the evidence command for the checkpoint and save only its sanitized JSON.
6. In the already-approved external monitor/alert provider, use its built-in
   **test notification** against the existing route. Do not change recipients,
   escalation policy, billing, or production thresholds. `[MONITORING OWNER]`
   records send time, `[ON-CALL RECIPIENT]` records receipt/acknowledgement time,
   and `[ROLLBACK AUTHORITY]` accepts or rejects the routing evidence.

CI tests the synthetic aggregate and every threshold transition with fixtures.
The provider notification must still be tested by its named humans before
launch; this repository neither configures nor sends that external alert.

## Incident-safe handling

1. Stop releases and record UTC, release SHA, safe category counts, and affected
   surface only. Do not open or paste raw request rows into chat or tickets.
2. For a privacy/isolation signal, restrict raw-log access, preserve it only in
   the approved security system, and notify `[SECURITY OWNER]`. Do not copy the
   exposed value into the incident note while trying to describe it.
3. For schema/permission failures, stop account rollout and determine app/schema
   compatibility before rollback. Never reset production, edit an applied
   migration, or use migration repair as incident improvisation.
4. For auth/sync rate alerts, reproduce with the synthetic canary, compare the
   fixed categories, and choose containment, compatible rollback, or reviewed
   forward fix. Absence of server 5xx is not a browser-health pass.
5. After recovery, rerun the same evidence command and clean/existing-PWA checks.
   Only the release commander closes the incident after owner sign-off.

The complete deployment and database rollback procedure remains in
[`LAUNCH_RUNBOOK.md`](LAUNCH_RUNBOOK.md).
