# iOS account-enabled US release compliance package

**Status:** HOLD — implementation and review package only; no production
account, commerce latch, App Store availability, submission, or release was
changed by this work.

**Scope:** a future account-enabled BibleQuest iPhone build available only on
the United States App Store storefront, with email numeric-code authentication
and optional Plus acquisition through Stripe Checkout in Safari. This is not a
StoreKit purchase design and does not claim BibleQuest is a reader app.

## Keep this package separate from guest-only 1.0

[`APP_STORE_SUBMISSION.md`](APP_STORE_SUBMISSION.md),
[`IOS_RELEASE_READINESS.md`](IOS_RELEASE_READINESS.md), and
`pnpm ios:release:prepare` remain the canonical guest-only 1.0 package. Their
empty collected-data manifest, no-login review notes, and no-commerce claims
must not be reused for an account build.

The account build needs a separate deterministic preparation command from the
neighboring implementation task. It must emit the receipt described below and
select [`PrivacyInfo.account-us.xcprivacy`](../ios/compliance/PrivacyInfo.account-us.xcprivacy)
for the archived App target. The template is intentionally not a member of the
current Xcode target, so the guest archive continues to receive only
`ios/App/App/PrivacyInfo.xcprivacy`.

Passing a guest gate does not clear this package. Passing this package does not
clear or alter the guest submission.

## Policy conclusion and limits

Apple App Review Guideline 3.1.1(a), last updated June 8, 2026, says an
external-purchase entitlement is not required for buttons, links, or calls to
action in a United States storefront app. Stripe's current iOS digital-goods
Checkout guide describes a server-created Checkout Session with
`origin_context=mobile_app` whose returned URL opens in Safari. Those sources
support the proposed US-only app-to-web flow as of August 11, 2026.

That conclusion has narrow boundaries:

- App Store Connect availability must be exactly United States (`USA`), with
  automatic future storefront inclusion off. Apple notes that previously
  downloaded apps can still receive updates after a storefront is removed, so
  availability settings are not the only runtime control.
- Purchase UI must also fail closed unless
  `StoreKit.Storefront.current.countryCode` is exactly `USA`. IP address,
  locale, app language, GPS, a user-entered country, redirect parameters, and
  cached flags are not substitutes.
- StoreKit is used only to read current storefront state. This release has no
  StoreKit products, transactions, receipts, purchasing, or entitlement
  projection. No StoreKit external-purchase entitlement is added.
- Checkout and the customer portal open in the system browser. No Stripe
  Elements, embedded form, card field, or payment WebView belongs in the app.
- A redirect, Checkout completion page, query parameter, browser return, or
  client cache never grants Plus. The authenticated server status projection
  remains authoritative after signed webhooks and current Stripe state.
- This US exception is not generalized to any other storefront, and this
  package makes no reader-app eligibility claim.

Re-check both Apple and Stripe immediately before submission; a policy change
after the access date is a release stop.

## Review notes draft

Paste only after replacing every bracketed field with current App Store Connect
facts. Reviewer email access or credentials belong in App Store Connect, never
in the repository or test evidence.

