# Privacy-safe launch observability

BibleQuest records a narrow operational signal because clean server logs do not
prove that browser authentication, Journey sync, or a service-worker upgrade
worked. This foundation adds no database, user/session identifier, fingerprint,
arbitrary URL, request query, or free-form error message.

It does not replace product analytics. Plausible remains consent-gated under
[`ANALYTICS.md`](ANALYTICS.md); operational signals are required reliability
evidence and contain only fixed enums. Enabled auth/sync uses all three signal
surfaces; guest-only requires the worker signal and treats any auth/sync signal
as a containment breach.

## Public health contract

`GET /api/health` is public and `no-store`. It reports only:

- external status and contract version;
- deployed Git SHA and explicitly approved rollback SHA, each only when exactly
  40 hexadecimal characters;
- the fixed canonical origin and whether `NEXT_PUBLIC_APP_URL` matches it;
- `configured`, `guest-only`, or `invalid` effective auth posture without a
  host or key; the containment latch reports `guest-only` even when dormant
  provider credentials remain configured;
- schema/content contract labels (`0030` and `seed-manifest-v1`);
- the checked-in service-worker version;
- `coming-soon`, `test`, `live`, or `invalid` direct Stripe posture without a
  key, plus a boolean purchase-UI gate.

`BIBLEQUEST_ROLLBACK_SHA` is a server-only deployment variable. Set it only to
the reviewed, database-compatible rollback commit after the rollback authority
approves that target. This repository change does not set it in Vercel.
The deploy owner must also verify that Vercel's system environment variables are
enabled so `VERCEL_GIT_COMMIT_SHA` reaches the deployment; a missing SHA is a
hard hold and this repository does not change that project setting.

Health reports posture; it does not prove behavior. A `configured` release must
complete the full auth/sync synthetic, SMTP delivery, callback, and
cross-account evidence in the launch runbook. A `guest-only` release must
complete the containment canary below: enrollment, sign-in, and account-action
controls absent (a status-only containment notice/page is allowed), customer
callback and middleware/session handling inert, sync/client creation inert, no
customer-browser Supabase Auth/session/user-table/sync-RPC traffic, and
local-first core behavior complete. The separately allowlisted operator console
is measured as a private surface and does not change customer account posture.
`invalid` is always a hard hold. Dormant credentials do not upgrade or downgrade
these requirements.

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

The endpoint requires its `Origin` to match the exact deployment being called,
rejects cross-site Fetch Metadata, and applies per-client limits of 60 requests
per minute and 300 per 15 minutes inside each reused server instance. The
client bucket is held only in memory and is never logged or emitted as evidence.
Vercel Firewall must mirror a deployment-wide bound before launch because
public browser signals are not authenticated or cryptographically attested;
they are operational canaries, not unique-user or security-audit counts.

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

Production is the default and cannot be silently redirected to preview logs.
For a staging rehearsal against one immutable Vercel preview, set both operator
inputs and opt in explicitly:

```bash
BIBLEQUEST_READINESS_APP_URL=https://<IMMUTABLE-PREVIEW-HOST> \
BIBLEQUEST_VERCEL_DEPLOYMENT=<IMMUTABLE-DEPLOYMENT-ID-OR-HOST> \
pnpm evidence:launch --phase=preflight --environment=preview
```

The command runs the read-only readiness probe, verifies the health
and canonical metadata contracts, checks public schema/content parity and auth
provider posture, then runs a fixed Vercel Runtime Logs query for the last 15
minutes. The operator probe's public, read-only database checks are not browser
auth/sync traffic and must remain separately identified in evidence. Raw log
rows remain in memory and are discarded; output contains only safe counts by
surface/stage/category and the checked-in release fields.
Migration `0015` is not accepted from revision-table columns alone: the probe
calls the anonymous read-only `daily_quest_sync_contract()` and requires its
exact two-field contract to confirm the CAS RPC, trigger bindings, RLS, and
grant posture without returning catalog diagnostics or user rows.

Prerequisites:

1. Run from the exact frozen release checkout with an organization-approved
   Vercel CLI already authenticated and linked to this project. A token may be
   supplied through `VERCEL_TOKEN`, but it must never be printed or committed.
2. To filter one production deployment, set `BIBLEQUEST_VERCEL_DEPLOYMENT` in
   the operator environment. Preview evidence requires that filter plus a safe
   HTTPS `BIBLEQUEST_READINESS_APP_URL`; neither raw value is emitted.
3. If CLI access is unavailable, export the 15-minute JSONL query to a restricted
   temporary file and set `BIBLEQUEST_OBSERVABILITY_LOG_FILE`. Raw exports may
   contain provider request metadata; never attach them to launch evidence, and
   remove them under the organization’s secure retention procedure after the
   aggregate is accepted.
4. `--fixture` is local/CI verification only and is never production evidence:
   `pnpm evidence:launch --phase=preflight --fixture`.
5. The 1,000-row CLI cap and 10 MiB export cap fail closed. A cap hit discards
   the partial aggregate and returns `HOLD`; narrow or paginate the query rather
   than accepting partial counts. Complete access without a successful
   expected-version worker synthetic returns `HOLD`, and any worker failure is
   also a hard hold. Missing successful auth/sync synthetics return `HOLD` for a
   `configured` launch. For `guest-only`, auth/sync success synthetics are
   intentionally absent; the command's bounded `REVIEW` requires the manual
   containment/no-traffic evidence and signed acceptance below.
