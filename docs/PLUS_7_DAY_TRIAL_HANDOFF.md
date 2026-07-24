# BibleQuest Plus: 7-day trial handoff

Last audited: **2026-07-23**.

This handoff prepares a dedicated Plus release without enabling charges in the
current launch. Production must remain `coming-soon` until every decision and
test below is complete.

## Verified current state

- Production billing is `coming-soon`.
- Vercel Production has no RevenueCat Web Billing key or mode.
- RevenueCat has one Test Store app and the existing `BibleQuest Plus`
  entitlement.
- Test Monthly, Yearly, and Lifetime products are attached to the current
  offering. Monthly and Yearly have no trial.
- The current offering has no attached paywall.
- The existing unattached draft paywall is unsafe to publish. It advertises
  unimplemented AI and private-journal insight features and shows sample prices.
- One-time Stripe support is separate and remains unavailable until the
  server-only `STRIPE_DONATION_URL` is intentionally configured.

## Architecture decision

Use **RevenueCat Web Billing connected to Stripe** for web subscriptions.
RevenueCat stays the client entitlement authority across web and the later iOS
app. Stripe account credentials remain inside Stripe and RevenueCat.

The BibleQuest frontend needs only these browser-safe values after final
approval:

```dotenv
NEXT_PUBLIC_REVENUECAT_BILLING_MODE=live
NEXT_PUBLIC_REVENUECAT_PUBLIC_KEY=rcb_...
NEXT_PUBLIC_REVENUECAT_PLUS_ENTITLEMENT=BibleQuest Plus
```

Never put a Stripe secret, RevenueCat secret, database password, service-role
key, webhook secret, or Customer ID in a `NEXT_PUBLIC_*` variable.

## Founder decisions required first

- [ ] Final Monthly price and currency.
- [ ] Whether to offer Annual and its final price.
- [ ] Whether Lifetime should be removed. Default recommendation: remove it.
- [ ] Tax, refund, cancellation, and country-availability posture.
- [ ] Stripe statement descriptor and customer-portal settings.
- [ ] Final Privacy, Terms, and renewal language.
- [ ] Support flow using `biblequestco@proton.me`.
- [ ] Explicit approval of the final paywall screenshot and test receipts.

## Provider setup

1. Create or select a separate Stripe Sandbox.
2. In the BibleQuest RevenueCat project, connect Stripe through RevenueCat's
   Stripe Marketplace integration. The project owner must complete this step.
3. Create the Web Billing sandbox configuration.
4. Create or import the approved recurring Monthly and optional Annual prices.
5. Configure a **7-day trial** on each intended recurring product.
6. Attach only approved products to `BibleQuest Plus`.
7. Attach those products to the intended Monthly/Annual packages in the current
   offering. Remove Lifetime unless it was explicitly approved.
8. Replace the unsafe draft paywall. Attach the reviewed replacement to the
   current offering only after sandbox review.
9. Configure Stripe Customer Portal, receipts, failed-payment handling,
   trial-ending notices, tax behavior, refunds, and the statement descriptor.
10. Keep Vercel Production in `coming-soon` throughout sandbox QA.

## Approved benefit boundary

Plus may promise only behavior the app currently ships:

- Unlimited active quest windows.
- Unlimited daily verse refreshes.
- The full still and live wallpaper collection.
- A private, on-device finder over reviewed quests by focus, category, and
  time. It never reads prayer or reflection journals.
- Support for continued free access to BibleQuest.

Do not promise AI study, spiritual scoring, journal-derived insights,
unreviewed generated devotionals, or personalized theology.

## Paywall copy template

Replace every placeholder before review:

> **Try BibleQuest Plus free for 7 days**
>
> More room for quests, unlimited verse refreshes, every wallpaper, and a
> private way to find the right reviewed quest.
>
> **7 days free, then [PRICE] every [MONTH/YEAR].** Your subscription renews
> automatically until canceled. Cancel before the trial ends to avoid a
> charge. BibleQuest remains complete on the free plan.

The paywall must show direct Privacy, Terms, restore, and cancellation links
and the exact plan/currency selected by the customer.

## Sandbox evidence required

- [ ] A signed-in account is required before trial checkout.
- [ ] Success grants only the exact `BibleQuest Plus` entitlement.
- [ ] Cancel and failure grant nothing and show no confirmed-charge copy.
- [ ] Trial conversion, cancellation, expiration, billing issue, and renewal
      each produce the expected access state.
- [ ] Customer Portal opens safely and return-to-app refreshes membership.
- [ ] Guest → account, sign-out, and account A → B never leak entitlement.
- [ ] Browser ↔ installed PWA restore works on a physical iPhone.
- [ ] Offline/reconnect and tab return refresh membership.
- [ ] CSP permits only required RevenueCat/Stripe origins in billing builds.
- [ ] No customer, transaction, or subscription identifiers enter analytics,
      URLs, screenshots, client-visible database rows, or logs.
- [ ] Webhook delivery is idempotent and fail-closed before any paid server
      feature trusts the subscription table.
- [ ] Exact price, trial, renewal, cancellation, refund, Privacy, Terms, and
      support copy matches provider behavior.

For native iOS, create App Store products and the same 7-day introductory offer,
then attach them to the same RevenueCat packages and entitlement. Do not use
Stripe checkout inside the native iOS purchase flow.

## Dedicated implementation prompt

> Work from clean final `main`. Prepare BibleQuest Plus for a 7-day free trial
> without enabling production charges. Require a signed-in Supabase account
> before checkout. Keep RevenueCat as the client entitlement authority. Add
> fail-closed server entitlement verification and an authenticated,
> idempotent RevenueCat webhook mirror before any paid server feature trusts
> Plus. Remove hard-coded prices and unsupported benefit claims. Align every
> Plus surface around unlimited quest windows, unlimited verse refreshes, the
> full wallpaper collection, and private on-device selection from reviewed
> quests. Add trial, conversion, cancellation, expiration, billing failure,
> account-switch, installed-PWA restore, webhook ordering, and CSP tests. Keep
> Production `coming-soon`. Stop for founder decisions on Monthly/Annual
> prices, Lifetime removal, Stripe Sandbox connection, tax/refund/legal
> posture, and final paywall approval.

Primary provider references:

- [RevenueCat Stripe Billing](https://www.revenuecat.com/docs/web/integrations/stripe)
- [RevenueCat Web SDK](https://www.revenuecat.com/docs/web/web-billing/web-sdk)
- [RevenueCat Web Paywalls](https://www.revenuecat.com/docs/web/paywalls)
- [RevenueCat webhooks](https://www.revenuecat.com/docs/integrations/webhooks)
