# Account sync recovery and production reconciliation

Use this runbook when a signed-in user sees **“We couldn’t restore your
journey.”** It separates work Codex can verify from changes that require the
founder to authenticate in Supabase, Resend, DNS, or Vercel.

The user’s screenshot from July 19, 2026 is an account-sync failure after a
successful sign-in. It is not evidence of a bad connection and it is not an
SMTP failure: the session exists, but the deployed client cannot complete its
initial database pull.

## Historical production finding

A read-only check using the browser-safe Supabase publishable key found:

| Contract | Repository expects | Production observed July 19 | Status |
| --- | --- | --- | --- |
| Rolling quest columns | `user_daily_quests.picked_at`, `expires_at` (`0010`) | Missing | BLOCKED |
| Recent verses | `user_recent_verses` (`0010`) | Missing | BLOCKED |
| Bible preference | `user_settings.preferred_bible_translation` (`0011`) | Missing | BLOCKED |
| Edition bookmarks | `verse_bookmarks.translation_key` (`0011`) | Missing | BLOCKED |
| Approved quests | 150 | 84 | DRIFTED |
| Active daily passages | 180 | 60 | DRIFTED |
| Active milestones | 38 | 22 | DRIFTED |
| Prayer / reflection prompts | 32 / 32 | 32 / 32 | MATCHED |
| Auth methods | Email + Google on; phone off | Email + Google on; phone off | MATCHED |
| Canonical metadata | `https://www.biblequest.co` | `www` canonical and Open Graph URL | MATCHED |
| Auth email delivery | Custom SMTP with a verified sender | Not proven by the public readiness probe | MANUAL GATE |

On July 23, 2026, a contained `biblequest-v15` release was promoted before any
database write. The exact production history was fetched and reviewed, then
the repository SQL for `0008` through `0015` and the idempotent launch seed were
applied under new forward-only production versions. The original `0015`
readiness probe now passes every schema, content, and provider-configuration
check. Account sync remains contained while `0016` through `0022`, signed
restore, real email delivery, and cached-client gates are completed.

Run the same non-mutating probe at any time:

```bash
pnpm check:production-readiness
```

The command reads `.env.local` when present, uses only
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and prints no
keys, URLs, rows, or user content. A failure is expected until the provider-side
steps below are complete. It does **not** prove migration history, SMTP delivery,
Google/email round trips, RLS isolation, backup recovery, or signed account
sync.

## Choose the account release track

The launch record must select exactly one track:

- **Auth + sync enabled:** complete every founder action in this runbook,
  including custom SMTP, real Gmail and iCloud delivery/callbacks, both-direction
  A/B isolation, transactional/cached-client sync, and signed restore evidence.
- **Guest-only contained:** omit `NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED` or set it
  to anything except the exact string `true`; require health to
  report `guest-only`; prove enrollment, sign-in, and account-action controls
  are absent (a status-only containment notice/page is allowed); customer
  callback exchange, middleware session refresh, and sync/client creation are
  no-ops; prove clean and upgraded customer browsers make no Supabase
  Auth/session/user-table/sync-RPC requests; and prove the complete local-first
  core, persistence, export/clear, offline/reconnect, and PWA update paths. The
  independently gated operator console may authenticate only on its dedicated
  host or internal console path and remains outside customer account sync. The
  named account posture owner and rollback authority must accept the evidence
  and any stale-client/backend containment decision.

Guest-only does not turn active auth or sync tests into passes. Record SMTP,
Gmail/iCloud, provider callback, signed-in sync, and A/B client behavior as
`OUT OF SCOPE — APPROVED GUEST-ONLY` for that release. Migrations through
`0022`, the complete RLS/grant report and anonymous denial checks, canonical
content, backup/restore, privacy, device, legal, monitoring, and rollback gates
remain mandatory. Finish every deferred active-account test before a later
release enables auth or sync.

## Founder action 1 — make auth email production-ready

This action is mandatory for the auth + sync enabled track. It is intentionally
out of scope for an approved guest-only release and remains a hard prerequisite
for any later account enablement.

