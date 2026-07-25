# Account sync recovery and production reconciliation

Use this runbook when a signed-in user sees **“We couldn’t restore your
journey.”** It separates work Codex can verify from changes that require the
founder to authenticate in Supabase, Resend, DNS, or Vercel.

The user’s screenshot from July 19, 2026 is an account-sync failure after a
successful sign-in. It is not evidence of a bad connection and it is not an
SMTP failure: the session exists, but the deployed client cannot complete its
initial database pull.

## Current production finding

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

Run the same non-mutating probe at any time:

```bash
pnpm check:production-readiness
```

The command reads `.env.local` when present, uses only
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and prints no
keys, URLs, rows, or user content. A failure is expected until the provider-side
steps below are complete. It does **not** prove migration history, SMTP delivery,
Google/email round trips, RLS isolation, backup recovery, or signed account
sync.

## Founder action 1 — make auth email production-ready

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
   The app passes an exact callback URL containing the approved `next` path as
   `emailRedirectTo`; Supabase exposes that value to the template as
   `{{ .RedirectTo }}`. Append the token fields to that value so the destination
   survives and the link can complete on another browser or installed PWA.

Use this link in each email template that currently uses Supabase's confirmation
URL:

```html
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email">
  Open BibleQuest
</a>
```

Do not hard-code `SiteURL`, `/app`, or a separate magic-link `type` in this
template: the current callback contract supplies the redirect and verifies the
email token with `type=email`. Test each saved template with a newly created
beta account and an existing account. The token is single-use. Email-link
scanners can consume single-use links, so record that risk and consider a
user-confirmed intermediate page if it appears in real testing. See
[Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
and [redirect URL guidance](https://supabase.com/docs/guides/auth/redirect-urls).

The callback maps expired, malformed, provider, and same-browser PKCE failures
to safe user-facing reasons and always sends `Cache-Control: private, no-store`.
It never puts raw provider error text or a token in the destination URL.

## Founder action 3 — reconcile staging, then production schema

Never run `supabase db reset --linked` against production. Never use
`--include-all` or migration repair just to make an unexpected dry run pass.
The old `0002`–`0006` filenames were renumbered in Git, so migration history must
be reviewed rather than guessed.

### Staging

```bash
supabase link --project-ref <STAGING_PROJECT_REF>
supabase migration list --linked
supabase db push --linked --dry-run
```

Stop if the dry run proposes replaying any renamed migration. Against the
currently observed schema, the intended new work is `0010` and `0011`, but the
linked migration list—not a column probe—is authoritative. After review:

```bash
supabase db push --linked
supabase migration list --linked
```

Run `supabase/evidence/rls_policy_report.sql`, the anonymous checks, the complete
two-user negative test, Clear My Data, and offline/reconnect sync on staging.

### Production

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
   close/relaunch/update test in this approval.
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

### Transactional daily-quest rollout (`0015`)

`0015_transactional_daily_quest_sync.sql` is a separate forward-only schema
change after the authoritative `0014_journey_event_identity.sql`. It adds an owner-RLS revision table, an
authenticated compare-and-swap RPC, a legacy-write revision trigger, and an
updated `purge_user_data`. It does not seed content or read prayer, reflection,
bookmark, recent-verse, or profile rows.

Roll out the compatible web bundle first. Before `0015` exists, that bundle
falls back only when PostgREST reports the exact revision table or RPC missing;
all policy, permission, and malformed-response errors still stop sync. After
`0015`, old cached bundles may continue their owner-RLS direct writes, and the
trigger makes each affected day visible to new clients as a revision change.
The recorded rollback deployment must retain that direct-write compatibility.

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

On staging, require the same migration-history safeguards as above, then prove:

1. Two devices starting from the same revision produce one bounded conflict;
   the merged retry retains both unfinished picks and every completed pick.
2. A stale revision and an injected post-delete failure leave canonical rows
   and the revision unchanged.
3. Replaying the same request UUID after a lost response does not duplicate a
   row or advance the revision twice.
4. An empty day removes unfinished picks, never removes completed history, and
   `purge_user_data` removes the empty-day revision metadata.
5. Accounts A and B cannot read each other’s revision or assignment rows or
   perform either-direction CRUD; anonymous execution is denied.
6. A fully closed/reopened cached PWA on the previous bundle can still pick and
   unpick, and a fully closed/reopened current PWA detects that legacy change.

Production remains a hard no-go until the compatibility SHA is live, SMTP and
the signed restore bridge have been retested, a current backup/PITR point and
isolated restore rehearsal are accepted, staging passes the matrix above, and
the production dry run proposes exactly the independently reviewed pending
set. Stop on any project, history, schema, backup, restore, RLS, conflict,
resurrection, or data-loss disagreement. Applying `0015` is a production write
and requires a fresh explicit approval; never combine it with the canonical
content seed, `--include-all`, reset, or migration repair.

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
migration-history evidence, or signed two-user tests.

## Founder action 5 — prove the incident is closed

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
`0015` in migration history, the CAS/RLS evidence passes, and the complete
concurrent-device pick/unpick/completion/cached-client matrix is accepted.

Only then mark account sync **green** in the launch Console. SMTP delivery,
schema compatibility, and cross-account isolation are three separate gates;
passing one never implies the others passed.
