# Direct Stripe test billing

Last reviewed against Stripe documentation: **2026-07-24**.

BibleQuest uses direct Stripe Checkout and Customer Portal. Stripe is the
billing authority; Supabase stores a sealed projection for UI and entitlement
checks. RevenueCat is retired. Redirect query parameters never grant Plus.

## Safe posture

Production stays:

```dotenv
STRIPE_BILLING_MODE=coming-soon
BIBLEQUEST_STRIPE_PURCHASES_ENABLED=false
STRIPE_LIVE_BILLING_APPROVED=false
```

Do not add test or live keys to committed files. Put local test values in
ignored `.env.local`; put preview values in encrypted Vercel settings. Never
paste values into chat, issues, screenshots, terminal transcripts, or evidence.

The full configuration fails closed unless:

- mode is exactly `test` or separately approved `live`;
- secret and publishable keys match that mode;
- the webhook secret, monthly Price, annual Price, and app origin are valid;
- monthly and annual Prices are active, recurring, one month/one year;
- the lifetime Price is active and one-time;
- all three Prices share one Product and currency and have distinct IDs; and
- the separate purchase gate is exactly `true`.

## Stripe test setup

1. Select a Stripe sandbox/test environment. Do not toggle to live mode.
2. Create one **BibleQuest Plus** Product.
3. Create one monthly recurring Price, one annual recurring Price, and one
   one-time lifetime Price on that Product, using the same currency. Record
   only their IDs in `.env.local`.
4. Configure Customer Portal so customers can update payment methods, view
   invoices, and cancel at period end. Review its business information and
   cancellation copy.
5. Apply migrations `0025_stripe_test_billing.sql` and
   `0028_stripe_lifetime_plus.sql` to a local or approved staging database,
   then run their pgTAP tests.
6. Set test-mode environment values from `.env.example`. Keep
   `STRIPE_LIVE_BILLING_APPROVED=false`.
7. Start BibleQuest and forward signed events:

   ```sh
   stripe login
   stripe listen \
     --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.paused,customer.subscription.resumed,customer.subscription.trial_will_end,invoice.paid,invoice.payment_failed,invoice.payment_action_required,invoice.finalization_failed,refund.created,refund.updated,refund.failed,charge.dispute.created,charge.dispute.updated,charge.dispute.closed \
     --forward-to http://localhost:3000/api/billing/webhook
   ```

8. Put the listener’s signing secret in `STRIPE_WEBHOOK_SECRET` in `.env.local`
   without printing or recording it elsewhere, then restart the app.
9. Set `BIBLEQUEST_STRIPE_PURCHASES_ENABLED=true` only in that test environment.

The application pins Stripe API version `2026-06-24.dahlia` through exact SDK
dependency `stripe@22.3.2`. Any SDK or API-version upgrade requires webhook,
projection, Checkout, Portal, and invoice-payment retesting.

## Required integration evidence

Use real test Checkout from a signed-in test account. Stripe’s standard success
card is `4242 4242 4242 4242`, with any future expiry and valid test CVC/postal
code. Use only Stripe-documented test payment methods.

Capture a sanitized pass/fail table—never payloads, email addresses, Customer
IDs, Subscription IDs, Session IDs, invoice IDs, or secrets—for:

| Flow | Expected result |
| --- | --- |
| Monthly success | Hosted Checkout returns; Plus remains free until the verified projection becomes `active` or `trialing`; displayed Price matches Stripe. |
| Annual success | Same behavior with annual interval and Stripe-authored amount. |
| Lifetime success | One-time Checkout returns; current PaymentIntent and Charge grant lifetime Plus with no renewal or period end. |
| Lifetime refund/dispute | Full refund or open/lost dispute removes lifetime access; a won dispute restores it only from current Stripe state. |
| Checkout cancel | Return copy says canceled; no entitlement is inferred. |
| 3DS success/cancel | Challenge succeeds or cancels accurately; no redirect-only entitlement. |
| Initial payment failure | State is `incomplete`/free with Portal and support guidance. |
| Renewal success | `invoice.paid` reconciles the current Stripe Subscription. |
| Renewal failure | `past_due`/`unpaid` remains free and management guidance appears. |
| Cancel at period end | Plus remains active through the current period and UI states the date. |
| Immediate/end-of-period cancel | Current Stripe state projects `canceled` and access is removed when no entitled Subscription remains. |
| Portal return | Refresh uses Stripe’s current object, not query parameters. |
| Duplicate delivery | One event claim is processed; duplicates return success without a second projection. |
| Out-of-order delivery | Rehydrating the current Stripe object prevents an old payload from restoring access. |
| Invalid signature/mode | Webhook returns a bounded 400 and writes no event/projection. |
| Refund/dispute | A bounded signal is retained; no card/payload data is stored; current Subscription is reconciled. |
| Account A → B | Browser state resets; B cannot see or manage A’s membership. |
| Account deletion | Application ownership detaches; required billing records remain sealed; action throttles are deleted. |