```text
BibleQuest is a local-first Christian companion. A login is optional: a reviewer can complete onboarding and use the bundled World English Bible, prayers, reflections, quests, games, Journey, export, clear, and on-device reminders as a guest.

Accounts use email numeric codes only. BibleQuest does not offer Google, Facebook, or another social login in this build. To review account sync, use [REVIEW EMAIL] and retrieve the current numeric code using [REVIEWER-ACCESSIBLE OTP INSTRUCTIONS]. The code expires and must not be placed in these notes. After verification, choose [START FRESH / CLAIM THE PREPARED SYNTHETIC JOURNEY] as described below.

Signed-in sync covers the profile, prayers, reflections, bookmarks, Scripture reading progress, quests, Journey events, settings, and pilgrimage progress named in the final build receipt. Unfinished writing drafts, native reminder choices and schedules, standalone game state, and Rhythm state stay on this device. Settings explains this boundary. Guest data remains local unless the person explicitly adopts it into an account.

This version is available only on the United States App Store storefront. Plus purchase UI fails closed unless StoreKit reports countryCode USA. StoreKit is not used to purchase or grant Plus. An eligible signed-in free account can ask BibleQuest's server to create a Stripe Checkout Session; the exact checkout.stripe.com URL opens in Safari. The app contains no embedded payment form. Returning to the app only triggers a server refresh; the browser return and its parameters cannot grant access.

Plus [FINAL FEATURES] costs [FINAL MONTHLY PRICE AND PERIOD], [FINAL ANNUAL PRICE AND PERIOD], or [FINAL LIFETIME PRICE AND DEFINITION]. Recurring plans renew until canceled. Before opening Checkout the app shows the price, period, renewal, cancellation, and Terms/Privacy disclosures. A person with an eligible Stripe customer can open the Stripe-hosted billing portal from Settings to cancel. Cancellation stops a future renewal while already-paid access follows the displayed terms. [OWNER-APPROVED REFUND AND ACCOUNT-DELETION BILLING OUTCOME].

To review Plus without making a charge, use [OWNER-APPROVED NO-CHARGE REVIEW PATH]. This account's Plus state comes from the server; it is not a client flag. Do not enter a real card solely for review.

Account deletion is available in Settings → Delete account. It deletes the authenticated identity and its synced journey, then clears the Keychain credential, local journey, protected native mirror, reminders, drafts, game/Rhythm data, and avatar for that account without touching another account. [FINAL ACTIVE-SUBSCRIPTION CANCELLATION/RETENTION EXPLANATION]. Settings also offers a readable device-Journey export and a separate Clear my data control.

Suggested complete path:
1. Launch → continue as guest → finish onboarding.
2. Open Home, Bible, a reflection, a quest, a game, Journey, and Settings → Privacy & data.
3. Settings → Account sync → enter [REVIEW EMAIL] → enter the emailed numeric code → [HANDOFF CHOICE].
4. Create synthetic prayer/reflection and bookmark/progress data; relaunch and verify the same account restores it. Confirm the native reminder and unfinished-draft boundary stays device-only.
5. Open Plus with the free review account. Confirm price/renewal/cancellation copy, then open Safari Checkout and cancel without payment.
6. Use [PLUS REVIEW ACCOUNT/PATH] to verify server-projected Plus and open the Stripe-hosted billing portal/cancellation path.
7. Return to Settings → export, clear, support, Terms, Privacy, and Delete account. Complete deletion only with the disposable deletion account and verify relaunch shows no retained session or journey.

Public destinations are limited to [FINAL EXACT ORIGIN LIST]. AI and analytics are disabled in this iOS profile.
```

### Reviewer-account hard stops

- The reviewer must be able to receive a fresh email code without contacting a
  person synchronously. A static OTP is not a valid description of this flow.
- Prepare separate disposable free, Plus/cancellation, and deletion journeys if
  one action would make the remaining path unavailable.
- Establish a no-charge Plus review path that uses the same server-authoritative
  production contract as the submitted binary. Do not mix a Stripe test object
  into a live account or claim an operator grant proves portal cancellation.
- Do not put access tokens, OTPs, Checkout URLs, Stripe identifiers, private
  writing, or reviewer mailbox secrets in notes or evidence.

## Data location and behavior disclosed to review

| Data or behavior | Guest | Signed-in account | Account deletion expectation |
| --- | --- | --- | --- |
| Email numeric-code identity | None | Supabase Auth email, identity, session and audit records | Delete Auth identity and local credential; document short-lived JWT and provider-log retention |
| Profile and optional avatar | Device profile; native photo selection remains subject to the final binary | Profile sync; avatar object only if the final iOS control is present | Remove owned avatar object before Auth identity, then local avatar |
| Prayers, reflections, bookmarks, reading, quests, Journey, pilgrimage | Device and protected native mirror | Per-user protected sync plus device copy | Purge only that account's rows, mirror, and device copy |
| Unfinished prayer/reflection drafts | Device only, bounded local retention | Device only | Purge device drafts |
| Native reminder preferences, schedules, delivered notifications | Device only | Device only | Cancel owned schedules, remove delivered notifications and local preference |
| Standalone game and Rhythm state | Device only in the initial contract | Device only until a separate reviewed sync contract says otherwise | Purge device stores |
| Stripe customer, purchase, invoice, refund and dispute state | None | Server/provider financial state linked to the account where allowed | Cancel/resolve active recurring billing; detach unnecessary app ownership; retain only the owner-approved legal/financial record |
| Analytics | Off | Off | No queue or transport to delete |
| AI prompts and responses | Off | Off | No AI processing occurs in this profile |

