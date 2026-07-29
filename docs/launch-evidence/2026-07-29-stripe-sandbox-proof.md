# Stripe sandbox proof — 2026-07-29

## Verdict

**PARTIALLY PROVEN.** BibleQuest's recurring Plus, lifetime Plus, voluntary
one-time support, signed webhook projection, refunds, disputes, Portal
management, and Preview isolation were proven against Stripe-hosted sandbox
Checkout. Production was not changed and remains disabled.

The result is not `PROVEN` for Live launch because renewal/Test Clock,
subscription 3DS/failure, a second authenticated account, real account
deletion, receipt delivery to a monitored inbox, deployment-wide Firewall
rate limiting, cross-browser, and physical-device checks remain blocked or
not run. The staging migration-history discrepancy described below was
subsequently resolved through the guarded forward-only process documented in
[`2026-07-29-staging-migration-reconciliation.md`](2026-07-29-staging-migration-reconciliation.md).

## Evidence identity

| Field | Value |
| --- | --- |
| Evidence captured | 2026-07-29 02:06 EDT |
| Tested code commit | `180abf85290a7e1cb4dfb178ec2dd1ddbe4b9107` |
| Local branch | `codex/stripe-sandbox-proof-2026-07-29` |
| Preview source branch | `codex/launch-upgrades-2026-07-24` |
| Stripe environment | Isolated sandbox; no live objects or payment methods |
| Application environment | Protected Vercel Preview connected to a distinct non-production Supabase project |
| Browser coverage | Chrome on macOS |
| Production baseline | `main` remained on its existing production deployment; no promotion occurred |

Provider object identifiers, account identifiers, deployment identifiers,
Checkout URLs, email addresses, secrets, request query strings, and webhook
bodies are intentionally omitted.

## Sanitized configuration posture

- One active BibleQuest Plus sandbox Product has three distinct active USD
  Prices: monthly recurring **$8.99**, annual recurring **$89.99**, and
  one-time lifetime **$144.99**.
- Customer Portal allows payment-method updates, invoice viewing, and
  cancellation at period end.
- The isolated Preview has Stripe test billing and one-time support enabled.
  Its webhook destination subscribes to the repository's required 20 sandbox
  events and reaches the protected Preview through a rotated Preview-only
  bypass.
- Stripe-hosted Checkout support copy clearly says that support is voluntary,
  non-recurring, not tax-deductible, and grants no membership or spiritual
  benefit.
- Sandbox customer emails are enabled for successful payments and refunds.
- Sandbox branding uses BibleQuest evergreen `#0e533c` and gold `#d3a336`.
  A Stripe-hosted logo/icon is not yet configured.
- Staging billing, support, and operator contract functions all return
  `ok=true`. The subscription conflict key and Dispute `du_` signal constraint
  are present.
- All observed provider data and projected rows were sandbox/test mode.
- Production was inspected read-only and retained all four closed gates:
  `STRIPE_BILLING_MODE=coming-soon`,
  `STRIPE_LIVE_BILLING_APPROVED=false`,
  `BIBLEQUEST_STRIPE_PURCHASES_ENABLED=false`, and
  `BIBLEQUEST_STRIPE_SUPPORT_ENABLED=false`.

## Real Stripe-hosted sandbox matrix

`PASS (real)` means current browser, Stripe, signed webhook, and bounded
database evidence agreed. `PASS (automated)` means the behavior is covered by
the current Vitest or pgTAP suite but was not claimed as a real provider flow.

### Subscriptions and lifetime Plus