Also use Stripe’s sandbox subscription simulation/Test Clocks for renewal and
period-end behavior where compatible. A generic `stripe trigger` proves
signature transport but does not replace end-to-end Checkout evidence tied to
BibleQuest’s Customer mapping and configured Prices.

## Automated evidence

Run:

```sh
pnpm exec vitest run \
  tests/stripe-billing-config.test.ts \
  tests/stripe-billing-projection.test.ts \
  tests/stripe-webhook.test.ts \
  tests/stripe-api-contract.test.ts
supabase test db supabase/tests/0025_stripe_test_billing.sql
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

The unit suite proves fail-closed configuration, Price/state projection,
current-object webhook reconciliation, bounded event signals, provider failure
categories, exact redirect origins, raw signature handling, and static API
boundaries. pgTAP proves RLS, identifier sealing, service-only functions,
deduplication/retry claims, action throttling, and deletion retention.

These tests do **not** prove a real Stripe test transaction. Do not mark the
integration table passed until the test environment produces current evidence.

## Data and security model

- Browser clients can read only their own sanitized subscription columns.
- Stripe Customer/Subscription/Price/invoice identifiers, webhook claims,
  event signals, and financial amounts are service-only.
- Authenticated/anonymous roles cannot mutate billing tables or execute claim
  functions.
- Only recognized active/trialing server Prices grant Plus.
- Payment failures, incomplete, unpaid, paused, canceled, and unknown Prices
  remain free.
- Event rows store fixed identity/status metadata, never full webhook payloads.
- Analytics is opt-in and allows only checkout interval or no properties—never
  provider identifiers, payment data, email, or payload content.
- Account deletion sets billing ownership to null rather than destroying
  records that may be needed for accounting, disputes, or legal retention.

## Recovery and rollback

The safe application rollback is configuration-first:

1. Set `BIBLEQUEST_STRIPE_PURCHASES_ENABLED=false`.
2. Redeploy and confirm `/api/health` reports purchases disabled.
3. Leave webhook processing and the projection configured while outstanding
   Stripe events settle.
4. If billing itself must be disabled, set `STRIPE_BILLING_MODE=coming-soon`
   only after the billing owner confirms how active customers will be supported.
5. Do not delete Stripe Products, Prices, Customers, Subscriptions, events, or
   billing rows as an incident shortcut.
6. Fix database issues with a new forward-only migration; never edit an applied
   migration or use migration repair as improvisation.

Migration `0025` is additive except for converting the legacy one-row-per-user
subscription primary key to a UUID key and changing deletion to `SET NULL`.
Reverting that shape would lose multi-subscription and retention semantics, so
database recovery is forward-only.

## Live gate

Before any live enablement, attach:

- completed integration table above in preview/staging;
- legal owner approval of pricing, renewal, cancellation, refund, privacy, and
  tax language;
- verified Stripe account/business/receipt/Portal settings;
- exact live Product and Price review;
- production webhook delivery and alert ownership plan;
- two-user RLS and account-deletion evidence;
- CI, production build, dependency audit, and browser/device evidence; and
- explicit written approval to use live keys and activate purchase UI.

Only then may a separately reviewed change set `STRIPE_BILLING_MODE=live`,
`STRIPE_LIVE_BILLING_APPROVED=true`, and the purchase gate. This implementation
does not authorize that change.

Official references:

- [Stripe webhook signatures and local forwarding](https://docs.stripe.com/webhooks)
- [Stripe CLI](https://docs.stripe.com/stripe-cli/use-cli)
- [Subscription webhooks and testing](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Checkout fulfillment testing](https://docs.stripe.com/checkout/fulfillment)
- [Subscription simulations](https://docs.stripe.com/billing/testing/test-clocks/simulate-subscriptions)