6. `live` billing returns `HOLD` unless the billing owner has approved and
   attached the complete provider/legal smoke evidence and the operator adds
   `--live-billing-verified` to that exact invocation. `coming-soon` needs no
   override; `test` is never production-safe. A purchase gate outside an
   explicitly verified live posture is also a hard hold.

`HOLD` is a hard stop. `REVIEW` requires the named account posture owner and
rollback authority to record a decision before continuing. A guest-only
`REVIEW` can make the overall launch checkpoint READY only when health reports
`guest-only`, the containment/no-traffic matrix passes, active auth/sync rows
are explicitly `OUT OF SCOPE — APPROVED GUEST-ONLY`, and both named humans
accept the residual cached-client decision. It never converts disabled
auth/sync behavior into a pass. Missing browser-log access is a warning at
preflight and a hard stop from T+0 onward; truncated selected-posture coverage
is a hard stop at every phase.

## Actionable thresholds and owners

Owner names remain launch-record placeholders until assigned:

| Signal | Threshold | Owner | Required action |
| --- | --- | --- | --- |
| External health | 2 consecutive failures within 2 minutes | `[MONITORING OWNER]` + `[DEPLOY OWNER]` | Page immediately; hold promotion or begin rollback evaluation. |
| Enabled auth or sync warning | At least 5 attempts, at least 3 failures, and failure rate at least 10% in 15 minutes | `[AUTH OWNER]` / `[SYNC OWNER]` | Investigate bounded categories before the next checkpoint. |
| Enabled auth or sync critical | At least 5 attempts, at least 5 failures, and failure rate at least 25% in 15 minutes | `[AUTH OWNER]` / `[SYNC OWNER]` | Contain the capability and begin rollback evaluation. |
| Service-worker canary | Any failure, no successful expected-version observation, or an observed version mismatch | `[PWA OWNER]` | Hold rollout and resolve worker registration/version behavior. |
| Guest-only containment | Any visible account control, auth/session exchange or refresh, sync-client activity, auth/sync browser signal, or browser request to Supabase Auth, a user-owned table, or a sync RPC | `[ACCOUNT POSTURE OWNER]` + `[ROLLBACK AUTHORITY]` | Immediate incident; contain stale clients/backend writes as necessary and begin rollback evaluation. |
| Sync schema or permission | Any occurrence during launch | `[DATABASE OWNER]` / `[SECURITY OWNER]` | Stop account rollout; verify migration/RLS evidence. |
| SHA, canonical, schema/content, billing, worker, or rollback mismatch | Any mismatch | Responsible owner + `[ROLLBACK AUTHORITY]` | Hard hold; reconcile before traffic moves. |
| Privacy/isolation | Any private content or cross-account exposure | `[SECURITY OWNER]` + `[ROLLBACK AUTHORITY]` | Immediate incident; numeric thresholds do not apply. |

Low traffic is not proof of health. Every launch interval therefore includes
the synthetic for the selected posture below. Zero auth/sync signals are
expected only after the guest-only containment canary positively proves why.

## Selected-posture synthetic and alert-routing test

### Auth + sync enabled

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
6. Complete real custom-SMTP delivery and callback testing through both Gmail
   and iCloud plus the launch runbook's both-direction A/B isolation matrix.

### Guest-only contained

Use a clean browser and an upgraded browser/PWA with only synthetic local data:

1. Confirm health reports `guest-only` and the expected worker version.
2. Inspect onboarding, navigation, settings, and direct account-route behavior;
   no enrollment, sign-in, sign-out, provider, or account-sync control may be
   reachable or advertised.
3. Exercise callback URLs with fake code, token-hash, error, and approved/invalid
   `next` forms. Each stays bounded and creates no credential exchange or
   session. Navigate ordinary pages and confirm middleware makes no session
   refresh.
4. Complete the local-first quest, reflection, journey, persistence,
   export/clear, offline/reconnect, and close/reopen paths. Confirm the sync
   engine never creates a Supabase client or emits an auth/sync success signal.
5. Preserve a sanitized DevTools request summary showing no browser request to
   Supabase Auth/session endpoints, user-owned REST tables, or sync RPCs during
   steps 2–4. Public health and operator-only readiness probes are separate and
   do not count as browser runtime traffic.
6. Fully close/relaunch installed PWAs twice. Record any stale worker/open-client
   observation and the accepted backend containment or rollback decision.
7. Run the evidence command and save only its sanitized JSON. Record active
   auth/sync synthetics and A/B behavior as `OUT OF SCOPE — APPROVED GUEST-ONLY`,
   not `PASS`; obtain signed acceptance from `[ACCOUNT POSTURE OWNER]` and
   `[ROLLBACK AUTHORITY]`.

### Alert routing for either posture

1. In the already-approved external monitor/alert provider, use its built-in
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
4. For enabled auth/sync rate alerts, reproduce with the account canary, compare
   the fixed categories, and choose containment, compatible rollback, or a
   reviewed forward fix. For guest-only, any auth/sync activity is a posture
   breach; preserve only sanitized evidence and contain immediately. Absence of
   server 5xx is not a browser-health pass.
5. After recovery, rerun the same evidence command and clean/existing-PWA checks.
   Only the release commander closes the incident after owner sign-off.

The complete deployment and database rollback procedure remains in
[`LAUNCH_RUNBOOK.md`](LAUNCH_RUNBOOK.md).
