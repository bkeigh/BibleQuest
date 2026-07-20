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
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

The variable name keeps `ANON_KEY` for backwards compatibility, but its value
may be the newer publishable key. Do **not** add a Supabase secret key,
`service_role` key, access token, or database password to this app. The browser
key is safe only because every private table is protected by Row Level
Security. See [Supabase API key types](https://supabase.com/docs/guides/getting-started/api-keys).

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

In **Authentication → Email Templates**, use the `RedirectTo`/`TokenHash`
template from the same runbook. This lets a link opened from iPhone Mail,
Safari, an installed PWA, or another browser complete without relying on the
browser that requested it. See [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
and [email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

Before calling auth fixed, complete the schema/content recovery steps in
[`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md). A delivered link can
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

## 2. Enable one-time donations (Stripe Payment Link)

The current donation implementation deliberately does **not** need a Stripe API
secret or webhook. It sends the user through a server-validated Stripe Payment
Link, which is the smallest safe first release.

1. Sign in to the BibleQuest Stripe account and create a one-time product such
   as **Support BibleQuest**.
2. Create a [Stripe Payment Link](https://docs.stripe.com/payment-links) for the
   one-time price. Configure the amount policy, receipt email, statement
   descriptor, branding, and success message in Stripe. Start in Stripe test
   mode.
3. Copy only the clean `https://buy.stripe.com/...` link. Do not add query
   parameters or donor-identifying prefill data.
4. Add it to Vercel as a **server-only** variable, first in Preview and then in
   Production after a successful test:

```dotenv
STRIPE_DONATION_URL=https://buy.stripe.com/...
```

5. Redeploy, open `/support`, press the donation button, complete a test-mode
   payment, and verify the payment and receipt inside the BibleQuest Stripe
   account. Repeat once on mobile Safari.

Never rename this to `NEXT_PUBLIC_STRIPE_*`. If BibleQuest later needs custom
Checkout Sessions, refunds, or webhooks, add narrowly scoped server-side Stripe
credentials at that time; they are not part of the present Payment Link flow.

## 3. Prepare subscriptions in RevenueCat sandbox

BibleQuest already has a deny-by-default RevenueCat Web SDK integration. Keep
production in `coming-soon` while account sync and donation QA are being
finished.

1. In RevenueCat, use the **Test Store** first and create the
   `BibleQuest Plus` entitlement, products, current offering, packages, and a
   published paywall. Follow [`REVENUECAT.md`](REVENUECAT.md) exactly.
2. For local sandbox testing, copy the Test Store **public SDK key** (`test_…`)
   into `.env.local`:

```dotenv
NEXT_PUBLIC_REVENUECAT_BILLING_MODE=sandbox
NEXT_PUBLIC_REVENUECAT_PUBLIC_KEY=test_...
NEXT_PUBLIC_REVENUECAT_PLUS_ENTITLEMENT=BibleQuest Plus
```

3. Run every sandbox purchase, cancellation, restore, identity-switch, and
   offline-return case in the RevenueCat runbook. Do not connect live Stripe or
   put a secret RevenueCat `sk_…` key in this web app.
4. When the sandbox gates pass, connect the BibleQuest Stripe account in
   RevenueCat, create its Web Billing configuration, products/offering/paywall,
   and retrieve the browser-safe Web Billing public key (`rcb_…`). RevenueCat's
   provider connection holds the Stripe-side credentials; they do not belong
   in Vercel.
5. Only after the production release checklist is approved, set the following
   in Vercel Production and redeploy:

```dotenv
NEXT_PUBLIC_REVENUECAT_BILLING_MODE=live
NEXT_PUBLIC_REVENUECAT_PUBLIC_KEY=rcb_...
NEXT_PUBLIC_REVENUECAT_PLUS_ENTITLEMENT=BibleQuest Plus
```

Official references: [RevenueCat Web SDK](https://www.revenuecat.com/docs/web/web-billing/web-sdk),
[Web billing overview](https://www.revenuecat.com/docs/web/web-billing/overview),
[RevenueCat API key types](https://www.revenuecat.com/docs/projects/authentication),
and [Stripe Billing connection](https://www.revenuecat.com/docs/web/integrations/stripe).

## 4. Optional licensed Bible editions

The bundled World English Bible and the reviewed keyless editions need no key.
Only configure API.Bible after the exact translation IDs are commercially
licensed for a monetized BibleQuest app.

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

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: publishable/browser-safe; RLS is mandatory.
- `NEXT_PUBLIC_REVENUECAT_PUBLIC_KEY`: public SDK key only (`test_…` or
  `rcb_…`), with a matching billing mode.
- `STRIPE_DONATION_URL`: server-only Payment Link; not an API secret.
- `API_BIBLE_API_KEY`: server-only private key.
- Supabase SMTP/Resend and RevenueCat/Stripe connection credentials: provider
  dashboards only.
- Supabase secret/service-role keys, Stripe secret keys, RevenueCat `sk_…`
  keys, and database passwords: not consumed by the current app.

After any provider or environment change, redeploy, run the automated checks,
then repeat the relevant real-browser QA path. A green build alone does not
prove email delivery, payment settlement, or account isolation.
