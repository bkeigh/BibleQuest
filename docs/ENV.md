# Environment variables

None are required for V1 (guest mode). Add them as you enable features. Full
template in [`../.env.example`](../.env.example).

| Variable | Required? | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Recommended | Canonical URL for metadata / OG. |
| `BIBLEQUEST_ROLLBACK_SHA` | Launch gate | **Server-only.** Exact approved 40-character rollback commit reported by health; never a branch, URL, or deployment ID. |
| `BIBLEQUEST_DEPLOYMENT_LABEL` | Staging safety | **Server-only.** Renders a warning only when the value is exactly `SYNC-ENABLED STAGING — NEVER PROMOTE`; leave unset in Production. |
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
| `BIBLEQUEST_MONITOR_SUPABASE_URL` | Monitor secret | Exact production Supabase HTTPS origin, stored as a GitHub Actions secret so reports never expose the project host. |
| `BIBLEQUEST_MONITOR_SUPABASE_ANON_KEY` | Monitor secret | Production publishable key stored as a GitHub Actions secret; used only for anonymous public-content and auth-settings probes. |
| `BIBLEQUEST_MONITOR_EXPECTED_SHA` | Monitor gate | Non-secret 40-character deployed commit, stored as a repository variable after each approved release. |
| `BIBLEQUEST_MONITOR_EXPECTED_AUTH_POSTURE` | Monitor gate | Expected bounded health posture; production default is `configured`. |
| `BIBLEQUEST_MONITOR_EXPECTED_BILLING_MODE` | Monitor gate | Expected bounded billing posture; production currently pins `live`. |
| `BIBLEQUEST_MONITOR_EXPECTED_BILLING_PURCHASES_ENABLED` | Monitor gate | Expected public purchase-UI posture; production currently pins `true`. |
| `BIBLEQUEST_MONITOR_EXPECTED_BILLING_SUPPORT_ENABLED` | Monitor gate | Expected one-time support posture; production currently pins `true`. |
| `BIBLEQUEST_MONITOR_VERCEL_PROJECT_ID` | Optional monitor secret | Vercel project identifier for aggregate runtime 5xx inspection. |
| `BIBLEQUEST_MONITOR_VERCEL_TEAM_ID` | Optional monitor secret | Matching Vercel team identifier. All three Vercel monitor values must be present together. |
| `BIBLEQUEST_MONITOR_VERCEL_TOKEN` | Optional monitor secret | Narrow, expiring Vercel access token. Log messages and response bodies are never archived. |
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | Optional | Must be exactly `true`; otherwise analytics is a silent no-op. |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Optional | Plausible site domain. Required when analytics is enabled. |
| `NEXT_PUBLIC_PLAUSIBLE_HOST` | Optional | HTTPS Plausible API origin; defaults to `https://plausible.io`. Paths, credentials, query strings, hashes, and HTTP are rejected. |
| `STRIPE_BILLING_MODE` | Billing gate | `coming-soon` (safe default/off), `test`, or explicitly approved `live`; production currently uses the approved live posture. |
| `BIBLEQUEST_STRIPE_PURCHASES_ENABLED` | Purchase gate | Must be exactly `true` in addition to a complete test/live configuration before subscription Checkout appears. |
| `BIBLEQUEST_STRIPE_SUPPORT_ENABLED` | Support gate | Must be exactly `true` in addition to a complete test/live configuration before one-time support Checkout appears. |
| `STRIPE_LIVE_BILLING_APPROVED` | Live gate | Must be exactly `true` before a matching live key set is accepted. This is not a substitute for owner approval and evidence. |
| `STRIPE_SECRET_KEY` | Billing secret | **Server-only.** Matching `sk_test_…` or `sk_live_…` key. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Billing gate | Matching `pk_test_…` or `pk_live_…` key. It is non-secret but must never be substituted for the secret key. |
| `STRIPE_WEBHOOK_SECRET` | Billing secret | **Server-only.** Signing secret for the exact Checkout/Billing webhook endpoint. |
| `STRIPE_PLUS_MONTHLY_PRICE_ID` | Billing gate | Server-allowlisted active recurring monthly Price for the Plus product. |
| `STRIPE_PLUS_ANNUAL_PRICE_ID` | Billing gate | Server-allowlisted active recurring annual Price for the same Plus product and currency. |
| `STRIPE_PLUS_LIFETIME_PRICE_ID` | Billing gate | Server-allowlisted active one-time lifetime Price for the same Plus product and currency. |
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
- `BIBLEQUEST_STAGING_PROJECT_REF` names the Supabase staging project used by
  the staging reconciliation scripts. It is a local operator value — never set
  it in Production.
- `ANTHROPIC_API_KEY` powers MyShepherd and Haiku quest matching. Both surfaces
  fail closed with a `503` when it is missing, so `pnpm
  check:production-readiness` verifies it. `ANTHROPIC_MODEL` is optional; when
  set it must be an approved model (`claude-haiku-4-5` or
  `claude-haiku-4-5-20251001`) or every AI request fails closed.
- Supabase Auth email is provider-side configuration. Follow
  [`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md); do not add a
  `RESEND_API_KEY` to Vercel or `.env.local` for SMTP. Lifecycle email, external
  AI, and third-party error reporting get environment variables only when a
  reviewed runtime integration exists.
- A Stripe key alone never activates billing. Mode/key mismatches, incomplete
  values, duplicate Prices, malformed origins, and unapproved live mode fail
  closed. Subscription Checkout additionally requires the purchase gate;
  one-time Checkout requires its separate support gate. Follow
  [`STRIPE_TEST_BILLING.md`](STRIPE_TEST_BILLING.md) and
  [`STRIPE_ONE_TIME_SUPPORT.md`](STRIPE_ONE_TIME_SUPPORT.md). Production is live
  only under the recorded approval and must fail closed if that contract breaks.
- Stripe secrets belong only in ignored `.env.local` files and encrypted Vercel
  settings. Use the Stripe CLI environment directly for local webhook tests;
  never copy a secret into evidence, logs, source, an issue, or chat.
- Push endpoints and browser keys are encrypted before database storage.
  Generate VAPID, endpoint-encryption, and scheduler secrets outside chat; put
  them only in encrypted environment stores. During rotation, retain old keys
  in `PUSH_SUBSCRIPTION_ENCRYPTION_KEYS` until old subscriptions are replaced.
  Keep the GitHub repository variable `BIBLEQUEST_PUSH_SCHEDULE_ENABLED`
  absent or `false` until the production route is ready.
- Daily monitoring credentials belong in GitHub Actions secrets, not application
  Vercel settings. The monitor archives only status, latency, attempt count,
  fixed failure category, and a validated release SHA. See
  [`SYNTHETIC_HEALTH.md`](SYNTHETIC_HEALTH.md).
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