| Scenario | Status | Current evidence |
| --- | --- | --- |
| Monthly success | PASS (real) | Hosted Checkout completed; signed webhook produced active monthly Plus. |
| Annual success | PASS (real) | Hosted Checkout completed; signed webhook produced active annual Plus. |
| Lifetime success | PASS (real) | Hosted Checkout completed; signed webhook produced active lifetime Plus at the exact configured amount. |
| Subscription Checkout cancellation | BLOCKED (real) | Return/cancel logic passes automated coverage. The authenticated test session was deliberately signed out for isolation proof; another magic-link sign-in requires inbox access. |
| Initial subscription payment failure | BLOCKED (real) | Failure projection passes automated coverage. A real subscription retry requires another authenticated sandbox Checkout session. |
| Subscription 3DS success | BLOCKED (real) | Real support 3DS succeeded, but another authenticated subscription Checkout requires inbox access. |
| Subscription 3DS cancellation | BLOCKED (real) | Challenge cancel behavior is covered by Checkout return logic; a fresh authenticated subscription Checkout requires inbox access. |
| Renewal success | BLOCKED (real) | Existing Checkout-created customers cannot be attached to a Test Clock after creation; a new authenticated clock-backed test identity is required. |
| Renewal failure | BLOCKED (real) | Same Test Clock and authenticated test-identity blocker as renewal success. |
| Cancel at period end | PASS (real) | Portal cancellation projected `cancel_at_period_end=true` while preserving Plus through the paid period. |
| Portal return and management | PASS (real) | Portal showed payment-method and invoice controls and returned successfully. |
| Duplicate webhook delivery | PASS (real) | The same signed event was replayed; endpoint returned success and the event claim remained unique. |
| Out-of-order webhook delivery | PASS (real) | A real support dispute arrived before Checkout completion; the corrected fallback mapping projected the dispute and later loss without duplicate rows. |
| Invalid signature and mode rejection | PASS (automated) | Signature, test/live mismatch, environment, and event-shape rejection suites pass. |
| Lifetime full refund | PASS (real) | Full $144.99 refund projected canceled/free/refunded with the full amount refunded. |
| Lifetime dispute revocation | PASS (real) | Opening a real sandbox dispute removed Plus. |
| Lifetime dispute restoration | PASS (real) | Winning the real sandbox dispute restored active lifetime Plus. |
| Account A/B isolation | BLOCKED (real) | Signing out hid Account A's entitlement from the guest. Two-way authenticated A/B proof requires a second inbox-accessible test identity. RLS isolation passes pgTAP. |
| Account deletion | BLOCKED (real) | Generation-bound deletion, nullable financial ownership, and privacy boundaries pass pgTAP; no real sandbox account was deleted. |

### Voluntary one-time support

| Scenario | Status | Current evidence |
| --- | --- | --- |
| Preset amounts | PASS (real) | Real hosted Checkouts exercised $5, $10, $25, and $50 selections across success, decline, cancellation, refund, and dispute outcomes. |
| Valid custom amount | PASS (real) | Custom $3.00 completed through a real 3DS challenge and projected as guest support. |
| Invalid limits and malformed payloads | PASS (automated) | Minimum, maximum, integer-cent, schema, and malformed-request tests pass. |
| Guest success | PASS (real) | Guest support completed and remained independent from Plus. |
| Signed-in success | PASS (real) | Signed-in $10 support completed without granting or changing Plus. |
| Cancellation and return | PASS (real) | Checkout was abandoned and returned with no webhook-confirmed payment or Plus. |
| Decline | PASS (real) | Stripe's published decline card failed; no payment or Plus was inferred from the browser return. |
| 3DS | PASS (real) | Stripe's published 3DS card displayed the hosted challenge; completion produced a signed success projection. |
| Session expiration | PASS (automated) | Expiration handling and no-entitlement behavior pass tests; no live Dashboard expiration was performed because this path is non-critical and provider-object identifiers were intentionally not exported. |
| Async success/failure | BLOCKED | Configured Checkout methods did not expose an app-specific delayed sandbox method that could be completed without a separate provider test account or redirect credential. |
| Idempotent retry | PASS (automated) | Same-request retry and claim behavior pass route and projection tests. |
| Changed-amount retry rejection | PASS (automated) | Immutable request/amount binding tests pass. |
| Duplicate webhooks | PASS (real) | Signed event replay was acknowledged once with a unique event claim. |
| Out-of-order webhooks | PASS (real) | Dispute-before-Checkout ordering projected correctly after the regression fix. |
| Partial refund | PASS (real) | A $4 partial refund on the $10 support payment projected `partially_refunded` with 400 cents refunded. |
| Full refund | PASS (real) | Refunding the remaining $6 projected `refunded` with 1,000 cents refunded. |
| Dispute opened | PASS (real) | Guest support projected `disputed` even when the dispute preceded Checkout completion. |
| Dispute lost | PASS (real) | Accepting the dispute projected `dispute_lost`; no Plus was granted. |
| Account deletion | PASS (automated) | Financial record retention with removed ownership and deletion privacy pass pgTAP. |
| Anonymous/authenticated DB isolation | PASS (automated) | RLS, sealed identifiers, grants, and mutation-denial pgTAP checks pass. |
| Route rate limiting | PASS (automated) | App-level bounded support limiter and retry behavior pass tests. |
| Deployment-wide rate limiting | BLOCKED | Vercel's required deployment-wide Firewall rule is not available on the current no-cost plan; no plan purchase was authorized. |
| Redaction inspection | PASS | Evidence, tracked diff, and final outputs were checked for keys, secrets, email addresses, provider IDs, Checkout URLs, and webhook bodies. |