Any neighboring task that syncs drafts, native reminders, games, Rhythm, or AI
must stop and update this table, the Privacy Policy, the privacy manifest, App
Store privacy answers, deletion coverage, and the release gate before review.

## App Store privacy-answer worksheet

These are draft answers for the reviewed initial contract, not proof of the
answers currently saved in App Store Connect. The release owner must compare
them with the archived privacy report, network capture, provider dashboards,
contracts, and the exact selected binary.

| App Store data type | Draft answer | Link/purpose | Evidence and caveat |
| --- | --- | --- | --- |
| Contact Info — Name | Collected | Linked; App Functionality | Synced display name. BibleQuest does not require a legal name. |
| Contact Info — Email Address | Collected | Linked; App Functionality | Email-code identity and account contact. |
| Sensitive Info | Collected | Linked; App Functionality | Prayers, reflections, and other religious or philosophical writing can reveal protected beliefs. |
| User Content — Photos or Videos | Not collected by the reviewed initial native contract | Conditional | The current iOS UI does not offer an avatar upload. An avatar uploaded on another platform may be displayed and must still be deleted with the account. If the final binary adds native upload, select this type and add it to the manifest before release. |
| User Content — Other User Content | Collected | Linked; App Functionality | Prayers, reflections, notes, bookmarks, quest/Journey content. |
| Identifiers — User ID | Collected | Linked; App Functionality | Supabase account ID and server-side Stripe customer/subscription linkage. |
| Purchases — Purchase History | Collected | Linked; App Functionality | Plan, status, period, transaction outcome and entitlement projection. |
| Usage Data — Product Interaction | Collected | Linked; App Functionality | Synced reading position, quest completion, progress, and Journey activity. Do not select Analytics as a purpose while analytics is off. |
| Financial Info — Payment Info | Owner/legal decision required | Do not guess | Stripe collects payment details in Safari and BibleQuest says it does not receive full card numbers. Confirm what Stripe makes available to the merchant and how Apple's collection definition applies to this external-browser flow. |
| Diagnostics / Other Data / Coarse Location / Device ID | Provider review required | Do not default to “not collected” | Supabase Auth audit logs document user ID, IP address, user agent and auth action. Inspect final Supabase, Vercel, Stripe and email-provider logs, purposes, access, and retention. Add every applicable App Store data type and privacy-manifest entry. |
| Tracking | No, pending final contract confirmation | Not used for tracking | Manifest says false; analytics, advertising and cross-company tracking must remain off. Stripe's own Checkout privacy behavior still needs owner/legal review. |
| AI processing | Not collected for AI in this profile | AI off | If AI is enabled, stop release and disclose the processor, exact content sent, retention/training terms, sensitive-info handling, consent, safety copy and deletion path. |

The account manifest template declares the current positive baseline and allows
additional reviewed types. It cannot resolve the diagnostics/provider row for
the owner. Do not copy the guest manifest's empty list or treat the privacy
manifest as a replacement for App Store Connect answers.

## Privacy Policy and provider-retention reconciliation

The checked-in Privacy Policy now states the initial iOS device-only boundary,
clarifies that a signed-in iOS request to BibleQuest can carry an account
credential while private content and account identity are not sent to a Bible
text provider, and distinguishes a Journey export from a complete provider or
payment-record export.

Current provider documentation establishes only these general facts:

- Supabase documents that Auth audit logs can contain user ID, IP address,
  user agent, and authentication action. Its published plan table currently
  lists API/database log retention of 1 day (Free), 7 days (Pro), 28 days
  (Team), and 90 days (Enterprise), while Auth audit-log access differs by plan.
