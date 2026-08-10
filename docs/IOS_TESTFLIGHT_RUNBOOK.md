# iOS release candidate and TestFlight runbook

This is the canonical path for BibleQuest 1.0. It produces one guest-only,
iPhone-only binary that can move from internal TestFlight to App Review without
being rebuilt. Historical staging commands in older handoff documents are not
release instructions.

| Release fact | Value |
| --- | --- |
| Apple team | `W8KU6X34XR` — WINTERHILL MEDIA LLC |
| Bundle ID | `co.biblequest.app` |
| Version / build | `1.0 (4)` |
| Device family | iPhone |
| Hosted API/public origin | `https://www.biblequest.co` |
| Account sync | Off and build-pinned |
| Analytics | Off and build-pinned |
| Commerce | Native routes and acquisition UI removed |
| Reminders | Optional local schedules; no account or remote push |

## 1. Prepare the deterministic local payload

The release command overrides `.env.local` for every public identity, account,
analytics, and Green-feature flag used by the binary. It also rejects staging
and `*.vercel.app` host markers after export.

```bash
pnpm ios:release:prepare
```

Do not use the generic `build:native` command for an App Store candidate. It is
intentionally retained for custom development and staging builds.

## 2. Enable the production native API origin

In Vercel → `bible-quest` → Settings → Environment Variables, add:

- `BIBLEQUEST_NATIVE_API_ORIGIN_ENABLED=true`
- scope: **Production only**

Do not add Supabase Preview values and do not use All Environments. Redeploy
Production after changing the latch because Vercel binds environment variables
at deployment time.

The HTTP status alone is not a gate: Next can answer a generic `204` while CORS
is still closed. Require the exact response header:

```bash
curl -sS -D - -o /dev/null \
  -X OPTIONS https://www.biblequest.co/api/bible/translations \
  -H 'Origin: capacitor://localhost' \
  -H 'Access-Control-Request-Method: GET' \
  | tr -d '\r' \
  | grep -Fxi 'access-control-allow-origin: capacitor://localhost'
```

Then require the same header on an actual guest response:

```bash
curl -sS -D - -o /dev/null \
  https://www.biblequest.co/api/bible/translations \
  -H 'Origin: capacitor://localhost' \
  | tr -d '\r' \
  | grep -Fxi 'access-control-allow-origin: capacitor://localhost'
```

Do not distribute the archive to testers until both commands print the exact
header. The server latch is runtime configuration and does not require a new
binary when the bundled production origin is unchanged.

## 3. Create the Apple records

1. Apple Developer → Certificates, Identifiers & Profiles → Identifiers:
   register `co.biblequest.app` if it does not already exist, and enable Data
   Protection with **Complete Protection** to match `App.entitlements`.
2. App Store Connect → Apps → New App: create the iOS record using the same
   bundle ID.
3. Confirm the Account Holder has accepted current agreements.
4. In Xcode → Settings → Accounts, sign in with an Apple ID that can upload for
   team `W8KU6X34XR`.

Automatic signing is configured. Xcode Organizer can use Apple's cloud-managed
distribution signing when the account has permission; a local Apple
Distribution identity is not required in advance.

## 4. Archive and upload the reusable candidate

Open `ios/App/App.xcodeproj`, select **Any iOS Device (arm64)**, then choose
Product → Archive. In Organizer choose:

**Distribute App → App Store Connect → Upload**

Do not choose **TestFlight Internal Only**. That designation prevents the build
from later reaching external testers or customers. A normal App Store Connect
upload can still be assigned to an internal TestFlight group.

If build 4 has already been uploaded, increment the build number before the next
archive. Keep marketing version `1.0` until this release is approved.

## 5. Internal TestFlight gate

After processing:

1. Add build 4 to an Internal Testing group.
2. Install it from TestFlight on a physical iPhone.
3. Complete the matrix below before selecting the build for App Review.

| Area | Required result |
| --- | --- |
| Fresh install | Onboarding offers local use, never a disabled account CTA. |
| Relaunch | Journey survives backgrounding, force quit, and restart. |
| Offline | Bundled Scripture, prayer, reflection, quests, games, and Journey remain usable. |
| Online Bible | Translation search returns reviewed hosted editions. |
| Privacy | Writing remains local; export and clear controls work. |
| Reminders | Permission appears only after Enable; copy is neutral; quiet hours, save, test, disable, and Settings-denied recovery work. |
| Accessibility | Dynamic Type, Bold Text, VoiceOver, Reduce Motion, light/dark status-bar contrast, and keyboard focus remain usable. |
| App switcher | Background snapshot shows the branded privacy cover, never prayer or journal text. |
| Native scope | No camera picker, remote push, store, prices, purchase CTA, marketing-site link, or locked wallpaper dead end. |
| Public links | About, Terms, Privacy, and support open correctly. |
| Layout | Portrait UI clears the notch, keyboard, and home indicator on the smallest and largest supported iPhones. |

Record any crash, data loss, security failure, or blocked core journey as a
release blocker. Defer non-blocking polish to 1.0.1.

## 6. Submit the same build

Complete the fields in [`APP_STORE_SUBMISSION.md`](APP_STORE_SUBMISSION.md),
select the processed build under version 1.0, choose manual release, add it for
review, and submit. The tester-feedback PDF must be triaged before this step.

## Current production-origin state

On August 10, 2026, the production-only latch was set to `true`, the current
merged `main` deployment was rebuilt and aliased to `www.biblequest.co`, and
both checks above returned `Access-Control-Allow-Origin:
capacitor://localhost`. Treat the commands—not this note—as the release gate;
they must stay green for every candidate.
