# iOS release readiness

BibleQuest remains a web/PWA product for the Green release. This document
freezes the boundary for a later native project; it does not authorize or add
an iOS wrapper.

## What the Green release prepares

- `src/lib/platform/runtime.ts` selects an exact `web` or future `native`
  target and rejects malformed configuration.
- `src/lib/platform/api.ts` keeps web API requests relative and can point a
  future local native bundle at one reviewed HTTPS API origin.
- `src/lib/platform/auth.ts` centralizes the current browser callback and one
  future BibleQuest callback URL.
- `src/lib/platform/share.ts` centralizes system share and clipboard fallback.
- `src/lib/platform/notifications.ts` keeps web push active and requires an
  explicit future native notification adapter.
- `src/lib/platform/purchases.ts` keeps Stripe on web, hides every web Checkout
  entry point from a native target, and leaves native purchase, restore, and
  manage actions unavailable until a reviewed StoreKit adapter exists.

These seams preserve today’s behavior. They are not a native session,
StoreKit, APNs, deep-link registration, or App Store implementation.

## Native project start gate

Begin the iOS project only after the core web release is stable and all of the
following are true:

1. The Green web release has completed production monitoring and its rollback
   window.
2. Content licensing confirms every bundled Scripture and media asset may ship
   inside an iOS binary.
3. A native authentication design specifies Keychain storage, session refresh,
   API authorization, CORS, callback registration, account switching, and
   account deletion.
4. StoreKit product identifiers and entitlement mapping have been reviewed
   against the existing server-projected Plus model.
5. APNs registration, notification copy, permission timing, token rotation,
   logout, and account deletion behavior are designed.
6. The App Store privacy disclosure and Apple privacy manifest match the
   network and local-storage behavior observed in a release build.

## Required implementation order

### 1. Local application bundle

- Bundle the Next.js application assets and reviewed offline content with the
  app. Do not ship a thin shell whose primary purpose is displaying the hosted
  website.
- Keep `NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN` for reviewed API and public-link
  destinations only.
- Confirm offline launch, safe-area layout, reduced motion, Dynamic Type,
  VoiceOver, hardware keyboard, interruption recovery, and background/foreground
  transitions before adding purchases.

### 2. Native session transport

- Supply an explicit native API/session adapter; never rely on browser
  same-origin cookies inside the local bundle.
- Store refresh credentials only in the Keychain.
- Register and allowlist the final callback/universal-link configuration in the
  app, Apple capability settings, and Supabase.
- Re-run the two-user isolation, account-switch, offline merge, export, clear,
  and delete-account matrices on physical devices.

### 3. StoreKit Plus

- Implement purchase, restore, and manage actions behind the existing
  `PurchaseAdapter`.
- Reconcile signed App Store transaction state into the provider-neutral Plus
  entitlement model on the server. A client success screen must never grant
  Plus by itself.
- Map Free and Plus features exactly as the web release does. Guided Scripture,
  today’s complete game, the free pilgrimage, one rhythm, Scripture, prayer,
  reflection, quests, and Journey remain complete without payment.
- Keep Stripe Checkout and one-time web support links absent from the native
  target.
- Test new purchase, renewal, expiration, billing retry, refund, revocation,
  restore on another device, Family Sharing policy, account switching, and
  offline entitlement grace.

### 4. Native notifications and sharing

- Supply an APNs-backed `NotificationCapabilityAdapter`.
- Ask for notification permission only after the existing in-app explanation
  and explicit user action.
- Keep lock-screen copy neutral; never expose prayer, reflection, puzzle answer,
  or spiritual-progress details.
- Use the central share boundary for spoiler-free game results and public
  Scripture links.

### 5. TestFlight and review

- Run debug, release, fresh-install, upgrade, offline, and low-storage builds on
  the oldest supported iPhone, a current iPhone, and iPad.
- Test every sign-in method, purchase state, restore, notification state,
  deep link, account switch, clear, export, and delete path with sanitized
  evidence.
- Verify no development server URL, test payment mode, private log payload,
  hidden web Checkout, or unregistered callback remains in the archive.
- Prepare review notes that plainly explain local-first guest use, optional
  account sync, Free versus Plus access, restore purchases, account deletion,
  and why BibleQuest does not rank spiritual behavior.

## Hard release stops

Do not submit if any of these remain:

- the native build loads the hosted website as its main experience;
- authenticated API traffic still depends on browser same-origin cookies;
- StoreKit restore or server reconciliation is incomplete;
- Stripe or an external web purchase path is reachable in the native target;
- private journal text, game answers, or content identifiers enter analytics or
  notifications;
- the app cannot launch and use its core Scripture experience offline;
- account deletion leaves synced rows, media, push tokens, or native
  credentials behind;
- VoiceOver, Dynamic Type, reduced motion, or safe-area navigation blocks a
  core flow.
