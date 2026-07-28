# One-time Support BibleQuest

BibleQuest uses server-created Stripe Checkout Sessions for voluntary,
non-recurring support. This path is separate from Plus membership: it grants no
entitlement, creates no spiritual benefit, and does not require an app account.
Production remains disabled until every live gate below has written approval.

## Fixed product and privacy boundary

- The browser sends only an integer USD amount from $3.00 through $500.00 and a
  random request UUID.
- The server revalidates both values, fixes currency and product copy, creates
  Checkout with a Stripe idempotency key, and returns only an exact
  `https://checkout.stripe.com` URL.
- Stripe collects payment and receipt details. BibleQuest stores no full card
  number, card suffix, payer name, payer email, address, or raw webhook body.
- A verified signed-in user may be associated with the bounded financial row.
  Guest support stays guest support and never creates an app account. Account
  deletion detaches the user ID but retains the financial record.
- Only a verified Stripe signature plus a newly retrieved current Stripe object
  may update completed, expired, refunded, or disputed state. A success URL is
  never proof of payment.

## Test setup

1. Use a Stripe sandbox or test-mode account. Do not install live keys.
2. Apply migrations through `0026_stripe_one_time_support.sql`.
3. Run the database contract:

   ```bash
   supabase test db --local supabase/tests/0026_stripe_one_time_support.sql
   ```

4. Configure the complete test billing key set from
   [`STRIPE_TEST_BILLING.md`](STRIPE_TEST_BILLING.md). The support route shares
   that validated Stripe client, so the two reviewed recurring Price IDs remain
   required even when subscription purchases are disabled.
5. Keep subscription purchase UI off and enable support only in the test
   environment:

   ```dotenv
   STRIPE_BILLING_MODE=test
   BIBLEQUEST_STRIPE_PURCHASES_ENABLED=false
   BIBLEQUEST_STRIPE_SUPPORT_ENABLED=true
   STRIPE_LIVE_BILLING_APPROVED=false
   ```

6. Forward signed events to the shared webhook:

   ```bash
   stripe listen --forward-to http://localhost:3000/api/billing/webhook
   ```

   Put the temporary `whsec_…` value only in ignored `.env.local`. Never paste
   keys, webhook bodies, Checkout URLs, customer IDs, or payment IDs into saved
   evidence.
7. In Stripe test settings, enable successful-payment and refund receipt
   emails. Review branding, public business details, statement descriptor,
   support email, and refund policy before testing.

## Required test matrix

Record timestamp, build SHA, environment, pass/fail, and a redacted Stripe
Dashboard screenshot or bounded database outcome. Never record contact or
payment identifiers.

| Scenario | Required result |
| --- | --- |
| Presets and custom amount | $5/$10/$25/$50 and valid custom values reach hosted test Checkout; less than $3, more than $500, fractional minor units, strings, changed currency, extra JSON fields, and reused request IDs with a changed amount fail closed. |
| Guest success | Checkout completes without an app account; a receipt is sent by Stripe; the row becomes `completed`; no Plus entitlement appears. |
| Signed-in success | The verified account may own the bounded row; the payment still grants no entitlement. |
| Cancel | `/support?checkout=cancelled` says payment is not inferred; the row remains unpaid/open until current Stripe state says otherwise. |
| Return | `/support?checkout=returned` says only a signed webhook confirms payment; refreshing or editing the query cannot mark payment complete. |
| Decline and 3DS | Stripe test decline and authentication cards behave as Stripe specifies; no false completion or membership results. |
| Expiration | Expire the actual open test Session from Stripe; `checkout.session.expired` projects `expired` and unpaid. |
| Delayed method | Async success and failure use the current Session and project only the provider-confirmed outcome. |
| Duplicate request | Retrying the same request UUID returns the same validated open Session; a different amount or account identity is rejected. |
| Duplicate/out-of-order webhook | Provider resend is safe; current Stripe state wins and no event is falsely acknowledged while its claim remains busy or exhausted. |
| Partial/full refund | Create test refunds in Stripe; cumulative current Charge state projects `partially_refunded`, then `refunded`; Stripe sends the configured refund receipt. |
| Dispute | Test created, updated, won, and lost dispute posture; the current Charge and Dispute must match amount, currency, and mode before projection. |
| Deletion | Deleting the associated test app account sets `user_id` to null and preserves the financial record. |
| Isolation | Anonymous and authenticated clients cannot select or mutate support rows or call creation RPCs. |
| Abuse | Same-origin, body ceiling, UUID/amount validation, in-process limits, and the deployment-wide Firewall limit reject abusive requests without provider calls. |
| Devices | Complete test Checkout on desktop Chrome/Firefox/Safari and physical mobile Safari; cancel/back/retry remains clear and accessible. |
| Redaction | App/Vercel logs, analytics, saved evidence, and issue text contain no payment/contact IDs, URLs, receipt data, or webhook payloads. |

Use Stripe's published test cards only in Stripe-hosted test Checkout. Never use
a real card. For expiration, refunds, disputes, and event resend, operate only
on the actual test objects created for this matrix so the server's immutable
request mapping is exercised.

## Deployment-wide abuse control

The route has per-instance defense-in-depth limits of five requests per ten
minutes and twenty per day. Before Preview testing or live enablement, add a
Vercel Firewall rate-limit rule for `POST /api/support/checkout` using the same
or stricter effective limits. Verify a blocked request never reaches Stripe.
Instance memory is not a deployment-wide control.

## Bounded database evidence

The following aggregate is safe only after confirming the test database target.
It returns no user, request, Stripe, or contact identifier:

```sql
select
  outcome_status,
  count(*) as payment_count
from public.stripe_support_payments
where livemode = false
group by outcome_status
order by outcome_status;
```

Also save the PASS result from the `0026` pgTAP file and the fixed response from
`public.stripe_support_contract()`. Do not export the table.

## Production approval gate

Live support remains a hard no-go until:

- the complete matrix above passes in an approved test deployment;
- migration history, the 39-table RLS report, backup/restore, and production
  public readiness through schema contract `0029` pass;
- counsel or the named communications owner approves voluntary,
  non-recurring, non-tax-deductible, refund, receipt, and separation-from-Plus
  copy;
- Stripe live business, receipt, descriptor, support, refund, tax, and dispute
  settings are reviewed;
- the support inbox and refund operator are staffed;
- Vercel Firewall, monitoring, alert routing, device QA, and rollback rehearsal
  pass; and
- the release, billing, security, communications, and rollback owners give
  explicit written approval.

Only then may encrypted Production settings use matching live credentials with:

```dotenv
STRIPE_BILLING_MODE=live
STRIPE_LIVE_BILLING_APPROVED=true
BIBLEQUEST_STRIPE_SUPPORT_ENABLED=true
```

`BIBLEQUEST_STRIPE_PURCHASES_ENABLED` remains an independent Plus subscription
decision. Test keys, test mode, or an unverified webhook secret in Production
are a hard stop.

## Containment and rollback

To stop new one-time Checkouts, set
`BIBLEQUEST_STRIPE_SUPPORT_ENABLED=false` and redeploy. Confirm `/support` shows
no payment control and `/api/health` reports support disabled. Keep the signed
webhook and migration available long enough to reconcile existing Sessions,
refunds, and disputes.

An app rollback does not undo Stripe state or delete financial records. Never
edit or remove an applied migration, and never delete support rows to simulate
a refund. Use Stripe for refunds, preserve the provider record, project the
signed current state, and create a higher-numbered corrective migration for any
database defect.
