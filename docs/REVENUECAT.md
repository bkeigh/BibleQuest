# RevenueCat — Plus supporter tier

BibleQuest sells the **Plus** supporter tier through **RevenueCat** using the
web SDK (`@revenuecat/purchases-js`). Two stores back it:

- **Dev → Test Store.** Simulated purchases, no Stripe. Works today.
- **Prod → Web Billing** (RevenueCat's hosted checkout, backed by Stripe).

The integration **no-ops until `NEXT_PUBLIC_REVENUECAT_PUBLIC_KEY` is set** —
exactly like the Supabase auth scaffold. Unset = guest mode, Plus reads
"coming soon".

> **Ethos guardrail (Codex, Volume V §4):** nothing spiritual is ever gated.
> Plus is depth/personalization; Patron is pure support. The free app is
> complete. See `src/lib/questos/subscription-engine.ts`.

## Status

**Working now (dev):** `.env.local` holds the Test Store **public** key
(`test_JcwiYPNJAnOppiMEOzckQPUIGgk`, app `app56b1627be8`). Verified end-to-end:
`getOfferings()` returns Monthly/Yearly/Lifetime with live prices, the Test
Store checkout completes, and the `BibleQuest Plus` entitlement flips the card
to the member state with a "Manage your membership" link.

**RevenueCat objects** — project **BibleQuest** (`proj9a9cb3aa`):

| Object | Value |
| --- | --- |
| Entitlement | `BibleQuest Plus` (`entle5361b7f91`) |
| Offering | `default` (`ofrngb301a56083`), current |
| Packages | `$rc_monthly`, `$rc_annual`, `$rc_lifetime` (each → its product) |
| Paywall | `pw6ce54d5f990a44a5` — AI-designed draft, **not yet attached/published** |
| Test Store | `app56b1627be8` — Monthly $9.99 / Yearly $79.99 / Lifetime $99.99 |

## To activate the designed paywall (dashboard — I can't via API)

`presentPaywall()` renders the RevenueCat-designed paywall, but only once one is
**attached to the `default` offering and published**. The MCP API can't
attach/publish, so:

1. Open the paywall editor:
   `https://app.revenuecat.com/projects/9a9cb3aa/paywalls/pw6ce54d5f990a44a5/builder`
2. Attach it to the **`default`** offering and **Publish**.
3. Reload the app. `offering.hasPaywall` becomes true and the Plus card switches
   from the direct package buttons to a single **"Support with BibleQuest Plus"**
   button that opens the paywall. No code change needed.

Until then the app uses the **fallback**: direct package purchase buttons
(fully functional on the Test Store).

## To go live with real money (Web Billing)

1. **Link a Stripe account** to RevenueCat (test mode is fine for sandbox).
2. **Create a Web Billing app** (`rc_billing`) + its Monthly/Yearly/Lifetime
   products with prices. (Once Stripe is linked I can create the app + attach
   products/packages via the API — just ask.)
3. Attach those products to the `BibleQuest Plus` entitlement and the
   `$rc_monthly`/`$rc_annual`/`$rc_lifetime` packages.
4. Grab the Web Billing **public** key (`rcb_…`) and set
   `NEXT_PUBLIC_REVENUECAT_PUBLIC_KEY=rcb_…` in **Vercel** (swap the `test_` key).

> **Price decision:** Test Store shows **Monthly $9.99**, but the app copy says
> "**around $5/mo**" (`src/components/plus/PlusContent.tsx`). Reconcile the copy
> and the real Web Billing price. The UI always shows RevenueCat's formatted
> price, so nothing is hardcoded.

## Patron tier (later)

Patron has **no entitlement** — support, not access — so it never appears in
`entitlements.active` and never maps to a plan. Give it its own product/flow;
never attach it to `BibleQuest Plus`.

## How the code is wired

- `src/lib/revenuecat/client.ts` — lazy SDK config (dynamic import → out of the
  server bundle), `isRevenueCatConfigured()`, app-user-id = Supabase id when
  signed in else a persisted anonymous id (`biblequest:rc-anon-id`), `changeUser`
  on sign-in.
- `src/lib/revenuecat/usePlus.ts` — `usePlus()`: offerings, live entitlement →
  plan, `presentPaywall()` (preferred), `purchase()` (fallback),
  `openCustomerCenter()` (→ `managementURL`), `hasPaywall`, `refresh()`.
- `src/lib/questos/subscription-engine.ts` — `planFromActiveEntitlements()`
  maps `BibleQuest Plus` → `plan: "plus"`.
- `src/components/plus/PlusCta.tsx` — the Plus card footer: coming-soon →
  paywall / package buttons → member + manage.

**Notes**
- **Customer Center**: the full component is mobile-only (iOS/Android/RN/Flutter).
  On web the equivalent is the RevenueCat-hosted **`managementURL`** (cancel /
  update payment), which is what "Manage your membership" opens.
- **No stylesheet import**: `purchases-js@1.47` injects its paywall/checkout
  styles at runtime; the package's `./styles` export is stale (ships no CSS).
- **Reset a test customer**: clear `localStorage["biblequest:rc-anon-id"]` to get
  a fresh anonymous customer with no entitlement.
- **Identity/restore**: guests purchase under an anonymous id (device-local). For
  durable cross-device restore, land Supabase auth — the SDK moves to the user id
  via `changeUser`. Plus is cosmetic, so anonymous is acceptable to launch.