- Supabase documents daily database-backup access of 7 days for Pro, 14 days
  for Team, and up to 30 days for Enterprise. Storage objects are not inside
  those database backups, and restoring an old database backup does not restore
  a Storage object deleted after the backup.
- Supabase documents that an Auth user cannot be deleted while it owns Storage
  objects, and that an already-issued stateless JWT may remain valid until its
  expiry even after the user/session rows are removed. The current BibleQuest
  order removes the owned avatar before deleting the Auth identity; server
  authorization still needs the short-expiry/session-sensitive proof owned by
  the account task.
- Stripe's Privacy Center says retention depends on jurisdiction, relationship,
  service, data sensitivity and legal/fraud obligations, and says that for most
  jurisdictions it generally keeps personal data obtained from business users
  for five or more years from the end of the business relationship or last
  transaction, whichever is later.

The owner must still record the actual production Supabase plan, enabled backup
and PITR settings, log drains, off-site copies, Vercel log retention, email-code
provider retention, Stripe account/country/contract, BibleQuest financial and
support retention schedule, and legal entity/controller. Public plan pages are
not the application's signed contract and may change.

Do not submit until the Privacy Policy gives truthful retention/deletion
criteria and the owner or counsel approves the following unresolved facts:

- whether Winterhill Studio is an authorized trade name/DBA of Winterhill Media
  LLC and which name/address is the privacy controller and contracting party;
- exact active-account, support-request, security-log and failed-checkout
  retention periods or decision criteria;
- the active recurring subscription outcome when an account is deleted;
- which Stripe financial records BibleQuest retains, how ownership is detached,
  and which US tax, accounting, chargeback, fraud and consumer rules apply;
- the final Diagnostics, Other Data, Coarse Location, Device ID, Payment Info,
  and tracking answers after provider-contract review.

## Account deletion, export, and clear gate

The repository currently orders remote avatar removal before the authenticated
`delete_own_account` RPC, then attempts Keychain, reminder, protected mirror,
local Journey, drafts, sync contexts, Rhythm, standalone game, and avatar
cleanup. The database detaches server-managed Stripe rows instead of deleting
financial history. Those are useful implementation facts, not release proof.

Release requires physical-device and backend evidence for all of the following:

- account A deletion never erases, exposes, flashes, or adopts account B data;
- avatar Storage ownership is removed before Auth deletion and cannot strand
  the identity;
- access and refresh credentials cannot authorize protected work after deletion;
- local Journey, protected mirror, native reminders and delivered alerts,
  unfinished drafts, game/Rhythm state, avatar and all sync-generation markers
  stay gone after force quit, relaunch, offline/online transition and reinstall;
- a second offline device erases only data stamped to the verified deleted
  account after authoritative `user_not_found`, not after an ordinary error;
- an active monthly/annual Plus subscription has a clear, tested cancellation
  and access outcome before identity loss; lifetime/refund/dispute retention is
  accurately explained;
- Export Journey produces the promised readable device-Journey fields and does
  not claim to export provider logs, identity or financial history;
- Clear my data deletes only the journey and synced copy, preserves the login
  and properly retained billing state, and cannot resurrect from the mirror.

Any partial device cleanup after server identity deletion is a release stop,
even if the UI offers a retry. Do not describe an automated account deletion as
complete until the end-to-end matrix passes.

## Product-page and manual App Store checklist

### Pricing, subscription, support, Terms, and Privacy

- Show the final Plus features, exact price/currency, billing period, renewal,
  how to cancel, when cancellation takes effect, refund/contact route, Terms,
  and Privacy before opening Safari. Reconcile every word with Checkout and the
  Stripe portal.
- Keep the Terms definition of monthly, annual and lifetime access aligned with
  the final products. Counsel/owner must approve “lifetime of the BibleQuest
  service and purchasing account,” refund handling, tax, disputes and deletion.
- Support, Terms and Privacy must be reachable without login and from the exact
  reviewed destinations. No marketing page containing an ungated purchase CTA
  may become a non-US bypass.
- Account deletion must be easy to find in Settings and must not require email
  support. Reauthentication/confirmation may prevent accidents but must not
  make deletion unnecessarily difficult.

