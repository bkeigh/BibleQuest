# Environment variables

None are required for V1 (guest mode). Add them as you enable features. Full
template in [`../.env.example`](../.env.example).

| Variable | Required? | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Recommended | Canonical URL for metadata / OG. |
| `BIBLEQUEST_ROLLBACK_SHA` | Launch gate | **Server-only.** Exact approved 40-character rollback commit reported by health; never a branch, URL, or deployment ID. |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Enables account sync. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | Publishable client key (safe in browser). |
| `SUPABASE_SERVICE_ROLE_KEY` | Server feature gate | **Server-only.** Used by sealed push scheduler/test/subscription routes and future billing projection routes. Never use a `NEXT_PUBLIC_*` name. |
| `NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED` | Launch gate | Must be exactly `true` to expose account auth and sync after the full migration, RLS, provider, restore, and PWA gates pass. Missing or any other value stays guest-only. |
| `BIBLEQUEST_AVATAR_SYNC_ENABLED` | Launch gate | **Server-only.** Must be exactly `true` after migration `0023`, private-bucket RLS, two-user isolation, and preview checks pass. Missing or any other value blocks avatar reads/uploads while account deletion cleanup remains available. |
| `BIBLEQUEST_PUSH_ENABLED` | Launch gate | **Server-only.** Must be exactly `true` after migration `0024`, encryption/VAPID configuration, two-user isolation, and preview checks pass. |
| `WEB_PUSH_VAPID_PUBLIC_KEY` | Push gate | **Server-only configuration returned only to authenticated clients.** Base64url P-256 VAPID public key. |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | Push secret | **Server-only.** Matching base64url VAPID private key. |
| `WEB_PUSH_VAPID_SUBJECT` | Push gate | **Server-only.** Valid `mailto:` or HTTPS operator identity for Web Push. |
| `PUSH_SUBSCRIPTION_ENCRYPTION_KEY` | Push secret | **Server-only.** Exactly 32 random bytes encoded as base64 for AES-256-GCM endpoint encryption. |
| `PUSH_SUBSCRIPTION_KEY_VERSION` | Push gate | Positive integer label for the active endpoint-encryption key. |
| `PUSH_SUBSCRIPTION_ENCRYPTION_KEYS` | Optional rotation secret | **Server-only.** JSON object mapping retained integer key versions to 32-byte base64 keys. |
| `PUSH_SCHEDULER_SECRET` | Push secret | **Server-only and GitHub Actions secret.** At least 32 random characters shared with the authenticated scheduler route. |
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | Optional | Must be exactly `true`; otherwise analytics is a silent no-op. |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Optional | Plausible site domain. Required when analytics is enabled. |
| `NEXT_PUBLIC_PLAUSIBLE_HOST` | Optional | HTTPS Plausible API origin; defaults to `https://plausible.io`. Paths, credentials, query strings, hashes, and HTTP are rejected. |
| `NEXT_PUBLIC_REVENUECAT_BILLING_MODE` | Recommended | `coming-soon` (default/off), `sandbox` (Test Store), or `live` (real billing after release gates). |
| `NEXT_PUBLIC_REVENUECAT_PUBLIC_KEY` | Optional | RevenueCat public key — Test Store (`test_…`) in dev, Web Billing (`rcb_…`) in prod. |
| `NEXT_PUBLIC_REVENUECAT_PLUS_ENTITLEMENT` | Optional | Only if the entitlement is renamed in the RevenueCat dashboard. |
| `STRIPE_DONATION_URL` | Optional | **Server-only.** Exact `https://buy.stripe.com/...` Payment Link used for one-time support through the validated same-origin redirect. |
| `API_BIBLE_API_KEY` | Optional | **Server-only.** Enables the licensed API.Bible adapter. Not needed for reviewed Free Use Bible API editions. |
| `API_BIBLE_COMMERCIALLY_LICENSED_BIBLE_IDS` | Optional | Comma-separated API.Bible IDs explicitly licensed for BibleQuest's commercial use. Catalogue visibility alone is not permission. |

## Rules

- The app must **run in development without any AI or payment keys**. It does.
- The browser bundle never consumes a service-role key or direct database URL.
  Sealed server routes may use `SUPABASE_SERVICE_ROLE_KEY` from ignored local
  environment files or encrypted Vercel settings. It must never use a
  `NEXT_PUBLIC_*` name, appear in logs, or be returned to a client. See
  [`../SECURITY.md`](../SECURITY.md).
- Never commit real values. Only `.env.example` (placeholders) is committed.
- `BIBLEQUEST_ROLLBACK_SHA` is evidence, not an automatic rollback control. Set
  it only after the rollback authority approves the target; changing it does not
  move traffic or undo database changes.
- Supabase Auth email is provider-side configuration. Follow
  [`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md); do not add a
  `RESEND_API_KEY` to Vercel or `.env.local` for SMTP. Lifecycle email, external
  AI, and third-party error reporting get environment variables only when a
  reviewed runtime integration exists.
- A RevenueCat key alone never activates billing. The mode must match its
  documented public-key type; unknown modes, secret keys, and mismatches fail
  closed. Keep Vercel production on `coming-soon` until every gate in
  [`REVENUECAT.md`](REVENUECAT.md) passes.
- `STRIPE_DONATION_URL` is independent of RevenueCat/Plus. Keep it server-only
  and use one exact HTTPS Stripe Payment Link with no credentials, query, or
  fragment. The app rejects every other host/shape, shows an unavailable state
  when invalid, and never sends a visitor through an unvalidated redirect.
- Push endpoints and browser keys are encrypted before database storage.
  Generate VAPID, endpoint-encryption, and scheduler secrets outside chat; put
  them only in encrypted environment stores. During rotation, retain old keys
  in `PUSH_SUBSCRIPTION_ENCRYPTION_KEYS` until old subscriptions are replaced.
  Keep the GitHub repository variable `BIBLEQUEST_PUSH_SCHEDULE_ENABLED`
  absent or `false` until the production route is ready.
- The default KJV and other reviewed Free Use Bible API editions are keyless and
  require no environment variable. Their server-side allow-list is intentionally
  separate from API.Bible's future licensed-ID allow-list. See
  [`FREE_BIBLE_API_SETUP.md`](FREE_BIBLE_API_SETUP.md).

## Analytics configuration

Analytics remains off unless the enable flag and a valid domain are present at
build time **and** the user explicitly opts in on that browser. Missing or
malformed configuration, missing/unreadable consent, Do Not Track, and Global
Privacy Control all produce a silent no-op. Do not add a Plausible script tag:
the direct Events API is the single supported transport.

The CSP permits the validated Plausible HTTPS origin only when analytics is
fully configured. See [`ANALYTICS.md`](ANALYTICS.md) for the complete event and
property allowlist, queue rules, consent migration, and example payload.
