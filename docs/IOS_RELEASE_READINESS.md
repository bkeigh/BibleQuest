# iOS 1.0 release readiness

BibleQuest now has a Capacitor iOS project that ships a local static bundle.
The canonical execution checklist is
[`IOS_TESTFLIGHT_RUNBOOK.md`](IOS_TESTFLIGHT_RUNBOOK.md); product-page material
is in [`APP_STORE_SUBMISSION.md`](APP_STORE_SUBMISSION.md). The sequenced work
after the parity foundation is in [`IOS_PHASE_5_PLAN.md`](IOS_PHASE_5_PLAN.md).

## Locked 1.0 scope

- iPhone-only, portrait, iOS 15 or later
- local-first guest journey; no account creation or sync
- optional on-device reminders; no account, APNs, or remote push
- no native profile-photo picker or camera permission
- no native purchase, pricing, external acquisition, or locked-content dead end
- analytics disabled in the release bundle
- production `www.biblequest.co` used only for reviewed guest API calls and
  public About, Terms, Privacy, and support destinations

The release builder pins those public flags even when `.env.local` contains
staging or account values, removes server/marketing/commerce routes, verifies
the production origin, and synchronizes the result into Xcode with:

```bash
pnpm ios:release:prepare
```

## Implemented safety boundaries

- Capacitor loads `out-native` locally; no `server.url` thin shell exists.
- The WebView origin is frozen at `capacitor://localhost` to preserve local data.
- Guest-only containment suppresses account prompts, enrollment UI, Supabase
  session refresh, native bearer tokens, and billing probes. Local reminders
  remain device-only and use neutral copy.
- Native auth prerequisites are dormant behind containment: email-code-only UI,
  device-only Keychain session storage, a reinstall credential reset, and
  explicit credential purge after deletion.
- Dynamic Type, Bold Text, reduced motion, and resolved-theme status-bar
  contrast follow iOS; the app switcher receives a synchronous privacy cover.
- The durable journey mirror uses complete file protection and is upgraded in
  place for installs that predate the entitlement.
- Stripe checkout, billing portal, Arcade checkout, Plus/store routes, pricing
  links, and marketing-home links are absent or rejected on native.
- Camera/photo input is absent and `NSCameraUsageDescription` is intentionally
  omitted.
- The privacy manifest declares no tracking and the required file-timestamp API
  reason.
- `ITSAppUsesNonExemptEncryption=false` records the current export-compliance
  posture.

## External release gates

1. Attach and triage the quality tester PDF; fix all P0/P1 findings.
2. Re-run the exact Production CORS preflight and GET checks before each binary
   is distributed. The production-only latch was enabled and verified on
   August 10, 2026.
3. Create/confirm the App ID and App Store Connect record, agreements, uploader
   role, and Xcode account.
4. Pass the complete internal TestFlight device matrix.
5. Complete screenshots, privacy answers, age rating, content rights, metadata,
   and review contact.

## Hard release stops

Do not submit if any of these remain:

- the tester PDF has an untriaged crash, data-loss, security, or core-flow issue;
- Production omits `Access-Control-Allow-Origin: capacitor://localhost` on the
  reviewed guest APIs;
- a release artifact contains staging, `*.vercel.app`, account-enabled,
  analytics-enabled, or native-commerce behavior;
- a stale Supabase session is inspected or refreshed while containment is on;
- core Scripture, prayer, reflection, quests, games, or Journey cannot launch
  and operate offline;
- fresh install, force-quit restore, keyboard/safe-area handling, VoiceOver, or
  reduced motion blocks a core journey;
- App Store privacy answers do not match the observed binary and provider
  retention.
