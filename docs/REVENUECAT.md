# RevenueCat Plus integration

Last reviewed against RevenueCat documentation: **2026-07-16**.

BibleQuest Plus adds optional depth and helps support the mission. Scripture,
prayer, reflection, quests, the journey, and every essential spiritual feature
remain complete on the free plan. Patron is support-only and must never grant a
spiritual entitlement.

## Safe default and activation modes

Billing is deny-by-default. A public key by itself does not enable the SDK or a
purchase control.

| `NEXT_PUBLIC_REVENUECAT_BILLING_MODE` | Required key | Behavior |
| --- | --- | --- |
| unset or `coming-soon` | none | No SDK import, no RevenueCat requests, no purchase controls. This is the launch recommendation. |
| `sandbox` | Test Store public key (`test_…`) | Test Store offerings/paywall only; simulated outcomes, no real charge. |
| `live` | Web Billing public key (`rcb_…`) | Real billing may be presented, but only after all production gates below pass. |

Unknown modes, missing keys, secret keys, whitespace-damaged keys, and a key
whose prefix does not match the mode are invalid and render no purchase
controls. Only RevenueCat's public SDK key may be stored in a `NEXT_PUBLIC_*`
variable. Secret keys (including `sk_…`) are server credentials and must never
be committed, placed in client code, or set as `NEXT_PUBLIC_*`.

The currently available local Test Store key remains in ignored `.env.local`.
Do not copy its value into code, documentation, issues, logs, screenshots, or
test output.

## Purchase readiness gate

The Plus CTA appears only when all of these are true:

1. Billing mode is explicitly `sandbox` or `live`.
2. The matching public SDK key is present and valid.
3. Supabase session restoration has finished, if Supabase is configured.
4. RevenueCat returns a `current` offering.
5. That current offering has at least one available package.
6. A paywall is attached to that offering and published (`hasPaywall`).

There is deliberately no direct-package fallback. Draft paywalls, non-current
offerings, empty offerings, missing products, fetch errors, and partial
configuration cannot produce a purchase button.

The Web SDK's `presentPaywall()` owns package selection and checkout. When it
resolves, BibleQuest applies the returned `CustomerInfo`, fetches fresh
offerings/customer info, and refreshes again on window focus, `pageshow`,
visibility return, and reconnect. This covers paywall completion, a tab-based
checkout return, bfcache restore, and return from the management portal.

## Identity model

- A guest receives a RevenueCat anonymous App User ID. It is stored only in
  local storage under `biblequest:rc-anon-id` and reused across reloads on that
  browser.
- The SDK is not configured while Supabase is still restoring a session. This
  avoids briefly creating/aliasing a guest before a known account appears.
- Guest → signed-in uses RevenueCat identification so a legitimate guest
  purchase follows the new account. A fresh anonymous ID is persisted
  immediately afterward.
- Signed-in A → signed-in B uses `changeUser` without aliasing. Entitlements do
  not transfer between accounts.
- Signed-in → signed-out changes to a newly generated anonymous identity. It
  never reuses the anonymous ID that was associated with the signed-in account.
- Configuration, identity changes, offering reads, entitlement reads, and
  paywall operations are serialized. Stale results are also keyed to the active
  session before they can update UI.
- During session restoration or any identity change, visible membership state
  is loading with the free plan. A prior user's Plus state is never retained or
  flashed on a shared device.

App User IDs, anonymous IDs, CustomerInfo identifiers, purchase/transaction
identifiers, operation session IDs, management URLs, and redemption data are
sensitive operational data. BibleQuest does not send them to analytics and
does not log or display them in normal UI.

## State coverage

| State | User-visible behavior | Purchase control? |
| --- | --- | --- |
| Coming soon | Calm planned-price copy; free promise remains prominent. | No |
| Unconfigured/invalid | Membership unavailable while setup is completed. | No |
| Loading/identity transition | Neutral loading copy; effective plan is free. | No |
| Load error | Generic retry message; raw SDK details are not shown. | No |
| Free + incomplete offering | Membership options are not ready. | No |
| Free + complete current paywall | One button opens the RevenueCat paywall. | Yes |
| Purchase cancelled | No changes were made; the CTA remains available. | Yes |
| Purchase failed | Generic failure/no-confirmed-charge copy; retry is allowed. | Yes |
| Plus + management URL | Member thanks plus “Manage your membership.” | No new-purchase CTA |
| Plus + no safe management URL | Access stays active; explicit refresh action is shown. | No |

Only the exact `BibleQuest Plus` entitlement (or the explicit entitlement env
override) maps to Plus. Patron and every unknown entitlement map to free.
Cancelling checkout maps to `purchase-cancelled`. Cancelling renewal is
different: Plus remains active through the paid entitlement period and becomes
free only after RevenueCat reports that entitlement inactive/expired.

## Test Store checklist (no production billing)

Dashboard gates:

- [ ] Work only in the BibleQuest Test Store; do not connect Stripe.
- [ ] Confirm the intended Test Store products exist and use simulated prices.
- [ ] Confirm every Plus product is attached to the `BibleQuest Plus`
      entitlement.
