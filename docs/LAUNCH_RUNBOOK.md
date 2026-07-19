# July 31 launch and rollback runbook

This is the execution record for the BibleQuest production launch targeted for
**July 31, 2026**. It coordinates the detailed procedures in
[`DEPLOYMENT.md`](DEPLOYMENT.md), [`QA.md`](QA.md),
[`REVENUECAT.md`](REVENUECAT.md), and
[`SUPABASE_SECURITY_ROLLOUT.md`](SUPABASE_SECURITY_ROLLOUT.md). Account sync,
custom SMTP, auth templates, and content reconciliation are executed through
[`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md).

No unchecked item is a pass. `OPEN`, `TBD`, and blank evidence fields are
release blockers unless a gate explicitly documents an approved out-of-scope
posture. Never paste secrets, tokens, database URLs/passwords, private user
content, or sensitive screenshots into this file, chat, CI, tickets, or public
logs. Store production evidence in an access-controlled location and link only
to a sanitized record.

## 1. Release identity

Complete this table at release freeze. The immutable commit must be clean,
pushed, reviewed, and identical to the commit shown by the Vercel deployment.

| Field | Release value | Evidence | Status |
| --- | --- | --- | --- |
| Target | July 31, 2026 at `[HH:MM ET]` | Approved launch window: `[EVIDENCE URL]` | OPEN |
| Release branch | `main` at freeze | `git branch --show-current` output | OPEN |
| Immutable release commit | `[FULL 40-CHAR SHA]` | CI run and signed release record: `[EVIDENCE URL]` | OPEN |
| Build artifact / preview URL | `[IMMUTABLE VERCEL DEPLOYMENT URL]` | Vercel inspection showing the release SHA: `[EVIDENCE URL]` | OPEN |
| Production URL after promotion | Canonical `https://www.biblequest.co`; apex redirects to `www` | DNS/TLS, redirect, metadata, Supabase Site URL/callback, and Vercel `NEXT_PUBLIC_APP_URL`: `[EVIDENCE URL]` | OPEN |
| Database migration set | `0001` through `0011`, in filename order; record SHA-256 manifest at freeze | Local, staging, and production migration lists: `[EVIDENCE URLS]` | OPEN |
| Production backup | `[UTC TIMESTAMP]`; method `[DAILY BACKUP / PITR / OTHER]`; restore point `[ID WITHOUT CREDENTIALS]` | Provider backup record: `[RESTRICTED EVIDENCE URL]` | OPEN |
| Previous known-good deployment | `[IMMUTABLE VERCEL DEPLOYMENT URL]`, commit `[SHA]` | Rollback rehearsal and PWA/privacy checks: `[EVIDENCE URL]` | OPEN |
| Database compatibility decision | `[BACKWARD COMPATIBLE / APP FIRST / DB FIRST / ROLLBACK RESTRICTED]` | Signed decision: `[EVIDENCE URL]` | OPEN |
| Billing posture | `[COMING SOON / LIVE WEB BILLING]` | RevenueCat/Vercel sanitized evidence: `[EVIDENCE URL]` | OPEN |

Freeze the migration manifest without revealing credentials:

```bash
find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print0 \
  | sort -z \
  | xargs -0 shasum -a 256
```

Expected filenames, in order:

```text
0001_init.sql
0002_rls_policies.sql
0003_chapters_read_unique.sql
0004_multi_daily_quests.sql
0005_user_language.sql
0006_purge_user_data.sql
0007_user_quests.sql
0008_reassert_rls_and_purge.sql
0009_analytics_consent_opt_in.sql
0010_rolling_quest_windows_and_recent_verses.sql
0011_bible_translation_preference.sql
```

**Hard stop:** do not launch from a dirty tree, a moving branch reference, an
unreviewed preview, or a deployment whose Git SHA does not exactly match the
frozen release commit.

### Preparation snapshot — July 19, 2026 (not launch sign-off)

These current-run results validate the working tree only. They are not evidence
for the eventual frozen commit and must be rerun at release freeze.

| Check | Current-run result |
| --- | --- |
| Active source | Remediation is in progress on `main`; the working tree is not frozen and is **not releasable** |
| Source verification | MUST RERUN against the frozen commit using section 5; prior counts and page totals are not launch evidence |
| Production health | PASS — `https://www.biblequest.co/api/health` returned the expected health payload |
| Production account-sync contract | FAIL — the `0010` rolling/recent-verse shape and `0011` Bible-preference/bookmark shape are missing |
| Production content mirror | FAIL — 84/150 approved free quests with 84 content mismatches/blank Scripture snapshots, 60/180 active daily passages, and 22/38 milestones with 22 content mismatches; both prompt catalogues exactly match at 32 |
| Production auth providers | PARTIAL — Email and Google providers are enabled and Phone is disabled; deployed controls, custom SMTP delivery, and template/cross-browser behavior require manual proof |
| Canonical host | FAIL — apex redirects to `www`, while deployed Open Graph metadata still identifies apex; reconcile Vercel metadata and Supabase Auth to `www` |
| Local Supabase | PASS FOR THIS WORKTREE — local migration history reaches `0011`, schema lint is clean, the 27-table RLS report passes, and content counts are 150/180/38/32/32; rerun at release freeze |
| Staging, device, legal, monitoring, backup/restore, rollback | NOT RUN — requires named humans and provider/device evidence; no deployment was performed |

## 2. Roles and authority

Enter a full human name and explicit acknowledgement for every row. One person
may hold multiple roles, but the database owner and rollback authority must
both participate in any destructive database recovery decision.

| Role | Named human | Responsibilities | Acknowledged at |
| --- | --- | --- | --- |
| Release commander | `[FULL NAME]` | Runs the checklist, calls holds, records gate decisions | `[UTC]` |
| Deploy owner | `[FULL NAME]` | Owns Vercel preview, promotion, rollback, and deployment evidence | `[UTC]` |
| Database owner | `[FULL NAME]` | Owns project identity, migration evidence, backup/restore, and DB compatibility | `[UTC]` |
| QA owner | `[FULL NAME]` | Runs the staging matrix and post-deploy smoke tests | `[UTC]` |
| Monitoring owner | `[FULL NAME]` | Watches health, logs, telemetry, checkout, and support signals | `[UTC]` |
| Communications owner | `[FULL NAME]` | Posts launch/incident updates without private user information | `[UTC]` |
| Rollback authority | `[FULL NAME]` | Sole final go/no-go and rollback decision authority | `[UTC]` |

## 3. T-minus timeline

All times are ET unless the evidence itself is timestamped in UTC.

| Time | Date | Required actions | Exit condition |
| --- | --- | --- | --- |
| T-7 days | Fri Jul 24 | Assign roles; choose launch hour and billing posture; freeze feature scope; inventory environments/domains; start evidence index | Every owner acknowledged; no unowned gate |
| T-6 days | Sat Jul 25 | Clean local DB reset; migration manifest/history review; local RLS report; run automated verification | Local verification passes or defects are assigned |
| T-5 days | Sun Jul 26 | Apply only reviewed pending migrations to staging; execute two-user/anonymous RLS tests and Clear My Data | Migration, RLS, isolation, and purge evidence accepted |
| T-4 days | Mon Jul 27 | Run full staging rehearsal matrix, privacy telemetry inspection, auth methods, billing posture, accessibility, Winterhill embed | Every matrix row passes on immutable preview |
| T-3 days | Tue Jul 28 | Perform non-production backup restore drill; identify and test rollback-safe Vercel target; rehearse service-worker upgrade/rollback behavior | Restore and rollback gates signed |
| T-2 days | Wed Jul 29 | Legal/content approval; configure health/error/support monitoring; verify production env names and allowed redirect URLs without exposing values | Legal and monitoring gates signed |
| T-24 hours | Thu Jul 30 | Freeze release commit; require CI; create immutable preview; compare deployment SHA; record production migration dry run and current backup/PITR posture | All hard gates pass; only scheduled execution remains |
| T-4 hours | Fri Jul 31 | Recheck provider status, owner availability, support channel, previous known-good eligibility, backup freshness, and abort communications | Release commander records READY or NO-GO |
| T-60 minutes | Fri Jul 31 | Start launch bridge; stop unrelated changes; open sanitized evidence/monitoring views; confirm exact production project and deployment | All owners present; no active incident |
| T-30 minutes | Fri Jul 31 | Final go/no-go roll call; review DB compatibility/order; verify current production health and rollback target | Rollback authority signs GO |
| T-0 | Fri Jul 31 `[HH:MM]` | Execute section 7 exactly; timestamp every checkpoint | Promotion completes or abort/rollback begins |
| T+0 to +60 | Fri Jul 31 | Execute first-hour watch in section 8 | Monitoring owner and rollback authority sign stable/incident |

## 4. Hard go/no-go gates

A waiver is not a pass. If a capability is deliberately disabled for launch,
the evidence must prove the production configuration disables it and that the
user experience matches the documented posture.

| Gate | Pass evidence required | Owner | No-go / recovery action | Status |
| --- | --- | --- | --- | --- |
| Migration history | Clean local reset; `0001`-`0011` manifest; staging and production `migration list` captured; production migration-only dry run proposes only the reviewed pending set and ends at `0011` | Database owner | Stop on any mismatch or replay of renamed `0002`-`0006`; follow the forward-only reconciliation procedure; never use `--include-all` or repair as a shortcut | OPEN |
| RLS | Catalog report shows all 27 expected public tables with RLS enabled, only documented policies, correct roles, and hardened `purge_user_data` grants/search path | Database owner | Stop application rollout; correct with a new higher-numbered migration and repeat all DB gates | OPEN |
| Content mirror | After schema/RLS passes: regenerated seed/manifest have clean diffs and approved digests; seed dry run reports no pending migrations; production readiness proves exact natural-key/content hashes for 150 quests, 180 passages, 38 milestones, and 32/32 prompts | Database + content owners | Keep sync beta-gated; inspect mismatch totals and frozen artifacts; never reset production or paste ad hoc SQL from chat | OPEN |
| Auth email and callback | Custom SMTP DNS/provider verification passes; Supabase Site URL and exact callback use canonical `www`; new and existing users complete real Gmail/iCloud links cross-browser | Deploy + QA owners | Stop invitations; correct provider/template/canonical configuration and retest without exposing single-use tokens | OPEN |
| Cross-account isolation | Staging accounts A and B pass both-direction CRUD negative tests; sentinel prayer/reflection text never crosses accounts or appears in logs/evidence | Database + QA owners | Disable production auth/sync or stop launch; remove fixtures after evidence is accepted | OPEN |
| Backup restore | Fresh production backup/PITR posture recorded; a representative backup has been restored and integrity-checked in an isolated non-production project | Database owner | No production DB change. Escalate provider issue; reschedule. Never test restore over production | OPEN |
| Privacy telemetry | Consent off and Do Not Track produce no events; allowed events contain only whitelisted non-text props and query/hash-free URLs; no prayer/reflection/note text in analytics, browser console, network payloads, or error tooling | QA + monitoring owners | Disable analytics/error integration or stop launch; scrub queued/test data and retest | OPEN |
| Device / PWA QA | Physical iPhone install/standalone/offline/reconnect/update passes; desktop cache inspection matches [`QA.md`](QA.md); mobile and desktop smoke tests pass | QA owner | Stop launch or use an explicitly approved web-only posture that prevents install promotion until fixed | OPEN |
| Billing posture | Exactly one posture below is selected and verified; prices/copy/entitlement/manage flow match; no test key in production | Deploy + QA owners | Set coming-soon posture and redeploy, or stop launch. Never accept real charges through an unverified flow | OPEN |
| Legal approval | Named approver accepts Privacy, Terms, WEB/public-domain posture, sensitive content, supporter claims, refund/cancellation copy, and the 5% giving pledge or removes the claim | Communications owner | Stop launch or remove unapproved claims/features and repeat QA | OPEN |
| Monitoring | External health check, Vercel error/log view, auth/sync signals, billing dashboard if live, and staffed support inbox/channel are tested; alert routing reaches the named owner | Monitoring owner | Stop launch until signals and human response path work | OPEN |
| Rollback rehearsal | Eligible previous known-good deployment is recorded; Vercel rollback is rehearsed in non-production or approved dry rehearsal; DB compatibility and service-worker behavior are verified | Deploy + database + QA owners | Establish a new rollback-safe baseline or stop launch; do not assume the previous deployment is safe | OPEN |

### Billing gate choices

Select exactly one:

- [ ] **Coming soon:** `NEXT_PUBLIC_REVENUECAT_BILLING_MODE` is unset or exactly
      `coming-soon` and `NEXT_PUBLIC_REVENUECAT_PUBLIC_KEY` is absent from the
      production build environment; Plus shows coming-soon copy; no RevenueCat
      request, purchase control, or test-store checkout is reachable; free
      functionality is complete.
- [ ] **Live Web Billing:** `NEXT_PUBLIC_REVENUECAT_BILLING_MODE=live` and a
      production `rcb_…` public key are configured in
      Vercel (never record its value); Stripe/RevenueCat Web Billing products,
      packages, entitlement, prices, paywall or fallback, successful/declined
      checkout, entitlement refresh, management URL, refund/cancellation, and
      identity/restore posture all pass. A `test_…` key is a hard no-go.

[`REVENUECAT.md`](REVENUECAT.md) currently recommends coming-soon for launch.
Treat live billing as **OPEN** until every provider, legal, identity, CSP,
staging, and production gate there passes; old development notes are not
production evidence.

## 5. Exact local verification

Run from the repository root with Node.js 24 and pnpm 11.10.0. Save sanitized
command, timestamp, exit code, and summary against the frozen SHA. Do not upload
`.env*`, build traces containing sensitive values, or raw dependency tokens.

| Command | Expected pass criteria |
| --- | --- |
| `git branch --show-current` | Exactly `main` for the final production candidate |
| `git rev-parse HEAD` | Exact 40-character SHA recorded in section 1 and Vercel |
| `git status --short` | No output at freeze; a dirty tree is a hard stop |
| `node --version && pnpm --version` | Node `v24.x`; pnpm `11.10.0` |
| `pnpm install --frozen-lockfile` | Exit 0; lockfile unchanged |
| `pnpm lint` | Exit 0; zero ESLint errors |
| `pnpm exec tsc --noEmit` | Exit 0; zero TypeScript errors |
| `pnpm test` | Exit 0; all Vitest files/tests pass |
| `pnpm test:headers` | Exit 0; production build plus live production/development response-header integration tests pass |
| `pnpm test:service-worker` | Exit 0; all cache-policy, fetch, and lifecycle tests pass |
| `pnpm build` | Exit 0; Next.js production build completes |
| `pnpm audit --prod` | Full production advisory report is reviewed and linked; every advisory has a disposition |
| `pnpm audit --prod --audit-level high` | Exit 0; no high or critical production advisory |
| `git diff --check` | Exit 0; no whitespace errors |
| `pnpm check:production-readiness` | After the approved production push: all public schema, content, health, metadata, and auth-provider checks pass; deployed controls and other manual gates remain separate |

The repository currently has no Markdown or link-check script in `package.json`.
If one is added before freeze, it becomes required and its exact command and
zero-error result must be added to the evidence index.

### Local database verification

Follow the complete procedure in
[`SUPABASE_SECURITY_ROLLOUT.md`](SUPABASE_SECURITY_ROLLOUT.md). These commands
target only the local stack; do not add `--linked` or `--db-url`:

```bash
supabase start
supabase db reset
supabase migration list --local
docker exec -i supabase_db_BibleQuest \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/evidence/rls_policy_report.sql
```

Pass means all eleven migrations apply in the documented order, analytics
consent defaults to and is reset to explicit opt-in (`false`) by `0009`, the
rolling/recent-verse schema from `0010` exists, the Bible preference and
translation-aware bookmark schema from `0011` exists, and the report meets the
27-table RLS gate. Supabase CLI and a Docker-compatible daemon are required.

For a linked project, retain every history/RLS safeguard in the security
runbook and follow the seed/auth/content sequence in
[`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md). The reviewed dry run must
match the frozen manifest and end at `0011`; a column probe alone is not
migration-history evidence.

### Immutable deployment checks

Use placeholders only after the exact URL is known:

```bash
curl --fail --silent --show-error \
  https://<IMMUTABLE-DEPLOYMENT-URL>/api/health
curl --fail --silent --show-error --head \
  https://<IMMUTABLE-DEPLOYMENT-URL>/sw.js
```

The health body must be exactly compatible with
`{"status":"ok","app":"biblequest"}`. The worker response must include
`Cache-Control: no-cache, no-store, must-revalidate`. Browser verification is
still required because `curl` does not exercise PWA, auth, sync, or billing.

## 6. Staging rehearsal matrix

Run every row against the same immutable candidate deployment and the approved
staging project. Use synthetic staging data only. Record browser/device/version,
UTC time, named tester, and a sanitized evidence link.

| Scenario | Actions and pass criteria | Evidence | Owner | Status |
| --- | --- | --- | --- | --- |
| Clean user | New browser profile to `/app`; onboarding under two minutes; complete quest/reflection/journey; export and clear data | `[URL]` | `[FULL NAME]` | OPEN |
| Returning user | Seed normal local history, close/reopen, upgrade candidate, and confirm settings, shelf, prayer/reflection, Bible position, milestones, and export survive | `[URL]` | `[FULL NAME]` | OPEN |
| Two-account switch | A creates unique synthetic prayer/reflection and syncs; sign out; sign in as B; app refuses silent ownership handoff; choose explicit safe resolution; neither account receives the other's data; switch back to A | `[URL]` | `[FULL NAME]` | OPEN |
| Offline / reconnect | Visit allowlisted routes; go offline; exact visited routes or honest fallback appear; create local prayer/reflection; force-close/reopen; reconnect; sync succeeds once with no duplication/resurrection | `[URL]` | `[FULL NAME]` | OPEN |
| iPhone install | Current iOS Safari Add to Home Screen; standalone launch; safe areas; offline relaunch; reconnect; deploy worker update; relaunch twice | `[URL]` | `[FULL NAME]` | OPEN |
| Auth methods | Guest exit, Google OAuth, same-browser magic link, and token-hash email flow if configured; approved internal `next` works; external/protocol-relative/encoded redirect attempts land safely; sign-out clears session UI | `[URL]` | `[FULL NAME]` | OPEN |
| Billing posture | Coming-soon mode has no checkout, **or** live-mode offerings/prices/paywall/fallback/success/decline/entitlement/manage/identity posture pass; nothing spiritual is gated | `[URL]` | `[FULL NAME]` | OPEN |
| Accessibility | Keyboard-only navigation; visible focus; labels/names; 200% zoom; reduced motion; light/dark contrast; mobile screen-reader smoke test; no blocker-level issue | `[URL]` | `[FULL NAME]` | OPEN |
| Winterhill embed | Embed from `https://winterhill.studio` and `https://www.winterhill.studio`; loads without CSP/frame errors; auth/payment/private routes are not exercised in the public preview; direct BibleQuest navigation still works | `[URL]` | `[FULL NAME]` | OPEN |

Also complete every applicable checklist in [`QA.md`](QA.md), including the
desktop Cache Storage inspection and the no-private-text guardrails.

## 7. Deployment sequence

Only the named deploy owner runs Vercel actions. Only the named database owner
runs Supabase actions. Stop immediately on an abort condition; do not improvise
with migration repair, history edits, unreviewed seed changes, or database
restores.

1. **Open the launch record.** Release commander records start time, owners,
   provider status, current production health, support readiness, and the exact
   release/rollback identities.
   - Checkpoint: section 1 is complete and all gates say PASS.
   - Abort: missing owner/evidence, active provider incident, dirty/moving SHA.
2. **Confirm the immutable candidate.** Deploy owner verifies the Vercel
   candidate shows the exact release SHA and reruns health, security-header,
   core-loop, privacy, auth, PWA, embed, and selected billing smoke tests.
   - Checkpoint: immutable URL and inspection evidence recorded.
   - Abort: SHA mismatch, build warning affecting runtime, failed smoke test.
3. **Confirm rollback safety.** Deploy and QA owners open the previous
   known-good deployment and verify eligibility, health, current production
   environment dependencies, and the required service-worker privacy policy.
   - Checkpoint: rollback URL and rehearsal evidence recorded.
   - Abort: target predates safe private-route/cache exclusions, depends on an
     incompatible database, or is not eligible on the Vercel plan.
4. **Reconfirm database order.** Database owner reviews the current production
   backup, linked project identity, migration list, sanitized dry run, and the
   signed compatibility decision. Follow
   [`SUPABASE_SECURITY_ROLLOUT.md`](SUPABASE_SECURITY_ROLLOUT.md) exactly.
   - Checkpoint: rollback authority approves the exact pending migration set.
   - Abort: wrong project, stale backup, unexpected migration, history mismatch,
     or proposal to replay/repair older versions.
5. **Promote and verify the compatibility candidate.** Deploy owner uses the
   approved Vercel promotion flow to point production domains at the exact,
   already-tested SHA. Before any database mutation, verify health, canonical
   metadata, guest flow, Email + Google controls with no Phone control, and a
   synthetic signed-in core restore against the current legacy schema shape.
   - Checkpoint: production identifies the release SHA and the bridge works
     before the database contract changes.
   - Abort/rollback: wrong SHA/alias, health or canonical failure, sustained
     5xx, missing auth controls, or a repeated core-restore failure. Roll back
     the app while the database is still unchanged.
6. **Apply approved database migrations.** Database owner alone executes the
   exact migration-only push, then saves the after-list and RLS report and runs
   limited isolation/sync schema checks.
   - Checkpoint: migration/RLS/isolation evidence remains PASS and the linked
     migration list has no pending version through `0011`.
   - Abort: any command error, unexpected row effect, RLS failure, privacy,
     auth, or sync regression. `0009` deliberately resets existing analytics
     consent to `false`; `0010` backfills/deduplicates data; `0011` changes
     bookmark uniqueness. Capture failures and stop rather than attempting an
     ad hoc reversal.
7. **Apply the approved content seed.** Regenerate the seed, require
   `git diff --exit-code -- supabase/seed.sql supabase/seed-manifest.json`,
   record
   `shasum -a 256 supabase/seed.sql supabase/seed-manifest.json`, and review
   `db push --linked --dry-run --include-seed`. It must report no pending
   migration and the separately recorded frozen seed digests. Database owner then runs the exact
   reviewed `db push --linked --include-seed` and records sanitized counts.
   - Checkpoint: content evidence remains PASS and
     `pnpm check:production-readiness` is green.
   - Abort: dirty/regenerated seed, pending migration, unexpected natural key or
     row effect, count mismatch, or probe failure.
8. **Run the T+0 smoke.** QA owner verifies health, landing, onboarding/core
   loop, Bible text, Privacy/Terms, auth/sync if enabled, billing posture,
   Winterhill embed, and one clean PWA navigation without recording private data.
   - Checkpoint: T+0 row in section 8 is signed.
   - Abort/rollback: security/privacy/cross-account issue triggers immediate
     containment and rollback evaluation; do not wait for the next interval.
9. **Enter first-hour watch.** Freeze unrelated production changes through T+60.
   Release commander alone declares stable after the final sign-off.

## 8. First-hour watch

Use aggregate counts and synthetic canaries. Do not paste user content, emails,
tokens, request bodies, or sensitive screenshots into the incident record.

| Time | Required observations | Owner | Evidence / result | Decision |
| --- | --- | --- | --- | --- |
| T+0 | Health returns expected JSON; production SHA/aliases correct; synthetic auth and sync smoke; no new 5xx/CSP errors; selected checkout posture correct; support channel open | Monitoring + QA | `[URL / SUMMARY]` | `[CONTINUE / ROLLBACK]` |
| T+5 | Health and landing latency normal; auth callback success/error pattern sane; sync has no failure burst; Vercel errors stable; checkout success/decline or coming-soon state correct; no support reports | Monitoring | `[URL / SUMMARY]` | `[CONTINUE / ROLLBACK]` |
| T+15 | Repeat health/auth/sync/error review; inspect privacy-safe analytics shape/consent; review RevenueCat/Stripe aggregate signals if live; triage support | Monitoring + QA | `[URL / SUMMARY]` | `[CONTINUE / ROLLBACK]` |
| T+30 | Repeat all signals; test returning session and one offline/reconnect canary; verify no stale-worker/private-cache report; summarize rates against prelaunch baseline | Monitoring + QA | `[URL / SUMMARY]` | `[CONTINUE / ROLLBACK]` |
| T+60 | Repeat all signals; account for every support issue; record incident links; confirm production SHA, migration state, and rollback readiness; release commander requests final signatures | All owners | `[URL / SUMMARY]` | `[STABLE / INCIDENT]` |

Minimum signal set at every interval:

- **Health:** `/api/health`, landing/core navigation, domain/TLS.
- **Auth:** synthetic sign-in/callback/sign-out; aggregate failure trend.
- **Sync:** synthetic write/reload/reconnect; aggregate `sync_failed` versus
  `sync_completed`; no private payload inspection.
- **Errors:** Vercel 5xx/runtime/build logs and browser CSP/console errors.
- **Checkout:** coming-soon remains inert, or live success/decline/entitlement/
  management and aggregate provider signals remain healthy.
- **Support:** staffed inbox/channel, number/severity of reports, no user content
  copied into the launch record.

## 9. Rollback and recovery

### Triggers

Rollback authority evaluates immediately; security/privacy isolation failures
do not wait for a numeric threshold.

- Any cross-account data exposure, private text in telemetry/logs/cache, auth
  bypass, unexpected client write to subscriptions, or secret exposure.
- Health failure or sustained production 5xx that prevents a core journey.
- Auth/sync failure burst, destructive merge/resurrection, or inability to
  complete the core loop after reconnect.
- Real-money checkout uses the wrong store/price/entitlement, cannot grant or
  manage access, or produces unexplained duplicate charges.
- PWA update loop, broken offline launch, private-route cache regression, or a
  service worker that strands clients on an unsafe release.
- Production migration/RLS evidence differs from the approved state.
- Legal/support issue that the named authority determines cannot remain live.

### Contain and decide

1. Release commander stops all releases and timestamps the incident.
2. Communications owner opens the sanitized incident note below and prepares a
   factual user update if needed.
3. Monitoring owner captures aggregate health/error identifiers and affected
   surfaces without private content.
4. Database owner determines whether the incident is app-only, configuration,
   policy/schema, or data corruption and completes this decision:

| Question | Decision |
| --- | --- |
| Can the previous app safely use the current production schema/policies? | `[YES / NO / UNKNOWN]` |
| Did the release perform incompatible writes or irreversible external actions? | `[YES / NO / UNKNOWN]` |
| Does the rollback target contain the required private-route and service-worker cache protections? | `[YES / NO]` |
| Is an app rollback sufficient? | `[YES / NO]` |
| Are writes/checkout/auth being disabled during recovery? | `[ACTION / OWNER / UTC]` |

**Hard stop:** if compatibility is `NO` or `UNKNOWN`, do not point traffic at the
old app. Contain the affected feature and use a reviewed forward fix or
compatible deployment.

### Vercel rollback

Follow Vercel's official
[production rollback guide](https://vercel.com/docs/deployments/rollback-production-deployment)
and [Instant Rollback behavior](https://vercel.com/docs/instant-rollback).

Dashboard path:

1. Deploy owner opens the project Production Deployment tile and chooses
   **Instant Rollback**.
2. Select the exact section 1 known-good deployment, verify domains and external
   dependencies, and obtain rollback-authority confirmation.
3. Confirm rollback, record completion time, and verify the production SHA.

CLI path, only from an already linked and authorized Vercel project:

```bash
vercel rollback <PREVIOUS-KNOWN-GOOD-DEPLOYMENT-URL>
vercel rollback status
vercel logs --environment production --status-code 5xx --since 5m
```

Vercel plan limits may restrict eligible targets. A rollback restores old build
output; it does **not** undo Supabase migrations, data writes, RevenueCat/Stripe
state, DNS changes, or other external effects. After rollback, production-domain
auto-assignment is disabled until an approved deployment is promoted; do not
re-enable it during the incident by accident.

### Database recovery

Migration `0008` is forward-only policy/function DDL. `0009` resets existing
`analytics_consent` values and the default to `false`; `0010` backfills quest
timestamps and deduplicates daily content; `0011` changes bookmark uniqueness;
and the reviewed seed upserts public content. An app rollback does not undo any
of those row or schema changes. If verification fails, create a new
higher-numbered reviewed corrective migration; never delete/edit an applied
migration or use `migration repair` to undo SQL. Do not restore production
merely to reverse analytics consent or reviewed content.
Follow the repository
[`Supabase rollout procedure`](SUPABASE_SECURITY_ROLLOUT.md) and Supabase's
official [migration guidance](https://supabase.com/docs/guides/deployment/database-migrations).

Database backup/PITR restore is destructive and is **not** an automatic app
rollback step. Follow Supabase's official
[Database Backups guidance](https://supabase.com/docs/guides/platform/backups)
only after all boxes are checked:

- [ ] Database owner proves actual data corruption/loss and identifies the exact
      safe restore point, expected data-loss window, and verification plan.
- [ ] Rollback authority explicitly confirms the exact production project,
      restore point, business impact, write/checkout freeze, and user
      communication.
- [ ] Both named humans record approval and UTC time in restricted evidence.
- [ ] Provider guidance and current project backup/PITR capability are reviewed.
- [ ] Recovery is executed in the provider-approved workflow; no raw destructive
      command or credential is copied into this runbook.

### Service-worker considerations

- A Vercel rollback can serve an older `/sw.js`, but already-open and installed
  clients may continue running the newer worker/build until update and reload.
- The rollback candidate must pass the same private-route, query-string,
  response-validation, cache-version, and unrelated-cache preservation checks
  in [`QA.md`](QA.md). An older deployment that broadly caches navigations is
  not a known-good privacy rollback target.
- After rollback, test a clean browser and an existing installed iPhone PWA.
  Reload/relaunch twice, confirm the expected worker controls the page, inspect
  Cache Storage, and verify auth/account/API/Plus/query-bearing responses are not
  cached.
- If neither old nor new worker can produce a safe transition, ship a minimal
  reviewed forward-fix worker from a compatible deployment instead of cycling
  rollbacks.

### Verify after rollback

- [ ] Production SHA and domains point to the approved compatible target.
- [ ] `/api/health`, landing, core loop, Bible text, Privacy, and Terms pass.
- [ ] Auth, two-account isolation, sync/reconnect, and Clear My Data pass if
      enabled; otherwise their disabled posture is confirmed.
- [ ] Billing is safely coming soon or uses the approved provider posture; no
      duplicate/unexplained charge signal.
- [ ] Clean and existing PWA clients pass the service-worker checks above.
- [ ] Error rate and support signals return to an accepted baseline.
- [ ] Database migration/RLS evidence is unchanged or a separately approved
      corrective migration has passed all gates.
- [ ] Communications owner posts the approved status update.

### Incident note template

```text
Incident ID: [ID]
Started / detected (UTC): [TIMESTAMPS]
Commander / rollback authority: [FULL NAMES]
Release SHA / deployment: [SHA AND SAFE URL]
Observed impact: [SANITIZED FACTS; NO PRIVATE USER CONTENT]
Trigger: [RUNBOOK TRIGGER]
Containment actions and UTC times: [ACTIONS]
Database compatibility decision: [DECISION + EVIDENCE LINK]
Rollback/forward-fix target: [SAFE URL + SHA]
Recovery verification: [SANITIZED EVIDENCE LINKS]
Support/communications: [COUNT, SEVERITY, APPROVED MESSAGE LINK]
Follow-up owner and due date: [FULL NAME / DATE]
```

## 10. Evidence index and final sign-off

Evidence labels may point to restricted systems, but the label/summary here must
remain safe if the repository becomes public. Do not commit private screenshots
or raw production logs.

| ID | Evidence | Required contents | Owner | UTC / link | Status |
| --- | --- | --- | --- | --- | --- |
| E01 | Release identity | Branch, clean SHA, migration manifest | Release commander | `[UTC / URL]` | OPEN |
| E02 | CI/local verification | Commands, exit codes, test counts, build summary | Deploy owner | `[UTC / URL]` | OPEN |
| E03 | Immutable preview | Vercel URL, inspected SHA, environment posture | Deploy owner | `[UTC / URL]` | OPEN |
| E04 | Migration history | Local/staging/production lists and reviewed migration-only dry run | Database owner | `[UTC / URL]` | OPEN |
| E05 | RLS catalog | Sanitized 27-table policy/function report | Database owner | `[UTC / URL]` | OPEN |
| E06 | Isolation | A/B and anonymous negative-test summary; no sentinel values | Database + QA | `[UTC / URL]` | OPEN |
| E07 | Backup/restore | Backup timestamp/method and isolated restore drill | Database owner | `[UTC / URL]` | OPEN |
| E08 | Privacy telemetry | Consent/DNT/network/error-tool findings | QA + monitoring | `[UTC / URL]` | OPEN |
| E09 | Device/PWA | iPhone and desktop cache/update matrix | QA owner | `[UTC / URL]` | OPEN |
| E10 | Auth | Custom SMTP/DNS, Gmail/iCloud delivery, guest/Google/email/callback/sign-out results | Deploy + QA | `[UTC / URL]` | OPEN |
| E11 | Billing posture | Coming-soon proof or live Web Billing matrix | Deploy + QA | `[UTC / URL]` | OPEN |
| E12 | Accessibility | Keyboard/zoom/motion/contrast/screen-reader results | QA owner | `[UTC / URL]` | OPEN |
| E13 | Winterhill | Both canonical embed origins and CSP results | QA owner | `[UTC / URL]` | OPEN |
| E14 | Legal | Named approval of policies, content, licensing, and claims | Communications owner | `[UTC / URL]` | OPEN |
| E15 | Monitoring/support | Health/error/auth/sync/billing/support alert tests | Monitoring owner | `[UTC / URL]` | OPEN |
| E16 | Rollback rehearsal | Target eligibility, compatibility, PWA transition, recovery | Deploy + database + QA | `[UTC / URL]` | OPEN |
| E17 | Production deployment | Promotion time, domains, release SHA | Deploy owner | `[UTC / URL]` | OPEN |
| E18 | First-hour watch | T+0/5/15/30/60 sanitized summaries | Monitoring owner | `[UTC / URL]` | OPEN |
| E19 | Incident record | Incident/rollback record, if any | Release commander | `[UTC / URL / N/A]` | OPEN |
| E20 | Content mirror | Natural-key comparison, reviewed seed SHA, exact post-push public counts | Database + content | `[UTC / URL]` | OPEN |

Final decisions are valid only after all required evidence is accepted:

| Sign-off | Named human | Decision | UTC | Signature / evidence |
| --- | --- | --- | --- | --- |
| Release commander | `[FULL NAME]` | `[GO / NO-GO]` | `[UTC]` | `[URL]` |
| Deploy owner | `[FULL NAME]` | `[READY / NOT READY]` | `[UTC]` | `[URL]` |
| Database owner | `[FULL NAME]` | `[READY / NOT READY]` | `[UTC]` | `[URL]` |
| QA owner | `[FULL NAME]` | `[PASS / FAIL]` | `[UTC]` | `[URL]` |
| Monitoring owner | `[FULL NAME]` | `[READY / NOT READY]` | `[UTC]` | `[URL]` |
| Communications/legal owner | `[FULL NAME]` | `[APPROVED / NOT APPROVED]` | `[UTC]` | `[URL]` |
| Rollback authority | `[FULL NAME]` | `[AUTHORIZE LAUNCH / HOLD]` | `[UTC]` | `[URL]` |
| T+60 release commander | `[FULL NAME]` | `[STABLE / INCIDENT ACTIVE]` | `[UTC]` | `[URL]` |

The July 31 launch is complete only when the production identity is immutable,
all hard gates pass, the first-hour watch is signed, and any incident is either
closed or explicitly remains under the incident process.
