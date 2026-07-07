# Security

BibleQuest stores spiritually sensitive data — prayers, reflections, private
notes. Privacy is a core feature, not an afterthought.

## Sensitive data

The following are treated as sensitive and must never be logged, sent to
analytics, or exposed to other users:

- Prayer bodies and answer reflections
- Reflection bodies
- Verse notes
- Any journey/growth event derived from the above

The analytics wrapper (`src/lib/analytics/events.ts`) accepts a whitelist of
non-textual event names and a `SafeProps` type that structurally excludes
free-text fields. There is no code path that sends journal text to analytics.

## Row Level Security

When account sync is enabled, every user-owned table has RLS enabled with
owner-only policies (`auth.uid() = user_id`). See
[`supabase/policies.sql`](supabase/migrations/../policies.sql). A user cannot
read another user's prayers or reflections. Content tables are world-readable
only when `is_active`.

Verify after applying policies:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- Every user-owned table must show rowsecurity = true.
```

## Keys

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — publishable, safe in the browser.
- `SUPABASE_SERVICE_ROLE_KEY` — **server/admin only.** It bypasses RLS and must
  never appear in client code, public env vars, the browser bundle, analytics,
  or logs. Use it only in server routes / server actions.
- Never commit real keys. `.gitignore` excludes `.env*`; only `.env.example`
  (placeholders) is committed.

## Guest mode (V1)

Today the app runs local-first: data lives in the user's browser
(`localStorage`, key `biblequest:v1`). It never leaves the device unless the
user chooses account sync. Users can export or clear all data from Settings.

## Other measures

- Server-side validation with Zod on mutations.
- Sanitize any user-generated text rendered as HTML (we render as plain text /
  `whitespace-pre-wrap`; no `dangerouslySetInnerHTML`).
- Stripe webhooks (when enabled) must be signature-verified.
- If Sentry is configured, scrub prayer/reflection fields before send.

## Reporting a vulnerability

Please report security concerns privately through the site rather than opening a
public issue. We'll acknowledge and address disclosures promptly.
