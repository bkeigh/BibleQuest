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
[`0008_reassert_rls_and_purge.sql`](supabase/migrations/0008_reassert_rls_and_purge.sql)
and the current `0010`/`0011` account-sync migrations under
[`supabase/migrations/`](supabase/migrations/).
A user cannot read another user's prayers or reflections. Content tables are
world-readable only for active/approved rows, and subscriptions have no client
write policy.

Verify after applying policies:

```bash
docker exec -i supabase_db_BibleQuest \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off \
  < supabase/evidence/rls_policy_report.sql
```

The report reads catalogs only and does not select private rows. The staged
two-user, anonymous, migration-history, and rollback procedure is in
[`docs/SUPABASE_SECURITY_ROLLOUT.md`](docs/SUPABASE_SECURITY_ROLLOUT.md).

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

## Browser and transport security

[`next.config.ts`](next.config.ts) is the single source of truth for browser
security headers. Do not duplicate these values in `vercel.json` or a CDN rule:
two independent policies can intersect into a broken or unexpectedly broader
result.

Production-mode responses send CSP, `X-Content-Type-Options: nosniff`,
`X-Permitted-Cross-Domain-Policies: none`, `Referrer-Policy: no-referrer`, the
restricted `Permissions-Policy`, and
`Strict-Transport-Security: max-age=15552000`. HSTS is intentionally six
months, has no `includeSubDomains`, and is not preloaded. It may be deployed
only after every app hostname serving a production build is HTTPS-only; see
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Development responses never send
HSTS and keep `unsafe-eval` limited to React/Next development tooling.

### Intentional Winterhill framing exception

The app may be framed by exactly these ancestors:

- `'self'`
- `https://winterhill.studio`
- `https://www.winterhill.studio`

This is an intentional portfolio integration, not a general framing opt-in.
There is no wildcard ancestor and no `X-Frame-Options`: that legacy header
cannot express the two approved external origins and can conflict with the CSP
allowlist. Adding an ancestor requires repository-owner approval, a documented
business reason, and both allowed- and denied-origin browser tests.

### Browser origin inventory

| Directive / behavior | External origin | Repository justification |
| --- | --- | --- |
| `frame-ancestors` | `https://winterhill.studio`, `https://www.winterhill.studio` | Intentional Winterhill project preview; no other site may embed BibleQuest. |
| `connect-src` | The exact validated `NEXT_PUBLIC_SUPABASE_URL` origin | Supabase Auth and PostgREST calls from `src/lib/supabase/*` and `src/lib/sync/engine.ts`; the source is absent when no URL is configured. No Realtime subscription exists, so no wildcard or `wss:` origin is allowed. |
| `connect-src` | The validated HTTPS `NEXT_PUBLIC_PLAUSIBLE_HOST` origin | Consent-gated event POSTs in `src/lib/analytics/events.ts`; absent when analytics/domain/host validation is not enabled. Default is `https://plausible.io`. |
| `script-src`, `frame-src` | `https://tally.so` | BibleQuest newsletter widget and its dynamically sized form iframe on the public homepage. |
| Top-level navigation | `https://checkout.stripe.com`, `https://billing.stripe.com` | Server-created hosted Checkout and Customer Portal redirects are validated to these exact origins. They are navigations, not BibleQuest subresources, so they add no CSP source. |
| `Permissions-Policy: payment` | none | BibleQuest embeds no payment element. Hosted Stripe pages run under Stripe’s own origin. |

`ws://localhost:*` and `unsafe-eval` are development-only. App/PWA assets,
the manifest, service worker, Next.js output, OG art, and runtime app fonts are
self-hosted; avatar previews use `blob:` and the paper-noise SVG uses `data:`.
`next/font/google` may contact Google while building, but it self-hosts the
result and therefore needs no Google browser origin. The Bible import script's
`raw.githubusercontent.com` access, Stripe Dashboard/API calls, Supabase/Google
top-level OAuth redirects, and Stripe’s hosted Checkout/Portal URLs are
build/operator/navigation flows rather than browser subresources and are not
CSP source allowances.

### Ownership

- The BibleQuest repository owner owns `next.config.ts`, HSTS readiness, and
  the deployed-header evidence.
- The Winterhill integration owner owns both approved embed pages and the
  allowed/denied embed regression evidence.
- The billing owner owns direct Stripe test Checkout, Portal, webhook, 3DS,
  refund/dispute, and live-gate acceptance.
- The Supabase owner owns sign-in, magic-link callback, and sync acceptance
  whenever auth providers, custom domains, or project URLs change.

## Other measures

- The Winterhill portfolio iframe exception is an exact, tested origin
  allowlist. Ownership, manual checks, and removal steps are documented in
  [`docs/EMBED_SECURITY.md`](docs/EMBED_SECURITY.md).
- Server mutations use explicit allowlists, bounded values, and provider-shape
  checks; keep validation next to the trust boundary.
- Sanitize any user-generated text rendered as HTML (we render as plain text /
  `whitespace-pre-wrap`; no `dangerouslySetInnerHTML`).
- Stripe webhooks (when enabled) must be signature-verified.
- Any future error-reporting provider must fail closed and prove that prayer,
  reflection, note, verse, identity, and token data cannot leave the app before
  it is enabled.

## Reporting a vulnerability

Please report security concerns privately through the site rather than opening a
public issue. We'll acknowledge and address disclosures promptly.
