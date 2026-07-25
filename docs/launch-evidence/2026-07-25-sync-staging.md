# Sync-enabled staging evidence — July 25, 2026

This record is intentionally sanitized. It contains no credentials, user
identifiers, email addresses, payment details, or private application data.

## Isolation

- Git branch: `codex/launch-upgrades-2026-07-24`
- Deployment label: `SYNC-ENABLED STAGING — NEVER PROMOTE`
- Stable Preview origin:
  `https://bible-quest-git-codex-launch-upgrades-2026-07-24-winterhill.vercel.app`
- Vercel configuration is scoped to Preview and the exact branch above.
- Production domains, deployments, database migrations, and live Stripe
  billing were not changed.
- Four accidentally broad Stripe variables were removed before staging
  configuration. Replacement Stripe values are test-mode and Preview-only.

## Supabase

The originally supplied Preview ref `fhxxfmnnrfiejmkdomhf` returns
`Resource has been removed`. The active account inventory contains the
isolated project `BibleQuest-Account-Sync-Staging` with ref
`yjwlunqssyztxkedstjb`; this project was used instead. Production ref
`iacnjqnssovaaojswjoh` was not linked or migrated.

- Remote migration history matches the repository through `0027`.
- Forward-only migrations `0023`–`0027` were applied to staging.
- Linked pgTAP: 5 files, 137 tests, PASS.
- Site URL is the stable Preview origin.
- Exact allowed callback URLs cover `/app`, `/app/quests`, and `/onboarding`.
- Email is enabled, phone and anonymous auth are disabled, and confirmed email
  is required.
- Google is enabled with the existing BibleQuest OAuth client.
- Google OAuth allows the staging callback
  `https://yjwlunqssyztxkedstjb.supabase.co/auth/v1/callback`.
- Custom SMTP remains the only provider blocker. Required settings are
  `hello@auth.biblequest.co`, sender `BibleQuest`, host `smtp.resend.com`, port
  `465`, username `resend`, and a fresh Resend sending-only API key as the
  password.

## Stripe sandbox

- Monthly Plus: $8.99.
- Annual Plus: $89.99, approximately 16.6% below twelve monthly payments.
- Lifetime Plus: $144.99, one-time.
- Purchases are enabled only in test mode.
- Support payments remain disabled.
- Live-billing approval remains false.
- The active staging webhook uses the stable Preview endpoint and listens to
  20 Checkout, subscription, invoice, refund, and dispute events.
- Webhook and API credentials are stored only as encrypted branch-scoped
  Vercel variables.

## Repository verification

- TypeScript: PASS.
- ESLint: PASS.
- Vitest: 81 files, 547 tests, PASS.
- Next.js production build: PASS.
- Launch-evidence fixture: completed; expected review status for its
  guest-only production fixture.
- Local billing pgTAP: PASS.
- Linked staging pgTAP: 5 files, 137 tests, PASS.
- Migration `0027` SHA-256 matches `supabase/migrations/manifest.sha256`.

## Remaining gates

- Configure staging custom SMTP with a fresh Resend sending-only key.
- Deploy this branch with the new environment and code state.
- Run Google, email, account-sync, avatar, push, and all three Stripe Checkout
  browser flows against the immutable Preview deployment.