Supabase’s built-in sender is a testing service with restricted recipients,
low rate limits, and no delivery SLA. Configure a custom sender before inviting
more testers.

This is the most likely explanation when a non-team tester requests a link and
nothing reaches their inbox: without custom SMTP, Supabase currently refuses
delivery to addresses that are not members of the project’s organization. The
browser can report that an OTP request was accepted, but that is not proof of
SMTP delivery. BibleQuest labels this state **“requested,”** waits for the
provider’s default 60-second per-address resend window, and surfaces bounded
references such as `AUTH-EMAIL-SETUP` and `AUTH-RATE-LIMIT`; provider setup is
still required.

1. Open [Resend Domains](https://resend.com/domains), add an auth-only subdomain
   such as `auth.biblequest.co`, and add the exact SPF and DKIM records Resend
   gives you. Add DMARC after SPF and DKIM verify. Do not invent or copy DNS
   values from this repository.
2. Open [Resend Integrations](https://resend.com/settings/integrations), choose
   **Connect to Supabase**, select the production project and verified domain,
   create a sender such as `BibleQuest <hello@auth.biblequest.co>`, and complete
   the SMTP integration.
3. In Supabase → Authentication → Rate Limits, choose a conservative invitation
   limit that fits the beta. Do not raise it merely to hide a retry loop.
4. Send a real magic link to Gmail and iCloud test inboxes. Record delivery,
   spam placement, link completion, and the matching Supabase Auth log entry;
   never save the link token in launch evidence.
5. Repeat with an address that is **not** a Supabase organization member. An
   organization-member-only success does not prove production delivery.

Provider references:

- [Supabase custom SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp)
- [Resend + Supabase setup](https://resend.com/docs/knowledge-base/getting-started-with-resend-and-supabase)
- [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction)

The repository’s old `RESEND_API_KEY` placeholder was for a future lifecycle
email integration and was never read by Supabase Auth. SMTP credentials belong
in the Supabase/Resend integration, not in Vercel and not in `.env.local`.

After the provider is connected, use Supabase → Authentication → Logs and the
Resend delivery log together when diagnosing a missing message. A successful
Auth request with no Resend event points to Supabase/provider configuration; a
Resend event marked bounced, suppressed, or delivered points to sender/domain
reputation or the receiving mailbox. Do not paste email addresses or magic-link
tokens into issue trackers.

## Founder action 2 — verify email links and advertised providers

This action is mandatory for the auth + sync enabled track. In guest-only, do
not advertise these providers; execute the no-control/no-exchange callback
matrix instead and leave the provider round trips explicitly out of scope.

1. Open [Supabase Auth providers](https://supabase.com/dashboard/project/iacnjqnssovaaojswjoh/auth/providers).
   Keep Email and Google enabled. Keep Phone disabled; the app does not advertise
   SMS sign-in.
2. Open [Supabase URL Configuration](https://supabase.com/dashboard/project/iacnjqnssovaaojswjoh/auth/url-configuration).
   Set the Site URL to `https://www.biblequest.co` and allow the three exact
   production callback URLs the current app emits:

   ```text
   https://www.biblequest.co/auth/callback?next=%2Fapp
   https://www.biblequest.co/auth/callback?next=%2Fapp%2Fquests
   https://www.biblequest.co/auth/callback?next=%2Fonboarding
   ```

   Keep only deliberate local and team-scoped preview callbacks alongside
   them; do not use a broad production wildcard.
   Production already redirects apex to `www`, so `www` is the canonical host.
   In Vercel, set `NEXT_PUBLIC_APP_URL=https://www.biblequest.co`, redeploy, and
   confirm canonical and Open Graph metadata now use `www` too.
3. Open [Supabase email templates](https://supabase.com/dashboard/project/iacnjqnssovaaojswjoh/auth/templates).
   Publish the exact checked-in
   [`confirmation.html`](../supabase/templates/confirmation.html) and
   [`magic-link.html`](../supabase/templates/magic-link.html) bodies. Each
   template includes `{{ .Token }}` for in-context PWA verification and must
   not include `{{ .TokenHash }}`, `{{ .RedirectTo }}`, or
   `{{ .ConfirmationURL }}`. A portable bearer link is not bound to the
   browser that requested sign-in and can create a login-CSRF/session-swap
   path, so the server callback rejects it.

   Production was reconciled and read back byte-for-byte against both checked-in
   templates on August 10, 2026. Re-run this comparison after any dashboard edit.

Do not put `{{ .Token }}` in the subject, where a locked-screen notification
could expose it. Keep the code in the email body. A fresh iOS 17.2+ Home Screen
install copies existing browser cookies once, but Safari and the installed app
do not keep storage synchronized afterward. Returning PWA users must request
the email from the PWA, leave it open, and enter the code there. Opening the
email in Mail never transfers a session into Safari or the installed PWA.

Do not hard-code `SiteURL`, `/app`, or an email verification link in these
templates. Test each saved template with a newly created beta account and an
existing account, including the numeric code inside an installed PWA. The code
must complete only in the browser or app where it is entered. See
[Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
and [redirect URL guidance](https://supabase.com/docs/guides/auth/redirect-urls).

The callback maps expired, malformed, provider, and same-browser PKCE failures
to safe user-facing reasons and always sends `Cache-Control: private, no-store`.
It never puts raw provider error text or a token in the destination URL.

## Founder action 3 — reconcile staging, then production schema

Never run `supabase db reset --linked` against production. Never use
`--include-all` or `supabase migration repair` for this release.
The old `0002`–`0006` filenames were renumbered in Git, so migration history must
be reviewed rather than guessed.

### Staging

```bash
supabase link --project-ref <STAGING_PROJECT_REF>
supabase migration list --linked
supabase db push --linked --dry-run
```

Stop if the dry run proposes replaying any renamed migration. The July 19 probe
proved only that `0010` and `0011` schema was absent; it did not prove history.
The repository candidate now continues with `0012`, immutable `0014`, and
`0015`, with no `0013`. The linked migration list—not a column probe—is
authoritative, and every proposed version must match that exact forward order.
After review:

```bash
supabase db push --linked
supabase migration list --linked
```

Run `supabase/evidence/rls_policy_report.sql` and the anonymous checks on staging
for both tracks. Auth + sync enabled additionally requires the complete two-user
negative test, Clear My Data, and offline/reconnect sync. Guest-only records
those active-client checks out of scope until enablement and proves containment
and zero browser Supabase auth/sync traffic instead.

### Production

Production has a preserved timestamp history that predates the repository's
renumbered `0001`–`0015` files. A normal push from the repository root is
therefore expected to stop. Never bypass that stop with `--include-all` or
`migration repair`.

The reviewed production mapping applied on July 23 is:

| Production version | Repository SQL |
| --- | --- |
| `20260723150000` | `0008_reassert_rls_and_purge.sql` |
| `20260723150100` | `0009_analytics_consent_opt_in.sql` |
| `20260723150200` | `0010_rolling_quest_windows_and_recent_verses.sql` |
| `20260723150300` | `0011_bible_translation_preference.sql` |
| `20260723150400` | `0012_kjv_bible_translation_default.sql` |
| `20260723150500` | `0014_journey_event_identity.sql` |
| `20260723150600` | `0015_transactional_daily_quest_sync.sql` |
| `20260723150700` | `supabase/seed.sql` |

Future production work must use an isolated checkout, fetch the authoritative
remote history, remove only the checkout's unmatched numeric files, and add
new versions above the last remote version that point to the byte-identical,
reviewed repository SQL. Capture `migration list` and a dry run, review every
proposed filename, then push from that isolated checkout. Do not commit fetched
remote history or temporary symlinks over the canonical staging migrations.

1. Open [Supabase backups](https://supabase.com/dashboard/project/iacnjqnssovaaojswjoh/database/backups/scheduled)
   and record a current backup/PITR decision. A backup listing is not a restore
   drill; keep the non-production restore test as a separate launch gate.
2. Link the explicitly confirmed production project, then capture the migration
   list and dry run exactly as above.
3. Before approving `0010`, run this privileged public-content preflight in the
   SQL editor and save only the keys/counts. `0010` deliberately removes older
   duplicate daily-passage rows before adding its natural-key index; a non-empty
   result is a data-change review, not an automatic failure:

   ```sql
   select book_slug, chapter, verse_start, verse_end, count(*) as copies
   from public.daily_verses
   group by book_slug, chapter, verse_start, verse_end
   having count(*) > 1
   order by copies desc, book_slug, chapter, verse_start, verse_end;
   ```

4. Have a second review confirm the project reference and that only the intended
   forward migrations are proposed. Confirm the live compatibility release and
   the recorded rollback deployment both understand the `0011` five-column
   bookmark key; an older cached client can no longer use the retired
   four-column conflict target after `0011` lands. Include a full PWA
   close/relaunch/update test in this approval. Require `0014` to match SHA-256
   `9497b745c5efc0c3f6c4c82e43e57c4fd9b34e8cfae12e6193226d564da50789`
   before approving `0015`; any `0013` proposal is a hard stop.
5. Run the schema-only guarded sequence below, pause after the dry run for
   review, then immediately recapture the migration list and rerun the RLS
   evidence report in the
   [Supabase SQL Editor](https://supabase.com/dashboard/project/iacnjqnssovaaojswjoh/sql/new):

   ```bash
   supabase link --project-ref iacnjqnssovaaojswjoh
   supabase migration list --linked
   supabase db push --linked --dry-run
   # Stop here. Review the exact migrations, project ref, and backup.
   supabase link --project-ref iacnjqnssovaaojswjoh
   supabase migration list --linked
   supabase db push --linked
   supabase migration list --linked
   ```

If any migration fails, stop. Do not edit an already-applied migration or reset
production. Correct a verified defect with a new higher-numbered migration.

### Guest-only containment release order

The launch-hardening bundle derives `ACCOUNT_SYNC_CONTAINED` from the
fail-closed `NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED` build flag. Unless that flag is
exactly `true`, current clients hide enrollment, the auth callback refuses
to exchange codes or token hashes, the request proxy does not refresh Supabase
sessions, and the browser sync engine stops before it creates a client. Keep the
latch closed throughout schema, content, RLS, and isolation remediation and for
the entire guest-only launch/watch window.

This web release cannot stop JavaScript that is already running in an old open
tab or installed PWA window. The v20 worker evicts old BibleQuest caches after it
installs and activates, but it does not forcibly reload an already controlled
page; that page can retain its old authenticated sync behavior until it reloads
or closes. If the incident requires an immediate zero-write boundary, use a
separately reviewed backend session/write containment before the web deploy and
retain it until current-worker coverage is accepted.

Use this order:

1. Freeze account rollout and deploy the immutable contained bundle before any
   production migration or content write.
2. Verify the health endpoint reports the intended guest-only posture, the
   active worker reports v20, account-action controls are absent (status-only
   containment copy is allowed), callbacks do not
   exchange credentials, normal proxy requests do not refresh sessions, and
   the browser sync path does not create a Supabase client.
3. Reload browser clients and fully close/relaunch installed PWAs twice. Record
   any remaining older-worker observation as residual exposure; do not declare the
   incident contained solely because the deployment alias changed.
4. With the latch still closed, apply and verify the approved migrations through
   `0022`, then seed content separately and complete the full RLS/grant,
   anonymous denial, backup/restore, content, privacy, device, legal, monitoring,
   and rollback evidence. Complete the local-first core/persistence/export/clear/
   offline matrix and record a sanitized browser request summary with no
   Supabase Auth/session/user-table/sync-RPC traffic. Mark two-account,
   concurrent-device, and cached-client behavior out of scope for this release.
5. Re-enable accounts only by flipping the single latch in a new reviewed,
   immutable release. Advance the worker version again, repeat the reload/relaunch
   and callback/proxy/sync checks, complete every deferred SMTP, Gmail/iCloud,
   A/B isolation, and transactional/cached-client test, and keep the backend
   boundary until that release is accepted.

### Transactional daily-quest rollout (`0015`)

`0015_transactional_daily_quest_sync.sql` is a separate forward-only schema
change after the immutable `0014_journey_event_identity.sql` release. The CAS
work was originally reviewed under the unused local name `0013`, but no linked
history artifact proved that inserting below tracked `0014` was safe, so `0013`
must remain absent. `0015` adds an owner-RLS revision table, an
authenticated compare-and-swap RPC, a legacy-write revision trigger, and an
updated `purge_user_data`. Its anonymous readiness RPC returns only the fixed
contract identity plus a boolean derived from the live RLS/grant/RPC/trigger
posture. It does not seed content or read prayer, reflection, bookmark,
recent-verse, profile, or daily-quest rows.

Roll out the compatible web bundle first. Before `0015` exists, that bundle
falls back only when PostgREST reports the exact revision table or RPC missing;
all policy, permission, and malformed-response errors still stop sync. After
`0015`, old cached bundles may continue their owner-RLS direct writes. The
triggers preserve completed rows and make each changed day visible to new
clients as a revision change. The recorded rollback deployment must retain that
direct-write compatibility and service-worker cache identity `biblequest-v14`.

Required local and staging evidence:

```bash
supabase db reset
supabase test db --local supabase/tests/0014_journey_event_identity.sql
supabase test db --local supabase/tests/0015_daily_quest_cas.sql
supabase db lint --local --schema public --level warning --fail-on warning
docker exec -i supabase_db_BibleQuest \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off \
  < supabase/evidence/rls_policy_report.sql
```

Before enabling auth + sync, require the same staging migration-history
safeguards as above, then prove:

1. Two devices starting from the same revision produce one bounded conflict;
   the merged retry retains both unfinished picks and every completed pick.
2. A stale revision and an injected post-delete failure leave canonical rows
   and the revision unchanged.
3. Replaying the same request UUID after a lost response does not duplicate a
   row or advance the revision twice.
4. An empty day removes unfinished picks, never removes completed history, and
   `purge_user_data` removes the empty-day revision metadata.
5. Accounts A and B cannot read each other’s revision or assignment rows or
   perform either-direction CRUD; anonymous mutation RPC execution is denied.
6. A fully closed/reopened cached PWA on the previous bundle can still pick and
   unpick, and a fully closed/reopened current PWA detects that legacy change.
7. `daily_quest_sync_contract` called anonymously returns exactly
   `{"contract":"biblequest_daily_quest_sync_v1","ok":true}` with no rows,
   identifiers, policy text, grants, or failure diagnostics.

An **auth + sync enabled** production launch remains a hard no-go until the
compatibility SHA is live, SMTP and the signed restore bridge have been
retested, a current backup/PITR point and isolated restore rehearsal are
accepted, staging passes the complete active-client matrix above, and the
production dry run proposes exactly the independently reviewed pending set. A
**guest-only contained** launch may record the active-client matrix out of scope
only after the separate containment matrix and named acceptance pass; backup,
restore, migration, RLS/grant, anonymous denial, and public CAS posture remain
hard gates. Stop on any project, history, schema, backup, restore, RLS, conflict,
resurrection, containment, or data-loss disagreement. Applying `0015` is a
production write and requires a fresh explicit approval; never combine it with
the canonical content seed, `--include-all`, reset, or migration repair.

## Founder action 4 — reconcile the content mirror

The runtime app currently reads reviewed content bundled in the repository;
the database tables are an operational mirror. The July 19 read-only comparison
checked the natural keys themselves, not only row counts: production had no
extra quest, daily-passage, or milestone keys, only missing canonical rows. The
checked-in idempotent seed can therefore upsert the missing content after `0010`
creates the daily-passage conflict key.

1. Regenerate and verify the deterministic file locally:

   ```bash
   node scripts/build-supabase-seed.mjs
   git diff --exit-code -- supabase/seed.sql supabase/seed-manifest.json
   shasum -a 256 supabase/seed.sql supabase/seed-manifest.json
   ```

2. Review `supabase/seed.sql` and its exact-content
   `supabase/seed-manifest.json` from the frozen release SHA. They must describe
   150 quests, 180 daily passages, 38 milestones, and 32 prayer/reflection
   prompts.
3. Rehearse the following seed-only phase on staging after its schema and RLS
   verification passes. Then relink the exact production project and repeat it.
   The dry run must report no pending migrations; compare the seed file to the
   separately recorded reviewed SHA-256 digest:

   ```bash
   supabase link --project-ref <CONFIRMED_TARGET_PROJECT_REF>
   supabase migration list --linked
   supabase db push --linked --dry-run --include-seed
   # Stop here. Confirm no migration is pending and approve the recorded digest.
   supabase link --project-ref <CONFIRMED_TARGET_PROJECT_REF>
   supabase migration list --linked
   supabase db push --linked --include-seed
   ```

   Use the staging reference in rehearsal. For production, replace the
   placeholder both times with `iacnjqnssovaaojswjoh`. Do not use a remote
   database reset and do not paste content from chat. If a migration appears in
   this phase, stop and return to Founder action 3; schema and content approval
   must remain separate.
4. Run these sanitized integrity queries:

   ```sql
   select 'quests' as content, count(*) as active_count
   from public.quest_templates
   where is_active and review_status = 'approved'
   union all
   select 'daily_verses', count(*)
   from public.daily_verses where is_active
   union all
   select 'milestones', count(*)
   from public.milestones where is_active
   union all
   select 'prayer_prompts', count(*)
   from public.prayer_prompts where is_active
   union all
   select 'reflection_prompts', count(*)
   from public.reflection_prompts where is_active;

   select
     count(*) filter (
       where is_active
         and review_status = 'approved'
         and is_premium
     ) as active_approved_premium_quests,
     count(*) filter (
       where is_active
         and review_status = 'approved'
         and nullif(btrim(scripture_text_snapshot), '') is null
     ) as blank_scripture_snapshots
   from public.quest_templates;

   select count(*) as duplicate_daily_passage_keys
   from (
     select book_slug, chapter, verse_start, verse_end
     from public.daily_verses
     group by book_slug, chapter, verse_start, verse_end
     having count(*) > 1
   ) duplicates;
   ```

Expected counts are `150`, `180`, `38`, `32`, and `32`. This query reads no user
data. All three integrity counts must be zero. The readiness probe also compares
every visible canonical natural key and reviewed field to
`supabase/seed-manifest.json`; matching row counts alone are not a pass. The seed
changes only reviewed content tables; it is not a substitute for the RLS report,
migration-history evidence, or, when auth + sync is enabled, signed two-user
tests.

## Founder action 5 — prove account sync is ready to enable

This action is mandatory before auth + sync is enabled. It is not a guest-only
launch gate; guest-only instead completes and signs the containment evidence in
the release runbook while leaving every active-account item below out of scope.

1. Run `pnpm check:production-readiness`; every automated line must pass.
2. Create fresh staging/production test accounts A and B with synthetic content.
3. As A, create a quest pick, prayer, reflection, bookmark, recent verse, and
   Bible preference. Reload and sign in on a second browser; all must restore.
4. Sign out, sign in as B, and confirm none of A’s identifiers or sentinel text
   appears. Repeat in the opposite direction.
5. Create content offline, reconnect, and verify one copy survives. Delete a
   prayer/bookmark, reconnect, and verify it does not resurrect.
6. Run Clear My Data as A; confirm A’s user-owned rows are gone, B is unchanged,
   and A’s auth account remains.
7. Retest the original iPhone path from Mail into Safari/PWA. The restore screen
   must not recur, and no private text may appear in logs or screenshots.

The current source replaces daily assignments through the transactional `0015`
RPC with an opaque per-day revision and idempotent request UUID. That source
change is not production evidence. Keep account sync in a controlled beta until
the compatibility release is deployed, staging and production both show
`0014` followed by `0015` in migration history, the CAS/RLS evidence passes,
and the complete
concurrent-device pick/unpick/completion/cached-client matrix is accepted.

Only then mark account sync **green** in the launch Console. SMTP delivery,
schema compatibility, and cross-account isolation are three separate gates;
passing one never implies the others passed.
