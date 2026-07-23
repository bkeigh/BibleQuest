# July 31 launch and rollback runbook

This is the execution record for the BibleQuest production launch targeted for
**July 31, 2026**. It coordinates the detailed procedures in
[`DEPLOYMENT.md`](DEPLOYMENT.md), [`QA.md`](QA.md),
[`REVENUECAT.md`](REVENUECAT.md), and
[`SUPABASE_SECURITY_ROLLOUT.md`](SUPABASE_SECURITY_ROLLOUT.md). Privacy-safe
health, browser signals, thresholds, and synthetic routing use
[`OBSERVABILITY.md`](OBSERVABILITY.md). Account sync,
custom SMTP, auth templates, and content reconciliation are executed through
[`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md).
Provider-console and physical-device work can be coordinated with the
guardrailed [`Claude Cowork launch-operator prompt`](CLAUDE_COWORK_LAUNCH_PROMPT.md);
that prompt does not replace any gate in this runbook.

No unchecked item is a pass. `OPEN`, `TBD`, and blank evidence fields are
release blockers unless a gate explicitly documents an approved out-of-scope
posture. Never paste secrets, tokens, database URLs/passwords, private user
content, or sensitive screenshots into this file, chat, CI, tickets, or public
logs. Store production evidence in an access-controlled location and link only
to a sanitized record.

Immediately before the ordered production sequence, the production migration
and content rows may say `APPROVED FOR EXECUTION` only when their exact dry-run,
backup, reviewer, and rollback packet is signed. Production RLS, CAS, and
anonymous-denial subchecks may say `STAGING PASS — PRODUCTION VERIFICATION
PENDING` only when their environment-scoped staging evidence and exact
production verification plan are accepted. Neither special status is `PASS`:
the migration/RLS/CAS/anonymous rows must become `PASS` after step 6, and
content must become `PASS` after step 7, before final READY.

## 1. Release identity

Complete this table at release freeze. The immutable commit must be clean,
pushed, reviewed, and identical to the commit shown by both environment-specific
Vercel deployments. A Preview build is never the production artifact.

| Field | Release value | Evidence | Status |
| --- | --- | --- | --- |
| Target | July 31, 2026 at `[HH:MM ET]` | Approved launch window: `[EVIDENCE URL]` | OPEN |
| Release branch | `main` at freeze | `git branch --show-current` output | OPEN |
| Immutable release commit | `[FULL 40-CHAR SHA]` | CI run and signed release record: `[EVIDENCE URL]` | OPEN |
| Staging rehearsal deployment | `[IMMUTABLE PREVIEW DEPLOYMENT URL]` | Vercel inspection showing the release SHA and confirmed staging Supabase pair: `[EVIDENCE URL]` | OPEN |
| Staged production candidate | `[IMMUTABLE PRODUCTION-ENVIRONMENT DEPLOYMENT URL]` | Same release SHA; Production Supabase pair and other masked Production environment posture; custom domains not yet assigned: `[EVIDENCE URL]` | OPEN |
| Production URL after promotion | Canonical `https://www.biblequest.co`; apex redirects to `www` | DNS/TLS, redirect, metadata, Supabase Site URL/callback, and Vercel `NEXT_PUBLIC_APP_URL`: `[EVIDENCE URL]` | OPEN |
| Database migration set | Exact `0001`–`0012`, immutable `0014`, and reviewed `0015`; `0013` must remain absent; record and verify the checked-in SHA-256 manifest at freeze | Local, staging, and production migration lists: `[EVIDENCE URLS]` | OPEN |
| Production backup | `[UTC TIMESTAMP]`; method `[DAILY BACKUP / PITR / OTHER]`; restore point `[ID WITHOUT CREDENTIALS]` | Provider backup record: `[RESTRICTED EVIDENCE URL]` | OPEN |
| Previous known-good deployment | `[IMMUTABLE VERCEL DEPLOYMENT URL]`, commit `[SHA]` | Rollback rehearsal and PWA/privacy checks: `[EVIDENCE URL]` | OPEN |
| Database compatibility decision | `[BACKWARD COMPATIBLE / APP FIRST / DB FIRST / ROLLBACK RESTRICTED]` | Signed decision: `[EVIDENCE URL]` | OPEN |
| Billing posture | `[COMING SOON / LIVE WEB BILLING]` | RevenueCat/Vercel sanitized evidence: `[EVIDENCE URL]` | OPEN |
| Account launch posture | `[AUTH + SYNC ENABLED / GUEST-ONLY CONTAINED]` | Selected-track evidence and named account-posture-owner plus rollback-authority acceptance: `[EVIDENCE URL]` | OPEN |

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
0012_kjv_bible_translation_default.sql
0014_journey_event_identity.sql
0015_transactional_daily_quest_sync.sql
```

The immutable `0014_journey_event_identity.sql` SHA-256 must remain:

```text
9497b745c5efc0c3f6c4c82e43e57c4fd9b34e8cfae12e6193226d564da50789
```

**Hard stop:** do not launch from a dirty tree, a moving branch reference, an
unreviewed preview, or a deployment whose Git SHA does not exactly match the
frozen release commit.

### Preparation snapshot — July 22, 2026 (not launch sign-off)

These current-run results validate the working tree only. They are not evidence
for the eventual frozen commit and must be rerun at release freeze.

| Check | Current-run result |
| --- | --- |
| Active source | Remediation is integrated on `codex/launch-hardening` and carried by draft PR #15. GitHub's current PR-head SHA is authoritative; every artifact row records the exact SHA it verified. The PR is mergeable with all reported GitHub/Vercel checks green, but it is not yet reviewed, merged to `main`, or frozen and is **not releasable** |
| Source verification | PASS FOR THIS CANDIDATE CHECKOUT — frozen install, lint, TypeScript, 323 Vitest tests, deterministic seed parity, launch-evidence fixture, production build, security-header integration, service-worker tests, production dependency audit, and whitespace checks pass; MUST RERUN against frozen `main` |
| Production health | FAIL CONTRACT — `https://www.biblequest.co/api/health` is reachable but still returns the retired minimal payload rather than `biblequest_observability_v1` |
| Provisional Preview health | PASS FOR THIS PROVISIONAL ARTIFACT — deployment `dpl_3ja5bGrudTmnMQaLyahA4RDpZoWY` at commit `a745a061266ab6bae2dce44bb64a9cb8cbe033f0` returns the expected observability contract, `guest-only`, `coming-soon`, schema `0015`, content `seed-manifest-v1`, and worker `biblequest-v15`; `canonical_origin_matches=false` is expected on Preview. This is not the frozen-`main` staging or Production-environment artifact |
| Production account-sync contract | FAIL — the `0010`, `0011`, `0014`, and `0015` schema plus `biblequest_daily_quest_sync_v1` posture RPC are missing |
| Production migration history | HOLD — the Supabase dashboard's latest recorded migration is `20260710192143 user_quests_shelf` from July 10. Reconcile the complete linked history against the frozen 14-file manifest with the guarded CLI list/dry run before approving any push; dashboard rows and column probes are not permission to execute |
| Production content mirror | FAIL — 84/150 approved free quests with 84 content mismatches/blank Scripture snapshots, 60/180 active daily passages, and 22/38 milestones with 22 content mismatches; both prompt catalogues exactly match at 32 |
| Production auth configuration | PARTIAL — Email and Google providers are enabled, Phone and anonymous sign-in are disabled, email confirmation is enabled, the Site URL is canonical `https://www.biblequest.co`, and 11 redirect entries are configured. This blocks the enabled track until deployed controls, custom SMTP delivery, and template/cross-browser behavior are proven; guest-only instead requires the signed containment/no-traffic track |
| Production backup posture | PASS FOR BACKUP AVAILABILITY / RESTORE DRILL OPEN — the authenticated Supabase organization billing view confirms Pro with Spend Cap enabled. The production Scheduled Backups pane exposes daily physical backups from July 15–22; the latest observed restore point is `2026-07-22 07:56:27 UTC`. Storage objects are excluded and PITR is disabled. This proves an accessible database restore point, not restoration integrity. No production schema/content mutation is permitted until the isolated restore drill and named-owner approval pass |
| Vercel production assignment | HARD HOLD BEFORE MERGE — Production tracks `main`, every `main` commit creates a Production Deployment, and Auto-assign Custom Production Domains is enabled. The current production deployment is `dpl_9jo9xSMx3K2hYVYNLkwVV6gKVL8c` at `b7b15426ba5ff21e707ba859bb5454540f9ee216`; merging PR #15 can move production traffic and is prohibited until the staged-candidate/promotion controls are approved |
| Vercel environment separation | FAIL FOR STAGING REHEARSAL — Production has the expected Supabase variable names, but Preview currently has no project environment variables. The authenticated Supabase inventory has four projects but no BibleQuest staging project, and the BibleQuest project has only Production `main` with no preview or persistent branches. The existing PR Preview therefore does not prove the required distinct staging Supabase pair and cannot satisfy the staging database rehearsal gate |
| Provisional guest browser flow | PASS FOR THIS PROVISIONAL ARTIFACT — on deployment `dpl_3ja5bGrudTmnMQaLyahA4RDpZoWY`, an isolated clean browser completed onboarding → first assignment → `Begin quest` → active state → completion without writing → first milestone/Journey update → full reload persistence → export confirmation → two-step clear/reset back to onboarding. The earlier unchanged click was not reproduced locally or on the current immutable Preview and is superseded by this clean-origin evidence. The isolated test journey was cleared through the app; rerun the complete matrix on the frozen staging artifact |
| Current Vercel runtime errors | PASS FOR CURRENT SEVEN-DAY QUERY — Vercel reported no grouped runtime errors for the project; this does not replace the candidate canary, browser console/network evidence, or staffed alert-routing gate |
| Canonical host | PASS FOR CURRENT DEPLOYMENT — apex redirect, canonical link, and Open Graph URL identify `https://www.biblequest.co`; rerun against the immutable candidate |
| Local Supabase | PASS FOR THIS WORKTREE — local migration history reaches `0015` with immutable `0014` retained and `0013` absent, 15 Journey identity and 59 CAS/contract database tests pass, public-schema lint is clean, the 28-table RLS report passes, and content counts are 150/180/38/32/32; rerun at release freeze |
| Staging, device, legal, monitoring, backup/restore, rollback | NOT RUN / OPEN — PR #15 has a provisional protected Preview, but the frozen-`main` staging rehearsal, staged Production-environment candidate, physical-device/PWA matrix, legal approval, alert routing, isolated restore drill, rollback rehearsal, and named-human manual gates have not run |

### Immediate approval queue — July 22, 2026

Complete these in order. Each external mutation requires the named owner to
approve that exact action; the preparation work above is not blanket approval.

1. **Staging isolation:** obtain approval to create the data-less Preview branch
   `biblequest-launch-rehearsal-2026-07-31`, delete it no later than August 1,
   and configure only Preview/staging with that branch's masked public URL/key
   pair. Supabase's current dashboard quote is `$0.01344/hour` from creation
   until removal (about `$3.23` if continuously billed for ten days), plus any
   usage; branch usage is outside the Spend Cap. Prove its credentials are
   distinct from Production before applying the reviewed migrations and
   synthetic seed. Never copy the Production pair or production data into this
   branch. A deployed Vercel Preview cannot use the local Supabase stack.
2. **Recoverability:** use the existing daily physical backup as the production
   recovery point, then obtain a separate approval for Supabase's `Restore to a
   New Project` drill after its provider screen shows the exact incremental
   cost and target. The clone contains the full database, roles, auth users,
   hashed passwords, and encryption root key; it excludes Storage objects and
   needs manual service reconfiguration. Restrict access, disable any copied
   external-operation extensions, verify aggregate integrity without exposing
   private rows, and delete the clone after accepted evidence. Do not restore
   over Production or apply production migrations/content before this passes.
3. **Safe merge control:** the deploy owner explicitly approves temporarily
   disabling Vercel's `Auto-assign Custom Production Domains`, verifies the
   existing production domains remain on deployment
   `dpl_9jo9xSMx3K2hYVYNLkwVV6gKVL8c`, and only then allows PR #15 to merge.
   Do not pause the project or change `main` branch tracking. Branch tracking
   may still build `main`; it must not move production traffic. Treat the
   resulting domainless Production-environment deployment as the staged
   candidate only if its SHA and masked Production environment pass; otherwise
   create one with `vercel --prod --skip-domain`. Promotion is a later, separate
   approval using the exact deployment ID. See Vercel's official
   [staged deployment workflow](https://vercel.com/docs/cli/deploying-from-cli).
4. **Freeze and rehearse:** after the first three items pass, freeze clean
   `main`, rerun every source check, create the distinct staging and staged
   Production-environment deployments from the same SHA, and execute sections
   5–6. Only then prepare the exact production migration and content approval
   packets for the separate step-6 and step-7 decisions.

#### Current backup and staging decision packet

Authenticated provider inspection on July 22 confirms the `winterhill`
organization is on Pro with Spend Cap enabled and that the BibleQuest project
has accessible daily physical backups. The latest observed backup is
`2026-07-22 07:56:27 UTC`; backups are visible through July 15. Record a fresh
timestamp at execution. Storage objects are not included. See the official
[backup guide](https://supabase.com/docs/guides/platform/backups).

- **Physical backup plus isolated clone drill (recommended):** keep the current
  daily backup as the production recovery point. Supabase's beta `Restore to a
  New Project` flow creates an independent, database-only project from a
  physical backup. It copies schema, data, roles, permissions, auth users,
  hashed passwords, and the encryption root key, but not Storage objects,
  functions, Auth/API configuration, or Realtime configuration. The provider
  shows the clone's incremental monthly cost before creation. The database
  owner must approve that exact cost/target/deletion date and the rollback
  authority must approve handling the restricted production-data clone. See
  [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project).
- **Manual logical backup (optional additional defense):** a complete restorable
  packet needs separate role, schema, and data dumps; the default command
  contains neither data nor custom roles. Store files only in a restricted,
  encrypted location outside the repository, record hashes rather than
  contents, and restore-test them in a separately approved disposable isolated
  environment. Follow the official
  [CLI backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
- **PITR (optional, not the default July 31 choice):** seven-day PITR is
  currently billed at `$0.137/hour`, approximately `$100/month` per project,
  and Supabase says it is outside the Spend Cap. It provides seconds-granularity
  recovery, but it is not required if the named owners accept the daily/manual
  backup recovery window for the contained guest-only launch. Enabling it
  requires a separate price-and-duration approval. See the official
  [PITR usage guide](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery).

For synthetic staging, the authenticated inventory found no existing
BibleQuest staging project or branch. The recommended bounded choice is the
data-less Preview branch `biblequest-launch-rehearsal-2026-07-31`, deleted no
later than August 1. Each branch has its own Supabase instance and API
credentials; it receives no Production data unless someone deliberately loads
it. The current dashboard and official usage guide quote Micro branch compute
at `$0.01344/hour`; other usage may apply and branches are outside the Spend
Cap. Obtain explicit price/duration approval before creation. See Supabase's
[branching overview](https://supabase.com/docs/guides/deployment/branching),
[dashboard branching limitations](https://supabase.com/docs/guides/deployment/branching/dashboard),
and [branch billing](https://supabase.com/docs/guides/platform/manage-your-usage/branching).
Do not use the staging branch as the restore-drill target: synthetic staging and
the restricted production-data clone are separate environments with separate
approvals.

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
| Account posture owner | `[FULL NAME]` | Proves either full auth/sync readiness or guest-only containment and owns any later enablement | `[UTC]` |
| Communications owner | `[FULL NAME]` | Posts launch/incident updates without private user information | `[UTC]` |
| Rollback authority | `[FULL NAME]` | Sole final go/no-go and rollback decision authority | `[UTC]` |

## 3. T-minus timeline

All times are ET unless the evidence itself is timestamped in UTC.

| Time | Date | Required actions | Exit condition |
| --- | --- | --- | --- |
| T-7 days | Fri Jul 24 | Assign roles; choose launch hour, billing posture, and account launch posture; freeze feature scope; inventory environments/domains; start evidence index | Every owner acknowledged; no unowned gate |
| T-6 days | Sat Jul 25 | Clean local DB reset; migration manifest/history review; local RLS report; run automated verification | Local verification passes or defects are assigned |
| T-5 days | Sun Jul 26 | Apply only reviewed pending migrations to staging; always execute the full RLS/grant report and anonymous denials; enabled auth/sync also executes two-user and Clear My Data tests, while guest-only executes containment/no-traffic tests and records active-client rows out of scope | Migration/RLS evidence and the selected account-posture evidence are accepted |
| T-4 days | Mon Jul 27 | Run the selected-posture staging matrix, privacy telemetry inspection, billing posture, accessibility, and Winterhill embed; run auth/sync scenarios only for the enabled track and containment/no-traffic scenarios for guest-only | Every applicable row passes on the immutable preview; active-only rows are explicitly recorded out of scope for an approved guest-only launch |
| T-3 days | Tue Jul 28 | Perform non-production backup restore drill; identify and test rollback-safe Vercel target; rehearse service-worker upgrade/rollback behavior | Restore and rollback gates signed |
| T-2 days | Wed Jul 29 | Legal/content approval; configure health/error/support monitoring; verify production env names and allowed redirect URLs without exposing values | Legal and monitoring gates signed |
| T-24 hours | Thu Jul 30 | Freeze release commit; require CI; create separate immutable staging and staged Production-environment deployments from the same SHA; verify each masked Supabase pair and artifact-specific evidence; record production migration dry run and current backup/PITR posture | All pre-mutation gates pass; exact production migration/content packets are `APPROVED FOR EXECUTION`; production RLS/CAS/anonymous rows are `STAGING PASS — PRODUCTION VERIFICATION PENDING`; only the ordered production execution remains |
| T-4 hours | Fri Jul 31 | Recheck required provider status for the selected postures, owner availability, support channel, previous known-good eligibility, backup freshness, and abort communications | Release commander records READY or NO-GO |
| T-60 minutes | Fri Jul 31 | Start launch bridge; stop unrelated changes; open sanitized evidence/monitoring views; confirm exact production project and deployment | All owners present; no active incident |
| T-30 minutes | Fri Jul 31 | Final go/no-go roll call; review DB compatibility/order; verify current production health and rollback target | Rollback authority signs GO |
| T-0 | Fri Jul 31 `[HH:MM]` | Execute section 7 exactly; timestamp every checkpoint | Promotion completes or abort/rollback begins |
| T+0 to +60 | Fri Jul 31 | Execute first-hour watch in section 8 | Monitoring owner and rollback authority sign stable/incident |

## 4. Hard go/no-go gates

A waiver is not a pass. If a capability is deliberately disabled for launch,
the evidence must prove the production configuration disables it and that the
user experience matches the documented posture.

Select exactly one account launch posture in section 1. For **auth + sync
enabled**, every SMTP, Gmail/iCloud, callback, synthetic sync, transactional
client, and cross-account row remains mandatory. For **guest-only contained**,
those active-behavior rows must be recorded as `OUT OF SCOPE — APPROVED
GUEST-ONLY`, never `PASS`; the account-posture containment gate below must pass
instead. This is a scoped release decision, not a security waiver. Migration
history, database/RLS posture, content, backup/restore, privacy, device/PWA,
billing, legal, monitoring, and rollback gates remain mandatory in both tracks.

| Gate | Pass evidence required | Owner | No-go / recovery action | Status |
| --- | --- | --- | --- | --- |
| Account launch posture | Exactly one track is selected. Enabled requires every active auth/sync gate below. Guest-only requires the frozen source's `ACCOUNT_SYNC_CONTAINED` constant to be `true`; `/api/health` reports `guest-only`; enrollment, sign-in, and account-action controls are absent (a status-only containment notice/page is allowed); callback code/token exchange, middleware session refresh, and browser sync/client creation are no-ops; clean and upgraded browsers show no Supabase Auth, session-refresh, user-table, or sync-RPC network traffic; the complete local-first core loop, persistence, export/clear, offline/reconnect, and PWA update pass; the named account posture owner and rollback authority accept the evidence and residual cached-client risk | Account posture + QA + rollback authority | Hold or roll back on a posture mismatch, visible account action, exchange/refresh/client creation, Supabase auth/sync browser request, local-data loss, or unaccepted residual client; use backend containment when a stale open client makes the browser latch insufficient | OPEN |
| Migration history | Clean local reset; the checked-in 14-file manifest ends at `0015`, `0013` is absent, and immutable `0014` matches its pinned SHA; staging and production `migration list` captured; production migration-only dry run proposes only the reviewed pending set and ends at `0015` | Database owner | Stop on any filename/hash/history mismatch or replay of renamed `0002`-`0006`; follow the forward-only reconciliation procedure; never use `--include-all` or repair as a shortcut | OPEN |
| RLS | Catalog report shows all 28 expected public tables with RLS enabled, only documented policies, correct roles, hardened `purge_user_data`, and authenticated-only daily-quest CAS grants/search paths | Database owner | Stop application rollout; correct with a new higher-numbered migration and repeat all DB gates | OPEN |
| Daily-quest CAS | In both tracks, all 59 local CAS/contract DB tests and deterministic client tests pass and the public posture RPC returns only the fixed contract identity plus `ok: true`. Enabled auth/sync additionally requires staging simultaneous-device, stale-revision, duplicate-retry, rollback, unpick, completion-durability, bounded-conflict, and old-cached-client evidence. Guest-only records those active client scenarios out of scope until enablement | Database + QA owners | Keep account rollout on hold for any overwrite, resurrection, completion loss, retry loop, RLS, contract, or cached-client failure; a guest-only launch may continue only if containment remains proven | OPEN |
| Content mirror | After schema/RLS passes: regenerated seed/manifest have clean diffs and approved digests; seed dry run reports no pending migrations; production readiness proves exact natural-key/content hashes for 150 quests, 180 passages, 38 milestones, and 32/32 prompts | Database + content owners | Keep sync beta-gated; inspect mismatch totals and frozen artifacts; never reset production or paste ad hoc SQL from chat | OPEN |
| Auth email and callback | Enabled auth/sync: custom SMTP DNS/provider verification passes; Supabase Site URL and exact callback use canonical `www`; new and existing users complete real Gmail/iCloud links cross-browser. Guest-only: record active email/provider/callback completion `OUT OF SCOPE — APPROVED GUEST-ONLY`; prove enrollment/sign-in actions are absent (status-only containment copy is allowed) and every callback form exits without exchange or session creation | Deploy + QA owners | Stop invitations; correct provider/template/canonical configuration and retest without exposing single-use tokens, or return to reviewed guest-only containment | OPEN |
| Cross-account isolation | Enabled auth/sync: staging accounts A and B pass both-direction CRUD negative tests; sentinel prayer/reflection text never crosses accounts or appears in logs/evidence. Guest-only: record active account switching/sync `OUT OF SCOPE — APPROVED GUEST-ONLY`; the complete catalog RLS/grant report and anonymous mutation denials still pass, and any reachable authenticated flow fails containment | Database + QA owners | Disable production auth/sync or stop launch; remove fixtures after evidence is accepted | OPEN |
| Backup restore | Fresh production backup/PITR posture recorded; a representative backup has been restored and integrity-checked in an isolated non-production project | Database owner | No production DB change. Escalate provider issue; reschedule. Never test restore over production | OPEN |
| Privacy telemetry | Consent off and Do Not Track produce no Plausible events; operational events contain only the reviewed enum schema; enabled auth/sync emits only expected sanitized canaries, while guest-only emits no auth/sync activity and only the expected worker canary; no prayer/reflection/Scripture/note text, names, email, tokens, cookies, IDs, query strings, or arbitrary URLs appear in analytics, runtime logs, queues, network payloads, or evidence | QA + monitoring owners | Disable the affected integration or stop launch; restrict unsafe evidence, correct the allowlist, and rerun deterministic redaction tests | OPEN |
| Device / PWA QA | Physical iPhone install/standalone/offline/reconnect/update passes; desktop cache inspection matches [`QA.md`](QA.md); mobile and desktop smoke tests pass | QA owner | Stop launch or use an explicitly approved web-only posture that prevents install promotion until fixed | OPEN |
| Billing posture | Exactly one posture below is selected and verified; prices/copy/entitlement/manage flow match; no test key in production | Deploy + QA owners | Set coming-soon posture and redeploy, or stop launch. Never accept real charges through an unverified flow | OPEN |
| Legal approval | Named approver accepts Privacy, Terms, WEB/public-domain posture, sensitive content, supporter claims, refund/cancellation copy, and the 5% giving pledge or removes the claim | Communications owner | Stop launch or remove unapproved claims/features and repeat QA | OPEN |
| Monitoring | [`OBSERVABILITY.md`](OBSERVABILITY.md) health/evidence contract, Vercel error/log view, selected-posture canary, worker signal, selected billing posture, and staffed support path are tested; existing alert routing reaches the named owner. Enabled requires auth/sync synthetics; guest-only requires containment/no-Supabase-auth-or-sync-traffic canaries and treats any auth/sync activity as an incident | Monitoring + account posture owners | Stop launch until sanitized signals and the human response path work; do not change recipients without approval | OPEN |
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
| `pnpm test:observability` | Exit 0; allowlist, redaction, bounded queue, aggregation, worker-version, and threshold tests pass |
| `pnpm test:launch-evidence` | Exit 0; the one-command evidence fixture reports only the intentional guest-only `REVIEW` warning and emits no raw logs. `REVIEW` is accepted only through the selected-track decision below, never silently treated as `PASS` |
| `pnpm build` | Exit 0; Next.js production build completes |
| `pnpm audit --prod` | Full production advisory report is reviewed and linked; every advisory has a disposition |
| `pnpm audit --prod --audit-level high` | Exit 0; no high or critical production advisory |
| `git diff --check` | Exit 0; no whitespace errors |
| `pnpm check:production-readiness` | After the approved production push: all public schema through `0015`, including the bounded CAS RPC/trigger/RLS/grant contract, plus content, health, metadata, and auth-provider checks pass; deployed controls and other manual gates remain separate |

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
supabase test db --local supabase/tests/0014_journey_event_identity.sql
supabase test db --local supabase/tests/0015_daily_quest_cas.sql
docker exec -i supabase_db_BibleQuest \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/evidence/rls_policy_report.sql
```

Pass means all fourteen checked-in migrations apply in the documented order,
with `0013` absent and immutable `0014` matching its pinned SHA. Analytics
consent defaults to and is reset to explicit opt-in (`false`) by `0009`, the
rolling/recent-verse schema from `0010` exists, the Bible preference and
translation-aware bookmark schema from `0011` exists, the new-settings KJV
default from `0012` exists, the Journey identity contract from `0014` exists,
the daily-quest CAS/legacy compatibility contract from `0015` passes, its
content-free public posture RPC reports the fixed contract identity and
`ok: true`, and the
report meets the 28-table RLS gate. Supabase CLI and
a Docker-compatible daemon are required.

For a linked project, retain every history/RLS safeguard in the security
runbook and follow the seed/auth/content sequence in
[`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md). The reviewed dry run must
match the frozen manifest and end at `0015`; a column probe alone is not
migration-history evidence.

### Immutable deployment checks

Use placeholders only after the exact URL is known:

```bash
curl --fail --silent --show-error \
  https://<IMMUTABLE-DEPLOYMENT-URL>/api/health
curl --fail --silent --show-error --head \
  https://<IMMUTABLE-DEPLOYMENT-URL>/sw.js
```

The health body must pass the bounded contract in
[`OBSERVABILITY.md`](OBSERVABILITY.md): correct deployed and rollback SHA,
canonical origin, auth posture, schema/content contract, worker version, and
billing mode. The worker response must include `Cache-Control: no-cache,
no-store, must-revalidate`. Browser verification is still required because
`curl` does not exercise PWA, auth, sync, or billing.

The reported auth posture must exactly match section 1. `configured` requires
the full enabled auth/sync track. `guest-only` requires the complete containment
matrix and named acceptance; it is not evidence by itself that controls,
callbacks, middleware, sync, cached clients, or browser network traffic are
contained. `invalid` is always a hard hold.

## 6. Staging rehearsal matrix

Run every applicable row against the immutable **staging rehearsal deployment**
and the approved staging project. It must share the frozen source SHA with, but
remain a different build from, the staged Production-environment candidate.
Never promote the staging-configured artifact. Use synthetic staging data only.
Record browser/device/version, UTC time, named tester, and a sanitized evidence
link.

An immutable generated URL can prove only a fresh worker install. Prove v14→v15
and rollback behavior on one approved, controlled non-production alias: map the
same alias to a compatible old **staging-built** artifact, install/open the PWA,
then map it to the staging-built candidate and repeat the close/relaunch/cache
checks. Before loading either one, prove both embed the same confirmed staging
Supabase pair and safe billing posture; abort if either embeds Production values.
Record both deployment IDs and every alias change. Never move a production
domain for this rehearsal.
For guest-only, keep the account-posture row and record active auth/sync rows as
`OUT OF SCOPE — APPROVED GUEST-ONLY` with the section 1 decision link; do not
mark them `PASS` or leave them `OPEN`.

Run the sanitized collector against that exact preview, never the aggregate of
all preview deployments:

```bash
BIBLEQUEST_READINESS_APP_URL=https://<IMMUTABLE-PREVIEW-HOST> \
BIBLEQUEST_VERCEL_DEPLOYMENT=<IMMUTABLE-DEPLOYMENT-ID-OR-HOST> \
pnpm evidence:launch --phase=preflight --environment=preview
```

| Scenario | Actions and pass criteria | Evidence | Owner | Status |
| --- | --- | --- | --- | --- |
| Account launch posture | Enabled: health says `configured` and every active auth/sync row below passes. Guest-only: health says `guest-only`; no enrollment/sign-in/account-action controls (status-only containment copy/page is allowed); callback variants, middleware, and sync are no-ops; DevTools/HAR shows no browser Supabase Auth/session/user-table/sync-RPC traffic; named account posture owner and rollback authority accept the result | `[URL]` | `[FULL NAMES]` | OPEN |
| Clean user | New browser profile to `/app`; onboarding under two minutes; complete quest/reflection/journey; verify all primary content is locally available; close/reopen; export and clear data | `[URL]` | `[FULL NAME]` | OPEN |
| Returning user | Seed normal local history in the candidate origin's existing profile, close/reopen, and confirm settings, shelf, prayer/reflection, Bible position, milestones, and export survive | `[URL]` | `[FULL NAME]` | OPEN |
| Two-account switch | Enabled only: A creates unique synthetic prayer/reflection and syncs; sign out; sign in as B; app refuses silent ownership handoff; choose explicit safe resolution; neither account receives the other's data; switch back to A. Guest-only records this active-account row out of scope | `[URL / POSTURE DECISION]` | `[FULL NAME]` | `[OPEN / OUT OF SCOPE — APPROVED GUEST-ONLY]` |
| Offline / reconnect | Visit allowlisted routes; go offline; exact visited routes or honest fallback appear; create local prayer/reflection; force-close/reopen; reconnect. Enabled: sync succeeds once with no duplication/resurrection. Guest-only: local data remains complete and no Supabase auth/sync request occurs before, during, or after reconnect | `[URL]` | `[FULL NAME]` | OPEN |
| iPhone fresh install | Current iOS Safari opens the immutable staging deployment; Add to Home Screen; standalone launch; safe areas; offline relaunch; reconnect; relaunch twice; expected worker controls the page | `[URL]` | `[FULL NAME]` | OPEN |
| Same-origin worker transition | On the approved non-production alias, verify compatible old and candidate staging builds use the same confirmed staging Supabase pair and safe billing posture; load/install old, remap that alias to candidate, close/relaunch twice, inspect worker/cache behavior, rehearse rollback mapping, and record both deployment IDs plus alias changes; abort on Production values | `[URL]` | `[FULL NAME]` | OPEN |
| Auth methods | Enabled: guest exit, Google OAuth, in-context email code, and token-hash browser flow; Gmail and iCloud delivery; installed-PWA close/reopen retention; approved internal `next`; safe rejection of external/protocol-relative/encoded redirects; sign-out clears session UI. Guest-only: record active provider round trips out of scope and prove enrollment/sign-in actions are absent (status-only containment copy is allowed) plus callback forms create no session or provider exchange | `[URL / POSTURE DECISION]` | `[FULL NAME]` | `[OPEN / OUT OF SCOPE — APPROVED GUEST-ONLY]` |
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
   provider status, selected account posture, current production health,
   support readiness, and the exact release/rollback identities.
   - Checkpoint: section 1 is complete; every pre-mutation universal and
     selected-track gate says PASS; active auth/sync rows may say only `OUT OF
     SCOPE — APPROVED GUEST-ONLY` when the containment gate passes; production
     migration/content rows may say only `APPROVED FOR EXECUTION` with their
     exact signed packets; production RLS/CAS/anonymous rows may say only
     `STAGING PASS — PRODUCTION VERIFICATION PENDING` with their accepted
     environment-scoped evidence and verification plan.
   - Abort: missing owner/evidence, active incident in a required selected-track
     provider, dirty/moving SHA.
2. **Confirm the staged production candidate.** Deploy owner verifies that the
   unpromoted Production-environment deployment shows the exact release SHA,
   was built with the confirmed masked Production Supabase pair, and has not
   been assigned the production domains. Rerun health, security-header,
   core-loop, privacy, selected account-posture, PWA, embed, and selected
   billing smoke tests against its immutable generated URL.
   - Checkpoint: immutable URL, Production environment identity, and inspection
     evidence recorded.
   - Abort: Preview/staging artifact selected, domain already moved, SHA or
     environment mismatch, build warning affecting runtime, or failed smoke.
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
5. **Promote and verify the compatibility candidate.** Deploy owner promotes
   the exact already-tested staged Production-environment deployment without a
   rebuild or environment substitution, then verifies the production domains
   point to that deployment ID and SHA. Before any database mutation, verify
   health, canonical metadata, and the selected account posture. Enabled
   auth/sync requires Email + Google controls with no Phone control and a synthetic signed-in core
   restore against the current legacy schema shape. Guest-only requires absent
   account-action controls, no-op callback/middleware/sync behavior, no browser
   Supabase auth/sync traffic, and a complete local-first restore/export/clear
   smoke. On the canonical origin, fully close/relaunch one existing installed
   PWA twice and confirm the candidate worker controls it and obsolete
   BibleQuest caches are gone.
   - Checkpoint: production identifies the release SHA and the selected bridge
     or containment posture works before the database contract changes.
   - Abort/rollback: rebuild or deployment-ID substitution, wrong SHA/alias,
     health or canonical failure, sustained 5xx, selected-posture mismatch, or
     a repeated core-restore failure. Roll
     back the app while the database is still unchanged.
6. **Apply approved database migrations.** Database owner alone executes the
   exact migration-only push, then saves the after-list and RLS report and runs
   the production public CAS posture and anonymous/RLS schema checks. Enabled
   auth/sync also runs the limited signed-in isolation/sync checks; guest-only leaves
   those active client checks out of scope and immediately reconfirms
   containment and zero browser Supabase auth/sync traffic.
   - Checkpoint: production-targeted migration, RLS/grant, CAS posture, and
     anonymous-denial portions of E04/E05/E06 become PASS; no staging result is
     relabeled as production evidence; the linked migration list has no pending
     version through `0015`. Do not continue to content until this passes.
   - Abort: any command error, unexpected row effect, RLS failure, privacy,
     auth, or sync regression. `0009` deliberately resets existing analytics
     consent to `false`; `0010` backfills/deduplicates data; `0011` changes
     bookmark uniqueness; `0012` changes only the new-row edition default;
     `0014` adds Journey source identity; and `0015` backfills daily-quest
     revisions plus installs CAS/legacy triggers.
     Capture failures and stop rather than attempting an ad hoc reversal.
7. **Apply the approved content seed.** Regenerate the seed, require
   `git diff --exit-code -- supabase/seed.sql supabase/seed-manifest.json`,
   record
   `shasum -a 256 supabase/seed.sql supabase/seed-manifest.json`, and review
   `db push --linked --dry-run --include-seed`. It must report no pending
   migration and the separately recorded frozen seed digests. Database owner then runs the exact
   reviewed `db push --linked --include-seed` and records sanitized counts.
   - Checkpoint: content evidence becomes PASS and
     `pnpm check:production-readiness` is green.
   - Abort: dirty/regenerated seed, pending migration, unexpected natural key or
     row effect, count mismatch, or probe failure.
8. **Run the T+0 smoke.** QA owner verifies health, landing, onboarding/core
   loop, Bible text, Privacy/Terms, the selected auth/sync or containment
   posture, billing posture, Winterhill embed, and one clean PWA navigation
   without recording private data.
   - Checkpoint: T+0 row in section 8 is signed.
   - Abort/rollback: security/privacy/cross-account issue triggers immediate
     containment and rollback evaluation; do not wait for the next interval.
9. **Enter first-hour watch.** Freeze unrelated production changes through T+60.
   Release commander alone declares stable after the final sign-off.

## 8. First-hour watch

Use aggregate counts and synthetic canaries. Do not paste user content, emails,
tokens, request bodies, or sensitive screenshots into the incident record.
The monitoring owner runs the same sanitized command for the required early
checkpoints and attaches only its JSON output:

```bash
pnpm evidence:launch --phase=preflight
pnpm evidence:launch --phase=t+0
pnpm evidence:launch --phase=t+5
pnpm evidence:launch --phase=t+15
```

Production is the command default. A live-billing release still returns `HOLD`
unless the billing owner has attached every section 4 gate and the operator
adds `--live-billing-verified` to that exact checkpoint invocation.

For an enabled account launch, missing auth or sync synthetic coverage is a
hard hold. For an approved guest-only launch, the command's intentional
guest-only `REVIEW` may be accepted only when the same checkpoint also contains
the signed account-posture decision, health says `guest-only`, the containment
canary passes, and browser network inspection shows no Supabase auth/sync
traffic. That accepted decision makes the overall checkpoint READY; it does not
change active auth/sync rows from out of scope to pass.

| Time | Required observations | Owner | Evidence / result | Decision |
| --- | --- | --- | --- | --- |
| T+0 | Evidence command reports correct SHA/origin/schema/content/worker/billing/rollback and selected account posture; enabled has auth/sync synthetics, while guest-only has a containment/no-traffic canary and zero auth/sync activity; no new 5xx/CSP errors; support path open | Monitoring + QA + account posture | `[URL / SUMMARY]` | `[CONTINUE / ROLLBACK]` |
| T+5 | Health and landing latency remain normal; Vercel errors stable; enabled remains below auth/sync thresholds, while guest-only remains contained with no auth/sync activity; selected billing posture correct; support reviewed | Monitoring + account posture | `[URL / SUMMARY]` | `[CONTINUE / ROLLBACK]` |
| T+15 | Repeat the evidence command and selected-posture canary; inspect Plausible shape/consent separately if enabled; review RevenueCat/Stripe aggregate signals only if live; triage support | Monitoring + QA | `[URL / SUMMARY]` | `[CONTINUE / ROLLBACK]` |
| T+30 | Repeat all signals; enabled tests a returning session and sync reconnect, while guest-only repeats local reopen/offline/reconnect plus containment/no-traffic; verify no stale-worker/private-cache report; summarize rates against prelaunch baseline | Monitoring + QA | `[URL / SUMMARY]` | `[CONTINUE / ROLLBACK]` |
| T+60 | Repeat all signals; account for every support issue; record incident links; confirm production SHA, migration state, and rollback readiness; release commander requests final signatures | All owners | `[URL / SUMMARY]` | `[STABLE / INCIDENT]` |

Minimum signal set at every interval:

- **Health:** `/api/health`, landing/core navigation, domain/TLS.
- **Account posture:** enabled runs synthetic sign-in/callback/sign-out and
  write/reload/reconnect with aggregate failure trends; guest-only proves absent
  controls, no-op callback/middleware/sync, local reopen/offline/reconnect, and
  zero Supabase auth/sync browser traffic. No private payload inspection.
- **Errors:** Vercel 5xx/runtime/build logs and browser CSP/console errors.
- **Checkout:** coming-soon remains inert, or live success/decline/entitlement/
  management and aggregate provider signals remain healthy.
- **Support:** staffed inbox/channel, number/severity of reports, no user content
  copied into the launch record.

The exact thresholds, safe synthetic, existing-recipient alert test, owner
placeholders, and incident-safe evidence handling are defined in
[`OBSERVABILITY.md`](OBSERVABILITY.md). In summary: two health failures within
two minutes page immediately; enabled auth/sync warns at 3 failures and 10%
after at least 5 attempts and becomes critical at 5 failures and 25%; guest-only
treats any auth/sync activity or Supabase auth/sync browser request as a
containment incident; any sync schema/permission failure or privacy/isolation
issue is an immediate hard stop.

## 9. Rollback and recovery

### Triggers

Rollback authority evaluates immediately; security/privacy isolation failures
do not wait for a numeric threshold.

- Any cross-account data exposure, private text in telemetry/logs/cache, auth
  bypass, unexpected client write to subscriptions, or secret exposure.
- Health failure or sustained production 5xx that prevents a core journey.
- Auth/sync failure burst, destructive merge/resurrection, or inability to
  complete the core loop after reconnect.
- In guest-only posture, any visible account control, credential exchange,
  session refresh, sync-client creation, Supabase auth/sync browser request, or
  local-first data loss.
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
`0012` changes a new-row default; `0014` adds Journey source identity; `0015`
adds daily-quest revisions/CAS and legacy tracking;
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
| E03 | Immutable environment deployments | Staging rehearsal and staged Production-environment URLs; same frozen SHA; confirmed masked Supabase pair and environment posture for each; staging artifact marked never-promote | Deploy owner | `[UTC / URL]` | OPEN |
| E04 | Migration history | Local/staging/production lists and reviewed migration-only dry run | Database owner | `[UTC / URL]` | OPEN |
| E05 | RLS catalog | Sanitized 28-table policy/function report plus daily-quest CAS grants/triggers | Database owner | `[UTC / URL]` | OPEN |
| E06 | Isolation | Enabled: A/B and anonymous negative-test summary with no sentinel values. Guest-only: active A/B client behavior marked out of scope, plus mandatory 28-table RLS/grant and anonymous mutation-denial evidence | Database + QA | `[UTC / URL]` | OPEN |
| E07 | Backup/restore | Backup timestamp/method and isolated restore drill | Database owner | `[UTC / URL]` | OPEN |
| E08 | Privacy telemetry | Consent/DNT findings plus operational allowlist/redaction/queue evidence | QA + monitoring | `[UTC / URL]` | OPEN |
| E09 | Device/PWA | iPhone and desktop cache/update matrix | QA owner | `[UTC / URL]` | OPEN |
| E10 | Auth | Enabled: custom SMTP/DNS, Gmail/iCloud delivery, guest/Google/email/callback/sign-out results. Guest-only: active provider behavior marked out of scope and linked to E21 containment | Deploy + QA | `[UTC / URL]` | OPEN |
| E11 | Billing posture | Coming-soon proof or live Web Billing matrix | Deploy + QA | `[UTC / URL]` | OPEN |
| E12 | Accessibility | Keyboard/zoom/motion/contrast/screen-reader results | QA owner | `[UTC / URL]` | OPEN |
| E13 | Winterhill | Both canonical embed origins and CSP results | QA owner | `[UTC / URL]` | OPEN |
| E14 | Legal | Named approval of policies, content, licensing, and claims | Communications owner | `[UTC / URL]` | OPEN |
| E15 | Monitoring/support | Sanitized health/error/worker/billing evidence, selected-posture synthetic or containment/no-traffic canary, plus existing-recipient alert acknowledgement | Monitoring owner | `[UTC / URL]` | OPEN |
| E16 | Rollback rehearsal | Target eligibility, compatibility, PWA transition, recovery | Deploy + database + QA | `[UTC / URL]` | OPEN |
| E17 | Production deployment | Promotion time, domains, release SHA | Deploy owner | `[UTC / URL]` | OPEN |
| E18 | First-hour watch | T+0/5/15/30/60 sanitized summaries | Monitoring owner | `[UTC / URL]` | OPEN |
| E19 | Incident record | Incident/rollback record, or a timestamped `N/A — NO INCIDENT` closure at T+60 | Release commander | `[UTC / URL / N/A — NO INCIDENT]` | OPEN |
| E20 | Content mirror | Natural-key comparison, reviewed seed SHA, exact post-push public counts | Database + content | `[UTC / URL]` | OPEN |
| E21 | Account launch posture | Selected track; health posture; enabled-track evidence or guest-only controls/callback/middleware/sync/no-browser-traffic/local-first matrix; residual cached-client decision; named account posture owner and rollback-authority acceptance | Account posture + rollback authority | `[UTC / URL]` | OPEN |

Final decisions are valid only after all universal evidence and all evidence for
the selected account posture are accepted. In a guest-only launch, E10 and the
active A/B portion of E06 say `OUT OF SCOPE — APPROVED GUEST-ONLY`; E21 must say
PASS. If no incident occurred, E19 says `PASS` with evidence `N/A — NO
INCIDENT`; it never remains OPEN. No other privacy or security evidence changes
scope.

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
all universal and selected-posture hard gates pass, every active-only exclusion
is explicitly recorded against an approved guest-only decision, the first-hour
watch is signed, and any incident is either closed or explicitly remains under
the incident process.