- [ ] Confirm the intended offering is marked current.
- [ ] Confirm the current offering contains the intended packages and no Patron
      product grants the Plus entitlement.
- [ ] Attach the reviewed paywall to the current offering and publish it for the
      Test Store only.
- [ ] If guest purchases are enabled, review RevenueCat Redemption Links and
      identity behavior before claiming cross-device recovery.
- [ ] Optionally restrict sandbox entitlement access to approved test App User
      IDs in RevenueCat's Sandbox Testing Access settings.

Local gates:

- [ ] Keep the Test Store public key only in ignored `.env.local`.
- [ ] Set `NEXT_PUBLIC_REVENUECAT_BILLING_MODE=sandbox` locally; never set this
      mode in Vercel production.
- [ ] Load Plus as a fresh guest and confirm exactly one paywall CTA appears.
- [ ] Simulate cancel: no error, no entitlement, no charge, retry remains.
- [ ] Simulate failure: generic failure copy, no entitlement, retry remains.
- [ ] Simulate success: Plus becomes active after checkout closes.
- [ ] Reload and return from another tab; Plus remains active.
- [ ] Buy as guest, sign in, and confirm Plus follows the account.
- [ ] Sign out and confirm the new guest is free.
- [ ] Sign in as account B on the same browser and confirm account A's Plus does
      not appear, even briefly.
- [ ] With Plus active, open management when a URL exists; return and confirm a
      refresh. Also test a fixture/customer with no management URL.
- [ ] Remove the current offering, packages, or published paywall one at a time;
      each incomplete state must remove all purchase controls.
- [ ] Confirm no customer, anonymous, purchase, transaction, operation-session,
      management, or redemption identifiers enter analytics/network events.

## Sandbox-to-production checklist

These are manual gates, not actions authorized by this implementation. Keep
production in `coming-soon` until every item has evidence and an explicit
go-live decision.

RevenueCat and payment-provider gates:

- [ ] Choose the billing engine and document merchant-of-record, tax, refund,
      cancellation, support, and country-availability responsibilities.
- [ ] Obtain owner approval before connecting a Stripe account or creating any
      live Web Billing configuration.
- [ ] Create live products/prices only after the final price decision; verify
      currency, interval, trial/discount behavior, tax treatment, and displayed
      copy independently.
- [ ] Attach only live Plus products to the Plus entitlement. Patron remains
      support-only and grants no spiritual access.
- [ ] Create a separate live offering, mark the intended offering current, and
      attach/publish the final reviewed paywall.
- [ ] Configure and verify the web customer portal/cancellation path, receipts,
      support address, refund policy, and required legal links.
- [ ] Verify the Web Billing public SDK key starts with the documented public
      prefix; never create or expose a secret key for this client integration.
- [ ] Confirm sandbox URLs/Test Store keys are not present in production and
      live URLs/keys are not present in preview/local sandbox environments.

Staging and release gates:

- [ ] Rehearse success, cancel, failure, delayed return, renewal, cancellation,
      expiration, billing issue, management unavailable, guest → account,
      sign-out, and account A → B in a payment-provider sandbox.
- [ ] Verify CSP in the staged live-mode build permits only the required
      RevenueCat/Stripe origins and that coming-soon builds permit neither.
- [ ] Verify privacy policy, terms, pricing, giving pledge, support workflow,
      refund language, and cancellation instructions against actual behavior.
- [ ] Verify no billing/customer identifiers reach analytics, logs, error
      reports, URLs owned by BibleQuest, or support screenshots.
- [ ] Run the full automated and manual QA checklist from a clean checkout.
- [ ] Obtain an explicit launch approval and rollback owner.
- [ ] Set the live public key and
      `NEXT_PUBLIC_REVENUECAT_BILLING_MODE=live` only in the intended Vercel
      environment, redeploy intentionally, and execute post-deploy smoke tests.
- [ ] Roll back immediately to `coming-soon` if offering, entitlement, identity,
      management, legal, tax, price, or monitoring evidence is incomplete.

## Current recommendation

Ship **coming-soon**, not live billing. Test Store sandbox validation is useful
and supported locally, but production billing should remain disabled until the
manual RevenueCat/payment-provider, legal/tax/support, staging, and Vercel gates
above are complete. This implementation does not attach/publish a paywall,
connect Stripe, create products, change prices, deploy, or alter Vercel.

## Primary references

- [RevenueCat Web SDK](https://www.revenuecat.com/docs/web/web-billing/web-sdk)
- [RevenueCat Web Paywalls](https://www.revenuecat.com/docs/web/paywalls)
- [RevenueCat Test Store](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store)
- [Identifying customers](https://www.revenuecat.com/docs/customers/identifying-customers)
- [CustomerInfo and management URL](https://www.revenuecat.com/docs/customers/customer-info)
- [API keys and authentication](https://www.revenuecat.com/docs/projects/authentication)
- [Testing web purchases](https://www.revenuecat.com/docs/web/web-billing/testing)
