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

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run, in order:
   - every file in `supabase/migrations/`, in filename order
     (`0001_init.sql` first)
   - `supabase/policies.sql`
   - `supabase/seed.sql` (regenerate with
     `node scripts/build-supabase-seed.mjs <seed-result.json>` if content changes)
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

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public';
```

Every user-owned table must show `rowsecurity = true`. See
[`../SECURITY.md`](../SECURITY.md).

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