### Age rating and content rights

- Complete Apple's current age-rating questionnaire literally. BibleQuest is
  not in the Kids category and its Terms say 13+, but Scripture/devotional
  content can reference violence, death, sex, alcohol, fear and other mature
  subjects. Record actual frequency; do not infer the result in this document.
- Confirm there is no public user-generated feed/chat, gambling, simulated
  gambling, paid loot box, unrestricted browser, or location-sharing feature in
  the selected binary. Scripture games still require truthful chance/content
  answers.
- Confirm commercial rights and shipping attribution for the bundled World
  English Bible, every online edition offered to the account build, artwork,
  fonts, audio/video and screenshots. App Store Connect requires rights for
  third-party content in every available region; this release is USA only.

### Export compliance, screenshots, availability, and release

- Re-answer Apple's export-compliance questionnaire for the exact archived
  binary. `ITSAppUsesNonExemptEncryption=false` is consistent only if the final
  build still relies on exempt platform/standard transport and adds no custom
  or non-exempt cryptography. Apple evaluates the determination case by case.
- Capture one to ten current iPhone screenshots from the final account build,
  without real email, prayer/reflection text, token, Checkout URL or financial
  data. Use Apple's live screenshot specification; the current 6.9-inch
  portrait sizes include 1260×2736, 1290×2796, and 1320×2868 depending on the
  device. Include the optional-account boundary and Plus disclosure without
  implying a worldwide purchase path.
- In App Store Connect → Pricing and Availability, choose Specific Countries
  or Regions → United States only; leave automatic inclusion of future regions
  off. Re-open Manage Availability and record the complete region status list.
- Select “Manually release this version.” Approval is not authorization to
  enable production or press Release This Version.
- Verify privacy answers, age rating, content rights, review contact, reviewer
  account/inbox path, legal URLs, description, screenshots and selected build
  all name the same commit and behavior.

## Automated release gate

The checked-in attestation is an intentionally failing example. Copy it to a
restricted evidence location, fill it with current non-secret facts, and keep
reviewer mailbox credentials in App Store Connect only.

After the neighboring task's deterministic account preparation command has
produced `out-native` and selected the account manifest in the actual App
target, run:

```bash
pnpm check:ios:account-us-release \
  --artifact out-native \
  --privacy ios/App/App/PrivacyInfo.xcprivacy \
  --attestation /restricted/evidence/ios-account-us-attestation.json
```

The preparation path must place `ios-account-us-release-receipt.json` at the
artifact root with this minimum contract:

```json
{
  "schemaVersion": 1,
  "profile": "ios-account-us-stripe-v1",
  "commit": "40-character commit SHA",
  "accountEnabled": true,
  "privacyProfile": "account-enabled-us-v1",
  "analyticsEnabled": false,
  "aiEnabled": false,
  "backendEnvironment": "reviewed-production",
  "backendOrigin": "https://www.biblequest.co",
  "supabaseOrigin": "one exact reviewed HTTPS origin",
  "externalNavigationOrigins": [
    "every exact HTTPS origin the prepared app can open"
  ],
  "commerce": {
    "purchaseUIEnabled": true,
    "storefrontSource": "StoreKit.Storefront.current.countryCode",
    "eligibleCountryCodes": ["USA"],
    "failClosed": true,
    "usesIpLocaleOrUserCountry": false,
    "storeKitPurchasing": false,
    "checkoutPresentation": "system-browser",
    "embeddedPaymentForm": false,
    "entitlementAuthority": "server"
  }
}
```

The receipt is a release assertion, not an identity or entitlement authority.
The owning task must derive it from the actual deterministic build inputs and
unit-test its storefront adapter. Do not hand-author a passing receipt around a
different artifact.

The gate rejects guest privacy answers, a guest privacy manifest, non-US or
non-StoreKit purchase eligibility, staging/preview hosts, analytics transports,
embedded Stripe form markers, secret-looking provider values, unreviewed HTTP
origins, test-mode Stripe attestation, incomplete provider retention, non-manual
release, or any incomplete manual review row. It complements, rather than
replaces, archive inspection, device tests, network capture, App Store Connect
screenshots, and provider dashboard evidence.

