# iOS Stripe Customer Portal handoff

**Scope:** Task 6 implementation contract; account-enabled United States iOS
integration only. This work does not change the guest-only release artifact,
enable a commerce/account/CORS latch, deploy, submit to Apple, or configure
Stripe Live.

## Policy decision

Reviewed on **August 11, 2026**:

- [Apple App Review Guidelines 3.1.1(a)](https://developer.apple.com/app-store/review/guidelines/#payments)
  says external purchase-link entitlements are not required for United States
  storefront apps. The separate reader-app account-management allowance is not
  assumed for BibleQuest.
- [Apple StoreKit `Storefront`](https://developer.apple.com/documentation/storekit/storefront/)
  defines the current App Store storefront and warns that it can change. That
  state must be read immediately before presenting management availability; it
  must not be replaced by locale, IP address, GPS, language, billing address,
  or a user-entered country.
- [Stripe's iOS Customer Portal guide](https://docs.stripe.com/mobile/digital-goods/customer-portal)
  directs an app to create a short-lived Portal session server-side, open the
  URL in Safari, and refresh subscription state from webhooks/current server
  state after return.
- [Stripe's Portal Session API](https://docs.stripe.com/api/customer_portal/sessions/object)
  documents the customer, livemode, return URL, and short-lived hosted URL
  fields that BibleQuest validates before returning a destination.

Stripe's Portal guide also discusses EEA behavior, but the reviewed BibleQuest
commercial scope and Apple's general external-link exception in this project
are United States storefront only. Native management therefore stays behind
the same US storefront decision as acquisition until a separate Apple-policy
review approves a broader scope.

App Store storefront state controls only whether the native action is shown.
It never identifies a BibleQuest user, selects a Stripe Customer, or grants,
extends, cancels, or restores Plus.

## Server contract

`POST /api/billing/portal` has a zero-byte request body.

- Web callers must be same-origin and authenticate with the existing cookie
  context.
- Native callers must present the exact reviewed Capacitor origin while the
  server-only native-origin latch is enabled, then pass the existing verified
  Supabase bearer-token boundary. The origin alone is never authentication.
- The route derives the user ID only from that authenticated context, queries
  the sealed `stripe_customers` mapping by that user ID, and requires the row's
  `livemode` to match the complete server Stripe configuration.
- The billing schema contract and the existing account-scoped 10-second Portal
  action claim must pass before provider access.
- Customer ID, return URL, mode, flow, and Portal configuration are not request
  fields. Any body, including `{}`, is rejected.
- The fixed return destination is
  `/app/plus?portal=returned` on the configured application origin. It is only
  a display/reconciliation hint.
- A provider response is accepted only when it echoes the mapped Customer,
  configured livemode, and fixed return URL and supplies a credential-free URL
  on exactly `https://billing.stripe.com`.
- Success returns only `{ "url": "..." }` with `Cache-Control: private,
  no-store`. Provider/database/configuration details remain private.

The pinned Stripe client already supplies a 10-second request timeout and two
bounded network retries. No access token, email, Stripe URL, private writing,
or provider response body is added to application logs.

## Integration contract for Tasks 2 and 5

Task 2 owns the native StoreKit storefront lookup and system-browser bridge.
Its `PurchaseAdapter.manage()` implementation must:

1. fail closed unless a fresh `Storefront.current.countryCode` is `USA`;
2. call `/api/billing/portal` through `apiFetch` so native bearer identity is
   attached;
3. accept only an HTTPS URL on exactly `https://billing.stripe.com`, with no
   credentials or lookalike host;
4. open that URL in the system browser, never the Capacitor WebView; and
5. expose `PurchaseAdapter.available` as the shared, current reviewed-storefront
   eligibility used by both purchase and management presentation.

Before opening a returned URL, Task 2 must also confirm that the native auth
subject/generation that started the request is still current. If sign-out or an
account switch occurs while the request is in flight, discard the URL rather
than opening the prior account's Portal.

This branch does not edit or duplicate that adapter. Until Task 2 is merged,
the existing native adapter remains unavailable and no native Portal action is
shown.

Task 5 may consolidate return parsing, but must preserve the fixed
`portal=returned` hint and the coordinator behavior here: after an explicit
Portal return, or after focus returns to the same app instance that opened the
Portal, call the authenticated refresh boundary and then reload status. A
duplicate focus/visibility event must not create another Portal session or
grant access. The server projection remains the only entitlement authority.

## Truthful state behavior

- Cancellation at period end keeps Plus active only through the server's
  confirmed period end and says renewal is canceled.
- Immediate cancellation shows Plus inactive only after the server projection
  reports `canceled`.
- `past_due`, `unpaid`, `incomplete`, and `paused` show that billing needs
  attention and do not grant Plus.
- Payment-method changes have no client-side entitlement effect; return/focus
  triggers reconciliation.
- A missing Customer mapping returns `404 not_found`, creates no Customer, and
  shows no management action.
- Every failure explicitly leaves local Scripture, prayers, reflections, and
  journey data unchanged. Portal, refresh, and status code never clear local
  spiritual data.

## Manual sandbox and production-owner steps

Before integrated device testing, a human billing owner must configure and
record the default **Stripe sandbox** Customer Portal settings. Enable only the
reviewed subscription cancellation, payment-method update, and invoice-history
features. Exercise cancellation at period end and immediate cancellation in
separate recorded sandbox configurations if Stripe's configuration permits
only one cancellation behavior at a time. Keep sandbox Customers, Prices,
subscriptions, Portal configuration, and evidence separate from Live.

After Tasks 1, 2, 3, 5, and 6 are integrated, test on a physical device with a
disposable account and Stripe sandbox state:

- US, non-US, unknown, changing, and stale storefront results;
- duplicate taps and app focus/visibility duplicates;
- payment-method update, failed renewal, scheduled cancellation, immediate
  cancellation, manual return, browser cancellation, offline return, and no
  Customer mapping;
- account A to account B switching while the browser is open; and
- force quit/relaunch with confirmation that server status alone controls Plus
  and local spiritual data remains intact.

Before any production enablement, separately review the current Apple and
Stripe policy again, restrict App Store availability and native management to
the approved storefront scope, configure and review the Stripe **Live** Portal,
verify exact production origin/CORS/bearer behavior, update App Review notes,
and repeat the device and webhook lifecycle matrix. Those steps are not proof
provided by this branch.
