# Stripe Live production release evidence — 2026-07-29

## Outcome

BibleQuest production now uses Stripe Live with both approved public gates
enabled:

- `STRIPE_BILLING_MODE=live`
- `STRIPE_LIVE_BILLING_APPROVED=true`
- `BIBLEQUEST_STRIPE_PURCHASES_ENABLED=true`
- `BIBLEQUEST_STRIPE_SUPPORT_ENABLED=true`

The canonical application is `https://www.biblequest.co`. Secrets, customer
data, provider object IDs, and internal project identifiers are intentionally
excluded from this record.

## Approval and change control

- The owner explicitly approved the Production release and the move out of
  Stripe sandbox.
- Release PR: <https://github.com/bkeigh/BibleQuest/pull/54>
- Reviewed candidate commit:
  `cd0349bbf7a9b424c2b7d000a1337dbb169eb150`
- First Production merge commit:
  `9d0433a41d49f749c6df388a7504ec7399e3832f`
- All six required branch-protection checks passed before merge. CodeQL,
  Supabase Preview, and Vercel Preview also passed.

## Production database

- A completed physical backup from `2026-07-29T07:59:28.382Z` satisfied the
  guarded maximum-age check.
- The runner pinned the exact 31-file migration manifest:
  `1c920b04e155ce593cea485f97a6bf1466a97a6df3750a4eb4bb635926802e28`.
- Only these reviewed forward packets were proposed and applied:
  - `20260729123000_stripe_subscription_conflict_key.sql`
  - `20260729123100_stripe_dispute_signal_prefix.sql`
- No migration-history repair and no include-all apply occurred.
- Both successors were recorded in Production migration history.
- The post-apply public-schema diff against the complete 31-file build was
  empty.

## Stripe Live

- Account readiness passed: charges enabled, payouts enabled, details
  submitted, and no current or past-due requirements.
- Exactly one active BibleQuest Plus Product was present.
- The active same-Product USD catalog matched:
  - monthly: 899 cents
  - annual: 8,999 cents
  - lifetime: 14,499 cents
- The default Customer Portal supports payment-method updates, invoice
  history, and cancellation at period end.
- Exactly one enabled Production webhook targeted
  `/api/billing/webhook` with the 20 application-handled event types.
- Live keys and provider identifiers were stored only as sensitive Vercel
  Production environment values. Operator temporary key files were deleted
  after provisioning and verification.

## Two-stage rollout

The first Production deployment used the live provider configuration with
purchase and support gates still false. Its canonical health contract proved:

- release SHA matched the reviewed merge
- schema contract `0032`
- service worker `biblequest-v22`
- billing mode `live`
- purchases false
- support false

The disabled plans response returned no plans, and the support Checkout route
returned the expected unavailable response. Only after those checks passed
were both public gates changed to true and the exact code redeployed.

The enabled canonical health contract then proved:

- schema contract `0032`
- service worker `biblequest-v22`
- billing mode `live`
- purchases true
- support true

The public plans endpoint returned the exact three approved Stripe-authored
amounts and currency.

## No-charge live smoke

A single $5.00 live Support Checkout Session was created through the canonical
Production route without entering a payment method. The session was proved to
be live, hosted by Stripe, unpaid, and correctly priced, then explicitly
expired.

The resulting signed `checkout.session.expired` delivery returned HTTP 200.
The private Production projection recorded `checkout_status=expired`,
`payment_status=unpaid`, and `outcome_status=expired`. No charge occurred.

The latest enabled deployment showed no error-level or HTTP 500 runtime logs
during the verification window.

## Validation

- full Vitest suite: 91 files, 616 tests passed
- targeted billing and reconciliation suite: 5 files, 30 tests passed
- ESLint passed
- TypeScript passed
- Next.js Production build passed with 248 generated pages
- full high-severity dependency audit passed
- Production dependency audit passed
- non-mutating Production readiness: 27 checks passed

## Remaining manual evidence

No real card charge was placed during release. The next owner-operated check is
one authenticated monthly or annual Checkout return and cancellation through
the Customer Portal. Refund, dispute, 3DS, and renewal drills remain operational
exercises; they are not required to keep the current no-error release online.
