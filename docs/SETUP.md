# Setup

BibleQuest V1 runs with **zero setup** in guest mode. This guide is for enabling
optional account sync with Supabase.

## 1. Local development (no backend)

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. The full daily loop works immediately — data is
stored locally and privately in the browser.

## 2. Enable Supabase (optional)

### Local account-sync stack

The committed `supabase/config.toml` configures the local API, database, seed,
Auth site URL, and exact localhost callback URLs. Start the standard local stack
with:

```bash
supabase start
supabase db reset
supabase status
```

For database/Auth/API verification without optional Studio, Storage, Realtime,
or analytics containers:

```bash
supabase start --exclude edge-runtime,imgproxy,logflare,postgres-meta,realtime,storage-api,studio,supavisor,vector
```

Use the local `API_URL` and `ANON_KEY` reported by `supabase status` as
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in your private
`.env.local`. Never expose the reported service-role or secret key to the
browser, and do not commit local keys.

### Hosted project

1. Create a project at [supabase.com](https://supabase.com).
2. Apply every file in `supabase/migrations/` in filename order using the
   Supabase CLI. Do not run `supabase/policies.sql`; it is a compatibility
   pointer with no DDL. See
   [`SUPABASE_SECURITY_ROLLOUT.md`](SUPABASE_SECURITY_ROLLOUT.md) for the exact
   local reset, migration-history checks, staging rollout, seed, and rollback
   gates. For production recovery, first dry-run/apply migrations and verify
   schema/RLS; only then run a separately reviewed `--dry-run --include-seed`
   phase using [`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md). Never reset
   a hosted project. Regenerate the canonical launch payload with
   `node scripts/build-supabase-seed.mjs` and require a clean seed diff before
   freezing it.
3. Copy your keys into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
   SUPABASE_SECRET_KEY=...
   BIBLEQUEST_RATE_LIMIT_SECRET=...
   ```
   Keep the secret and rate-limit values server-only. Do not copy a legacy
   service-role key or direct database URL into the application runtime.
4. Configure Auth → URL configuration. Keep the local callback for development.
   For production, set the Site URL to `https://www.biblequest.co` and allow the
   exact callback URLs (including their encoded `next` values) listed in
   [`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md); do not use a broad
   production wildcard.

The app auto-creates a `profiles` row on signup via the `on_auth_user_created`
trigger.

After an approved hosted migration and seed, run the read-only compatibility
probe. It is not a substitute for SMTP delivery or two-user RLS testing:

```bash
pnpm check:production-readiness
```

### Verify RLS

```bash
docker exec -i supabase_db_BibleQuest \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off \
  < supabase/evidence/rls_policy_report.sql
```

All 28 public tables must show `rowsecurity = true`; verify policy roles and
expressions in the same report. See [`../SECURITY.md`](../SECURITY.md).

## 3. Bible content

The full World English Bible (public domain) is committed under
`src/data/bible/`. To re-import or update:

```bash
node scripts/import-bible.mjs
```

## 4. Regenerating content

Verified seed content lives in `src/data/seed/`. The 84 core quests may still be
rebuilt from a reviewed legacy content result; the reviewed expansion, daily
rotation, and Console payload rebuild directly from checked-in manifests and
the imported WEB text:

```bash
node scripts/build-seed.mjs <seed-result.json>
node scripts/build-quest-expansion.mjs
node scripts/build-daily-verses.mjs
node scripts/build-supabase-seed.mjs
```

`build-supabase-seed.mjs` accepts a legacy seed-result path only as an optional
core-quest override. Its default, authoritative path always emits exactly 150
reviewed free quests, 180 daily passages, the current milestones, and exact WEB
scripture snapshots from local source data.

## 5. Hand-painted 2.5D artwork

The checked-in runtime catalogue contains 58 optimized 512×512 WebP stills and
six reviewed 16-frame candle GIFs. Rebuild it from the approved external master
library after an art review:

```bash
pnpm art:install
# Or provide the library explicitly on another machine:
pnpm art:install /path/to/Assets-BibleQuest/2.5D
```

The installer rejects an incomplete static catalogue, preserves transparency,
and copies only the approved candle loops. Dove, lamb, other mascots, objects,
and all tree stages remain still. See [`ART_SYSTEM.md`](ART_SYSTEM.md) for the
visual contract, registry, animation policy, and QA gates.

## 6. App icons

```bash
node scripts/build-icons.mjs   # rebuilds icon.svg, PWA icons, favicon.ico + OG image
                               # from assets/BQ-Logo-Vector-Cross.svg
```

## 7. Enable one-time Stripe support (optional)

Apply migration `0026`, finish the direct Stripe test configuration from
[`STRIPE_TEST_BILLING.md`](STRIPE_TEST_BILLING.md), and enable only the
separate support latch in a local or Preview environment:

```bash
BIBLEQUEST_STRIPE_SUPPORT_ENABLED=true
```

Visitors enter through `/support`. The same-origin POST route validates a fixed
USD amount, creates an idempotent Stripe-hosted Checkout Session server-side,
and returns only an exact `https://checkout.stripe.com` URL. Guest support does
not create an app account. Production remains disabled until the complete
receipt, refund, webhook, rate-limit, legal, and device matrix in
[`STRIPE_ONE_TIME_SUPPORT.md`](STRIPE_ONE_TIME_SUPPORT.md) passes.