### Provider and client coverage

| Scenario | Status | Current evidence |
| --- | --- | --- |
| Product/Price contract | PASS (real) | Same active product and currency; distinct active monthly, annual, and lifetime Prices with correct intervals. |
| Customer Portal configuration | PASS (real) | Update, invoice, period-end cancellation, and return controls observed. |
| Receipt/refund setting | PASS (real configuration) | Both sandbox email switches are enabled. Delivery to a monitored inbox remains blocked. |
| Sandbox branding/support copy | PASS (real configuration) | BibleQuest green/gold palette and required voluntary-support copy observed in hosted Checkout. |
| Signed webhook destination | PASS (real) | Current sandbox events reached the protected Preview and were processed. |
| Chrome/macOS | PASS | Critical Checkout, Portal, refund, and dispute paths exercised. |
| Safari/Firefox | BLOCKED | No authenticated browser sessions were available for this task. |
| Physical iPhone/PWA | BLOCKED | Requires user-owned physical-device interaction. |

## Bounded database evidence

No row identifiers or customer data were selected.

- Webhooks: **33 total, 33 processed, 0 failed, 33 distinct event claims,
  all test mode**.
- Recurring projection:
  - annual active Plus: 1;
  - monthly active Plus: 2 total, including 1 scheduled to cancel at period
    end.
- Lifetime projection:
  - dispute won, active Plus, $144.99: 1;
  - fully refunded, canceled/free, $144.99 refunded: 1.
- Support projection:
  - custom $3 guest success: 1;
  - signed-in $10 fully refunded: 1;
  - pre-fix $25 guest completion: 1;
  - post-fix $50 guest dispute lost: 1;
  - one pending $5 request associated with a canceled/failed attempt: 1.
- `stripe_billing_contract`, `stripe_support_contract`, and
  `operator_plus_grant_contract`: all `ok=true`.
- `subscriptions_external_subscription_key`: present.
- `stripe_signal_object_check` accepts the real Stripe Dispute `du_` prefix.

The pending $5 request is not a confirmed payment and granted no Plus. The
pre-fix $25 row records the ordering defect discovered before the fallback
mapping fix; the post-fix $50 run is the current proof.

## Defects found and fixed

1. Subscription upserts targeted a partial unique index that PostgREST could
   not use for `ON CONFLICT`. Migration `0031` installs a full unique
   constraint while preserving multiple null lifetime identifiers.
2. Portal cancellation updates with Stripe's scheduled `cancel_at` timestamp
   were not reflected as cancel-at-period-end. Projection now treats either
   provider signal as scheduled cancellation.
