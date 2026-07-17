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
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in your private
`.env.local`. Never expose the reported service-role or secret key to the
browser, and do not commit local keys.

### Hosted project

1. Create a project at [supabase.com](https://supabase.com).
2. Apply every file in `supabase/migrations/` in filename order using the
   Supabase CLI. Do not run `supabase/policies.sql`; it is a compatibility
   pointer with no DDL. See
   [`SUPABASE_SECURITY_ROLLOUT.md`](SUPABASE_SECURITY_ROLLOUT.md) for the exact
   local reset, migration-history checks, staging rollout, and rollback gates.
   Seed separately with `supabase/seed.sql` only when intended (regenerate with
   `node scripts/build-supabase-seed.mjs <seed-result.json>` if content changes).
3. Copy your keys into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...   # server-only, never client
   ```
4. Configure Auth → URL configuration → add your local and production redirect
   URLs (e.g. `http://localhost:3000/**`).

The app auto-creates a `profiles` row on signup via the `on_auth_user_created`
trigger.

### Verify RLS

```bash
docker exec -i supabase_db_BibleQuest \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off \
  < supabase/evidence/rls_policy_report.sql
```

All 26 public tables must show `rowsecurity = true`; verify policy roles and
expressions in the same report. See [`../SECURITY.md`](../SECURITY.md).

## 3. Bible content

The full World English Bible (public domain) is committed under
`src/data/bible/`. To re-import or update:

```bash
node scripts/import-bible.mjs
```

## 4. Regenerating content

Verified seed content lives in `src/data/seed/`. To rebuild the typed files from
a content result JSON and the imported Bible text:

```bash
node scripts/build-seed.mjs <seed-result.json>
node scripts/build-supabase-seed.mjs <seed-result.json>
```

## 5. Icons

```bash
node scripts/build-icons.mjs   # rebuilds icon.svg, PWA icons, favicon.ico + OG image
                               # from assets/BQ-Logo-Vector-Cross.svg
```
