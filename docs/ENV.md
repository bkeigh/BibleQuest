# Environment variables

None are required for V1 (guest mode). Add them as you enable features. Full
template in [`../.env.example`](../.env.example).

| Variable | Required? | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Recommended | Canonical URL for metadata / OG. |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Enables account sync. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | Publishable client key (safe in browser). |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | **Server-only.** Bypasses RLS — never expose to the client. |
| `DATABASE_URL` | Optional | Direct Postgres connection for migrations/tooling. |
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | Optional | Must be exactly `true`; otherwise analytics is a silent no-op. |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Optional | Plausible site domain. Required when analytics is enabled. |
| `NEXT_PUBLIC_PLAUSIBLE_HOST` | Optional | HTTPS Plausible API origin; defaults to `https://plausible.io`. Paths, credentials, query strings, hashes, and HTTP are rejected. |
| `SENTRY_DSN` | Optional | Error monitoring (scrub sensitive fields). |
| `NEXT_PUBLIC_REVENUECAT_BILLING_MODE` | Recommended | `coming-soon` (default/off), `sandbox` (Test Store), or `live` (real billing after release gates). |
| `NEXT_PUBLIC_REVENUECAT_PUBLIC_KEY` | Optional | RevenueCat public key — Test Store (`test_…`) in dev, Web Billing (`rcb_…`) in prod. |
| `NEXT_PUBLIC_REVENUECAT_PLUS_ENTITLEMENT` | Optional | Only if the entitlement is renamed in the RevenueCat dashboard. |
| `STRIPE_DONATION_URL` | Optional | **Server-only.** Exact `https://buy.stripe.com/...` Payment Link used for one-time support through the validated same-origin redirect. |
| `RESEND_API_KEY` | Optional | Lifecycle email (later). |
| `ANTHROPIC_API_KEY` | Future | AI Guide (scaffold-only in V1). |

## Rules

- The app must **run in development without any AI or payment keys**. It does.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. If a build ever needs it in
  `NEXT_PUBLIC_*`, that's a bug — see [`../SECURITY.md`](../SECURITY.md).
- Never commit real values. Only `.env.example` (placeholders) is committed.
- A RevenueCat key alone never activates billing. The mode must match its
  documented public-key type; unknown modes, secret keys, and mismatches fail
  closed. Keep Vercel production on `coming-soon` until every gate in
  [`REVENUECAT.md`](REVENUECAT.md) passes.
- `STRIPE_DONATION_URL` is independent of RevenueCat/Plus. Keep it server-only
  and use one exact HTTPS Stripe Payment Link with no credentials, query, or
  fragment. The app rejects every other host/shape, shows an unavailable state
  when invalid, and never sends a visitor through an unvalidated redirect.

## Analytics configuration

Analytics remains off unless the enable flag and a valid domain are present at
build time **and** the user explicitly opts in on that browser. Missing or
malformed configuration, missing/unreadable consent, Do Not Track, and Global
Privacy Control all produce a silent no-op. Do not add a Plausible script tag:
the direct Events API is the single supported transport.

The CSP permits the validated Plausible HTTPS origin only when analytics is
fully configured. See [`ANALYTICS.md`](ANALYTICS.md) for the complete event and
property allowlist, queue rules, consent migration, and example payload.
