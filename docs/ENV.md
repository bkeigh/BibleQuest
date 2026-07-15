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
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | Optional | `true` to enable privacy-first analytics. |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Optional | Plausible domain, if used. |
| `SENTRY_DSN` | Optional | Error monitoring (scrub sensitive fields). |
| `NEXT_PUBLIC_REVENUECAT_PUBLIC_KEY` | Optional | RevenueCat public key — Test Store (`test_…`) in dev, Web Billing (`rcb_…`) in prod. |
| `NEXT_PUBLIC_REVENUECAT_PLUS_ENTITLEMENT` | Optional | Only if the entitlement is renamed in the RevenueCat dashboard. |
| `RESEND_API_KEY` | Optional | Lifecycle email (later). |
| `ANTHROPIC_API_KEY` | Future | AI Guide (scaffold-only in V1). |

## Rules

- The app must **run in development without any AI or payment keys**. It does.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. If a build ever needs it in
  `NEXT_PUBLIC_*`, that's a bug — see [`../SECURITY.md`](../SECURITY.md).
- Never commit real values. Only `.env.example` (placeholders) is committed.
