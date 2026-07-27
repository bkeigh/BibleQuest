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
- The current immutable deployment is
  `bible-quest-npc27y688-winterhill.vercel.app` at
  `b220cb7239f1fca4e7a5dbc83fbf65dd85474b1d`.
- Its health contract reports auth `configured`, schema `0028`, Stripe mode
  `test`, purchases enabled, support disabled, and the expected
  `SYNC-ENABLED STAGING — NEVER PROMOTE` warning.
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

## Rebuilt staging and signed isolation — July 27, 2026

- The disposable staging database was rebuilt from the reviewed migration set.
  Linked history now matches all 27 files through `0028`; production was never
  linked, reset, or migrated.
- Linked pgTAP passed 14 files / 389 tests after the rebuild.
- Public readiness passed every schema, CAS, deletion, avatar, push, Stripe,
  support, RLS, content-count, and provider-config contract.
- A new staging-only harness created two confirmed disposable accounts, seeded
  bounded fixtures, and exercised normal authenticated sessions in both
  directions.
- Twenty-one user-owned or safe-posture relations hid the other owner's rows;
  spoofed owner inserts and cross-owner mutation attempts were denied or
  changed zero rows.
- Seven server-only financial/operator relations rejected client reads, and
  both guessed private-avatar folder checks returned no object names.
- The harness used the reviewed self-service account-deletion RPC, removed
  nullable subscription fixtures first, deleted both disposable accounts, and
  emitted aggregate counts only.
- A real confirmation code sent through staging SMTP was reported delivered
  and completed signup in the same Preview context.
- Google account selection completed the full OAuth callback and restored the
  same signed-in account and journey.

## Backup and logical restore rehearsal — July 27, 2026

- Supabase reported completed physical backups for both staging and production.
  The newest observed staging backup was `2026-07-27T14:50:11.878Z`; the newest
  observed production backup was `2026-07-27T07:59:04.823Z`.
- Both projects reported physical/WAL-G backups available and PITR disabled.
  This was a read-only provider-posture check; no hosted restore ran.
- A staging logical dump included only the reviewed public content catalogue;
  every user-owned, financial, push, support, and operator-audit table was
  explicitly excluded.
- The dump restored into the disposable local database after its content tables
  were truncated. Restored aggregate counts were exactly 150 quests, 180 daily
  passages, 38 milestones, and 32/32 prompts.
- The temporary dump was moved to the local Trash after verification and was
  never committed or printed into evidence.
- A full physical-backup restore into a new hosted project remains open because
  it creates a separately billed Supabase project and requires explicit cost
  approval.

## Same-origin rollback rehearsal — July 27, 2026

- The isolated `biblequest-rollback-drill.vercel.app` alias first targeted
  previous known-good Preview commit
  `11bd78512cee79aeca8834d8a4413e30eb346a6a`, then candidate
  `b220cb7239f1fca4e7a5dbc83fbf65dd85474b1d`, then the previous commit again.
- Every alias transition returned health `ok` with the exact expected release
  SHA. The previous artifact honestly reported schema `0027`; the candidate
  reported `0028`.
- Both artifacts served the identical `biblequest-v21` worker with the same
  SHA-256, establishing the reviewed compatibility boundary for this rollback.
- After the rollback was proven, the isolated alias was returned to candidate
  `b220cb7239f1fca4e7a5dbc83fbf65dd85474b1d` for review.
- No production domain or production deployment alias changed during the
  rehearsal.

## Remaining gates

- Complete iCloud email-code/link delivery with a disposable test address.
- Complete avatar upload/replace/delete after browser file upload is enabled.
- Complete the physical-device push and PWA matrix.
- Complete a separately approved hosted physical-backup restore and the
  physical-device worker update/rollback observation.
