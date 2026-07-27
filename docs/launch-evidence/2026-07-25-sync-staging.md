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

- This rehearsal applied the then-current Stripe migration as legacy `0027`.
- The rebased repository now reserves `0027` for the console foundation and
  renumbers lifetime Stripe to `0028`; this staging history no longer matches
  the branch and must be rebuilt or forward-reconciled before reuse.
- Forward-only migrations `0023`–legacy `0027` were applied during the
  historical rehearsal.
- Linked pgTAP: 5 files, 137 tests, PASS.
- Site URL is the stable Preview origin.
- Exact allowed callback URLs cover `/app`, `/app/quests`, and `/onboarding`.
- Email is enabled, phone and anonymous auth are disabled, and confirmed email
  is required.
- Google is enabled with the existing BibleQuest OAuth client.
- Google OAuth allows the staging callback
  `https://yjwlunqssyztxkedstjb.supabase.co/auth/v1/callback`.
- Custom SMTP is enabled with `hello@auth.biblequest.co`, sender
  `BibleQuest`, host `smtp.resend.com`, port `465`, minimum interval `1`, and
  username `resend`.
- The SMTP password is a fresh Resend sending-only key restricted to
  `auth.biblequest.co`; it was transferred directly between provider
  dashboards and was not logged or committed.

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
- Current migration `0028` SHA-256 matches
  `supabase/migrations/manifest.sha256`.

## Rebase verification — July 27, 2026

- Rebased onto `main` after the console foundation merged.
- TypeScript, ESLint, 82 Vitest files / 562 tests, seed parity, and the
  contained production build passed.
- A clean local database reset applied all 27 migrations in order through
  `0028`.
- Local pgTAP passed 14 files / 389 tests.
- All 39 public tables had RLS enabled; every public posture contract returned
  its fixed identity and passing state.
- The Supabase Preview upgrade exposed legacy lifetime-constraint names from
  the former `0027`; migration `0028` now replaces those exact constraints
  safely, and a repeat-application plus pgTAP rehearsal passed locally.
- Live billing remained unapproved and purchase/support latches remained off
  in the contained build.

## Deployed Preview verification

- Vercel Preview deployment reached `READY`; the stable branch alias resolves
  to the branch head and no Production target or domain is attached.
- The superseded deployment returned HTTP 200 with auth `configured`, legacy
  schema contract `0027`, Stripe mode `test`, purchases enabled, and support
  disabled. It is not a release candidate after the migration renumber.
- The canonical-origin mismatch is expected on the isolated Preview origin.
- `/api/billing/plans` returned only the reviewed monthly, annual, and lifetime
  USD amounts: 899, 8999, and 14499 cents.
- Signed-out billing, push, and avatar account routes remained sealed.
- Vercel recorded no error/fatal runtime logs during the browser rehearsal.
  The observed avatar 404s are the expected no-avatar response.

## Browser rehearsal

- The staging warning label was visible on marketing, onboarding, and app
  surfaces.
- Google OAuth used the staging Supabase callback and returned to the stable
  Preview `/onboarding` route with a signed-in session.
- A Gmail sign-in code was accepted by Resend, reported `delivered`, arrived in
  Gmail with the reviewed sender/subject, and created a signed-in session.
- One non-sensitive onboarding quest remained present after a full reload,
  Google sign-in, and email-code sign-in, providing a basic signed-in sync
  persistence check.
- Settings showed `Signed in`, the avatar control, and the ready
  `Enable gentle reminders` control with no console errors.
- Monthly, annual, and lifetime controls each opened Stripe-hosted Sandbox
  Checkout with the reviewed $8.99, $89.99, and $144.99 amounts.
- One-time support showed no payment control and sent nothing to Stripe.
- A real avatar upload was not completed because the Chrome extension does not
  currently have file-URL access. The upload contract and linked database
  security tests passed; browser upload/replace/delete remains a manual gate.

## Remaining gates

- Rebuild or forward-reconcile staging so `0027` is the console foundation and
  `0028` is lifetime Stripe, then redeploy the rebased commit.
- Complete iCloud email-code/link delivery with a disposable test address.
- Complete avatar upload/replace/delete after browser file upload is enabled.
- Complete the second-account isolation, physical-device push, and PWA matrix.