3. The billing-signal constraint expected the wrong Dispute prefix. Migration
   `0032` accepts Stripe's real `du_` prefix.
4. A support dispute could arrive before Checkout completion and be
   acknowledged before a PaymentIntent mapping existed. The webhook now
   retrieves the immutable support request metadata, validates any existing
   mapping, binds the PaymentIntent safely, and applies the refund/dispute
   transition. Regression tests cover the reversed order.

## Staging migration-history reconciliation

The verified non-production schema contains the required objects and every
billing/support/operator contract passes. However, the migration history
records only `0031` among the current `0029`–`0032` packet. The other schema
changes were applied as reviewed SQL during sandbox diagnosis and were not
falsely inserted into migration history.

This staging blocker is now **RESOLVED** by the higher-version attestation in
[`2026-07-29-staging-migration-reconciliation.md`](2026-07-29-staging-migration-reconciliation.md).
The clean 31-file schema diff and exact prehistory were verified before the
marker was recorded. The absent `0029`, `0030`, and `0032` rows were not
fabricated. Production reconciliation remains open and was not applied.

## Automated verification

Final commands and totals are recorded after the last source/evidence update:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS; lockfile unchanged and supply-chain policy check passed |
| Full Vitest suite | 90 files, 610 tests passed |
| `pnpm lint` | PASS; zero errors |
| `pnpm exec tsc --noEmit` | PASS; zero errors |
| `pnpm build` | PASS; Next.js production build completed and generated all 248 static pages |
| `pnpm test:headers` | 2 integration tests passed after a clean production build |
| `pnpm test:service-worker` | 1 file, 18 tests passed |
| `pnpm test:observability` | 2 files, 28 tests passed |
| `pnpm test:launch-evidence` | PASS; expected guest-only `REVIEW` fixture only |
| `pnpm check:seed` | PASS; generated content was unchanged |
| `pnpm audit --prod` and `--audit-level high` | PASS; no known production vulnerabilities |
| Local Supabase pgTAP | 18 files, 429 tests passed |
| 31-file migration SHA-256 manifest | PASS |
| `git diff --check` | PASS |

## Files changed by the sandbox proof

- `src/lib/billing/server.ts`
- `src/lib/billing/webhook.server.ts`
- `src/lib/support/records.server.ts`
- `supabase/migrations/0031_stripe_subscription_conflict_key.sql`
- `supabase/migrations/0032_stripe_dispute_signal_prefix.sql`
- `supabase/migrations/manifest.sha256`
- `supabase/tests/0031_stripe_subscription_conflict_key.sql`
- `supabase/tests/0032_stripe_dispute_signal_prefix.sql`
- `tests/migration-contract.test.ts`
- `tests/stripe-billing-projection.test.ts`
- `tests/stripe-webhook.test.ts`
- `tests/support-projection.test.ts`
- `docs/LAUNCH_RUNBOOK.md`
- `docs/launch-evidence/2026-07-29-stripe-sandbox-proof.md`

## Exact remaining Live gates

1. Review the completed staging attestation; stage `0031` and `0032` through
   the separate guarded production proposal without applying them.
2. Create a fresh authenticated, inbox-accessible, Test-Clock-backed sandbox
   identity and prove initial subscription failure, subscription 3DS
   success/cancel, renewal success, and renewal failure.
3. Complete two-way authenticated Account A/B isolation and a real test-account
   deletion.
4. Verify a success receipt and refund email in a monitored test inbox, and add
   the Stripe-hosted logo/icon.
5. Add or explicitly approve an alternative to the deployment-wide support
   Firewall rule.
6. Run Safari/Firefox and physical iPhone/PWA checks.
7. Obtain legal/business approval, configure reviewed live objects and secrets,
   then repeat the entire matrix in an approved Live-readiness window.

Until every gate is signed, keep Production in coming-soon mode with purchases
and support disabled.
