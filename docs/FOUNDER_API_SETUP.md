# Founder API and provider setup

Use this checklist when connecting the hosted BibleQuest app. It is intentionally
shorter than the operational runbooks: it tells you which value belongs where,
which values never enter this repository, and how to prove each integration is
working.

Never paste a real credential into Git, an issue, chat, a screenshot, or a
`NEXT_PUBLIC_*` variable unless the provider explicitly calls it a public or
publishable browser key. Put local values in ignored `.env.local`; put deployed
values in **Vercel → BibleQuest project → Settings → Environment Variables**,
then redeploy. Vercel does not apply a changed variable to an existing
deployment. See [Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables).

## 1. Make account sign-in reliable first

### App-side Supabase values

In **Supabase → BibleQuest project → Connect** (or **Settings → API Keys**), copy
the project URL and the low-privilege **publishable** key. The legacy `anon` key
also works, but Supabase recommends publishable keys for new setup. Add these to
local `.env.local` and to the Vercel Production environment:

```dotenv
NEXT_PUBLIC_APP_URL=https://www.biblequest.co
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
BIBLEQUEST_RATE_LIMIT_SECRET=at-least-32-random-characters
```

The publishable key reaches the browser and is safe only because every private
table is protected by Row Level Security. The independently rotatable secret
key stays in Vercel's encrypted server environment for sealed routes. Do
**not** add a legacy `service_role` key, access token, or database password to
the application runtime. See [Supabase API key types](https://supabase.com/docs/guides/getting-started/api-keys).

### Magic-link delivery (Resend lives inside Supabase, not Vercel)

Supabase's default email sender is test-only: it restricts recipients, is
heavily rate-limited, and has no production delivery guarantee. That is the
likely reason a tester outside the Supabase team never received a link.

1. In [Resend Domains](https://resend.com/domains), add an auth-only subdomain,
   preferably `auth.biblequest.co`.
2. Add the exact SPF and DKIM records Resend supplies to the domain's DNS. Wait
   for both to verify; add DMARC after that. Do not reuse made-up DNS values.
3. In [Resend Integrations](https://resend.com/settings/integrations), choose
   **Connect to Supabase**, select the production BibleQuest project and the
   verified domain, and configure a sender such as
   `BibleQuest <hello@auth.biblequest.co>`. Resend creates and transfers the
   SMTP credential through the provider integration.
4. Confirm the connection in **Supabase → Authentication → SMTP Settings** and
   review **Authentication → Rate Limits**. No `RESEND_API_KEY` is needed in
   Vercel for Supabase Auth mail.

Official references: [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[Resend + Supabase](https://resend.com/docs/knowledge-base/getting-started-with-resend-and-supabase),
and [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction).

### Callback and email-template settings

In **Supabase → Authentication → URL Configuration**:

- Set Site URL to `https://www.biblequest.co`.
- Add the exact production callback URLs listed in
  [`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md). Keep the localhost
  callbacks for development and avoid a broad production wildcard.

In **Authentication → Email Templates**, publish the checked-in confirmation
and magic-link templates from [`supabase/templates/`](../supabase/templates/).
They include only `Token`, which an installed PWA or browser verifies inside
its own storage context. Portable `RedirectTo`/`TokenHash` links are
intentionally absent because they are not bound to the requesting browser. See
[Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
and [email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

Before calling auth fixed, complete the schema/content recovery steps in
[`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md). A verified code can
successfully create a session and still fail to restore the journey if the
hosted database is behind the app migrations.

Verify with:

```bash
pnpm check:production-readiness
```

Then test a brand-new Gmail address and a brand-new iCloud address end-to-end:
request once, receive, open, return to BibleQuest, create private test data,
sign in on a second browser, and confirm it restores. Do not save or share the
single-use link itself.

### Google sign-in credentials

Google is the fallback shown beside email. If it ever needs to be recreated,
make a **Web application** OAuth client in Google Auth Platform, use
`https://www.biblequest.co` as an authorized JavaScript origin, and add the
exact Supabase callback URL shown on **Supabase → Authentication → Sign In /
Providers → Google** as the Google authorized redirect URI. Paste the Google
Client ID and Client Secret into that Supabase provider screen. Those Google
credentials stay in Supabase; they are not Vercel variables. Keep the app's
own `/auth/callback` URLs in the Supabase redirect allow-list described above.
See [Supabase Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google).

### Apple sign-in credentials

Apple is the primary social sign-in option. Configure an Apple Services ID in
**Supabase → Authentication → Sign In / Providers → Apple**, using the exact
Supabase callback URL displayed there. The production provider currently uses
`co.biblequest.web` as its Services ID. Register the Supabase project domain
`iacnjqnssovaaojswjoh.supabase.co` and callback
`https://iacnjqnssovaaojswjoh.supabase.co/auth/v1/callback` with that Services
ID in Apple Developer.

Apple client secrets expire after at most 180 days. Generate a replacement
locally before the current secret expires:

```bash
node scripts/generate-apple-client-secret.mjs \
  --team-id APPLE_TEAM_ID \
  --key-id APPLE_KEY_ID \
  --client-id co.biblequest.web \
  --private-key /absolute/path/AuthKey_APPLE_KEY_ID.p8 \
  --days 180
```

Paste only the generated JWT into Supabase's Apple provider configuration.
Never put the `.p8` key in the repository, Vercel, command history, or a shared
document. Record the new expiry date and schedule the next rotation before it.
The Apple credentials stay in Supabase; they are not Vercel variables. Keep
the app's `/auth/callback` URLs in the Supabase redirect allow-list described
above. See
[Supabase Login with Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple).

## 2. Prepare one-time Support BibleQuest Checkout

One-time support uses the same complete direct Stripe test configuration as
subscriptions, but a separate deny-by-default feature latch. The server fixes
USD and the allowed amount range, creates an idempotent hosted Checkout
Session, and projects only bounded payment/refund/dispute state.

1. Apply migration `0026` after `0025` and run its pgTAP evidence.
2. Finish the test-mode keys, webhook, branding, statement descriptor, and
   receipt-email setup described in section 3.
3. In local or Preview only, set:

```dotenv
STRIPE_BILLING_MODE=test
BIBLEQUEST_STRIPE_SUPPORT_ENABLED=true
```

4. Forward the signed webhook to `/api/billing/webhook`, then complete the
   successful, canceled, expired, duplicate, refund, dispute, guest, signed-in,
   mobile, and rate-limit checks in
   [`STRIPE_ONE_TIME_SUPPORT.md`](STRIPE_ONE_TIME_SUPPORT.md).
5. Leave Production support disabled until the test evidence, policy copy,
   receipt/refund path, Firewall control, and explicit live approval all pass.

## 3. Prepare direct Stripe subscriptions in test mode

BibleQuest has a deny-by-default direct Stripe integration. Stripe is the
billing authority and Supabase holds only the server-projected membership
state. Production remains `coming-soon` with purchase UI disabled.

1. In a Stripe sandbox/test environment, create one **BibleQuest Plus** Product
   with active monthly and annual recurring Prices plus one active one-time
   lifetime Price, all using the same currency.
2. Configure Customer Portal cancellation, payment-method, and invoice options.
3. Apply migrations `0025` and `0028`, run their pgTAP evidence, and configure
   only test values in ignored `.env.local` or an encrypted preview
   environment.
4. Use the Stripe CLI to forward signed events to
   `/api/billing/webhook`; store its signing secret only in that environment.
5. Complete Checkout, 3DS, payment-failure, renewal, cancellation, Portal,
   refund/dispute, duplicate, out-of-order, identity-switch, and deletion
   evidence in
   [`STRIPE_TEST_BILLING.md`](STRIPE_TEST_BILLING.md).
6. Leave Vercel Production on:

```dotenv
STRIPE_BILLING_MODE=coming-soon
BIBLEQUEST_STRIPE_PURCHASES_ENABLED=false
BIBLEQUEST_STRIPE_SUPPORT_ENABLED=false
STRIPE_LIVE_BILLING_APPROVED=false
```

Do not create live Products/Prices, install live keys, or enable Production
purchase UI without the separate written approval gate in the runbook.

## 4. Bible editions: free now, licensed later

KJV is already connected through the keyless HelloAO Free Use Bible API and WEB
is bundled offline. Nothing needs to be added to `.env.local` or Vercel for the
free production path. See [`FREE_BIBLE_API_SETUP.md`](FREE_BIBLE_API_SETUP.md)
for verification, licensing notes, and the checklist for another free edition.

### Optional licensed editions later

The API.Bible Starter tier is non-commercial and is therefore not a free
production option for monetized BibleQuest. Only configure this dormant adapter
after exact translation IDs are commercially licensed and affordable.

1. Register the BibleQuest application with
   [API.Bible](https://www.api.bible/sign-up/starter) and complete its commercial
   licensing process.
2. Copy the private API key and the exact licensed Bible IDs into **server-only**
   local/Vercel variables:

```dotenv
API_BIBLE_API_KEY=...
API_BIBLE_COMMERCIALLY_LICENSED_BIBLE_IDS=id-one,id-two
```

3. Redeploy and verify each enabled edition plus the offline WEB fallback. A
   Bible appearing in the provider catalogue does not establish commercial
   rights. See [API.Bible authentication](https://docs.api.bible/quick-start/authentication/)
   and [getting started](https://docs.api.bible/api-reference/getting-started/).

## Final credential check

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: browser-safe; RLS is mandatory.
- `SUPABASE_SECRET_KEY`: encrypted server-only key for sealed application routes.
- `BIBLEQUEST_RATE_LIMIT_SECRET`: dedicated server-only HMAC material.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: non-secret key whose mode must match the
  server-only Stripe key.
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`: server-only secrets used only
  by direct Checkout/Billing routes.
- `BIBLEQUEST_STRIPE_SUPPORT_ENABLED`: server-only one-time Checkout latch;
  keep false until the separate support checklist passes.
- `API_BIBLE_API_KEY`: server-only private key.
- Supabase SMTP/Resend provider credentials: provider dashboards only.
- Legacy Supabase service-role keys and database passwords: never add them.

After any provider or environment change, redeploy, run the automated checks,
then repeat the relevant real-browser QA path. A green build alone does not
prove email delivery, payment settlement, or account isolation.