## Integration contracts for Tasks 1–6

- **Account preparation owner:** create the separate command; never change
  `ios:release:prepare`. Emit the receipt from pinned build inputs. Select the
  account privacy manifest only for this profile and prove a clean guest build
  still selects the guest manifest.
- **Storefront/checkout owner:** expose only the receipt fields above. The gate
  does not need the implementation module. Add success and negative tests for
  nil/non-USA storefront, storefront change, locale/IP mismatch, malformed
  Checkout/portal URL, embedded presentation, and browser return spoofing.
- **Account/sync owner:** preserve the sync/device-only table above or report a
  changed contract. Supply two-user, deletion, stale-token, second-device, and
  guest adoption evidence without private content.
- **Portal/billing owner:** provide exact price/renewal/cancellation UI and the
  active-subscription account-deletion outcome. An operator Plus grant is not
  proof of Stripe portal behavior.
- **Webhook/return owner:** keep entitlement server-authoritative and provide
  replay/out-of-order/return-spoof evidence. No client return state may edit the
  receipt's authority assertion.
- **All owners:** report exact new remote origins. A new destination requires
  explicit owner review and attestation; never add a wildcard merely to pass
  the scan.

## Current blockers and owner actions

1. No account-enabled production preparation command or receipt exists on this
   branch; the gate intentionally cannot pass a guest artifact.
2. The production account/CORS/commerce latches remain untouched as required.
3. App Store Connect USA-only availability, privacy answers, age rating,
   content rights, export compliance, screenshots and manual release are not
   verified or changed.
4. Actual Supabase/Vercel/email-provider plan and retention, Stripe contract and
   merchant retention, and legal entity/controller need owner or counsel input.
5. The active recurring-subscription outcome during account deletion and a
   no-charge, reviewer-accessible Plus/portal path need product/billing approval
   and end-to-end proof.
6. Physical-device deletion, Keychain, notification, protected-mirror,
   browser-return and storefront-change proof is outstanding.

## Primary sources

All sources below were accessed **August 11, 2026**.

- Apple, App Review Guidelines (last updated June 8, 2026), especially 2.1,
  2.3, 3.1.1, 3.1.1(a), 3.1.2(c), 4.8, and 5.1.1:
  <https://developer.apple.com/app-store/review/guidelines/>
- Apple, Offering account deletion in your app:
  <https://developer.apple.com/support/offering-account-deletion-in-your-app/>
- Apple, `Storefront.current`:
  <https://developer.apple.com/documentation/storekit/storefront/current>
- Apple, Manage availability for your app on the App Store:
  <https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-for-your-app-on-the-app-store>
- Apple, App privacy details:
  <https://developer.apple.com/app-store/app-privacy-details/>
- Apple, Describing data use in privacy manifests:
  <https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests>
- Apple, Set an app age rating:
  <https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/>
- Apple, App information (including Content Rights):
  <https://developer.apple.com/help/app-store-connect/reference/app-information/app-information>
- Apple, Overview of export compliance:
  <https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance>
- Apple, Screenshot specifications:
  <https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/>
- Apple, Select an App Store version release option:
  <https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/select-an-app-store-version-release-option>
- Stripe, Accept in-app purchases on iOS and Android:
  <https://docs.stripe.com/mobile/digital-goods>
- Stripe, Accept payments for digital goods on iOS with a prebuilt payment
  page (including `origin_context=mobile_app` and Safari):
  <https://docs.stripe.com/mobile/digital-goods/checkout>
- Stripe, Privacy Center, retention criteria:
  <https://stripe.com/legal/privacy-center>
- Supabase, User Management (Storage ownership, user deletion, JWT behavior):
  <https://supabase.com/docs/guides/auth/managing-user-data>
- Supabase, Auth Audit Logs:
  <https://supabase.com/docs/guides/auth/audit-logs>
- Supabase, Logging:
  <https://supabase.com/docs/guides/monitoring-and-debugging/logs>
- Supabase, Database Backups:
  <https://supabase.com/docs/guides/platform/backups>
- Supabase, current plan/retention table:
  <https://supabase.com/pricing>
