# TestFlight runbook — internal testing on your own iPhone

Everything the repo can do is done. This is the click-path that needs a human
with the Apple and Vercel accounts, in dependency order. Internal TestFlight
takes **no Apple review** — the remaining product constraints listed at the
bottom do not block anything here.

Facts already established, so you do not have to look them up:

| | |
| --- | --- |
| Apple Team ID | `W8KU6X34XR` (WINTERHILL MEDIA LLC) — already in the Xcode project |
| Bundle ID | `co.biblequest.app` |
| Native API origin | `https://native-staging.biblequest.co` |
| Vercel project | `bible-quest`, team `winterhill` |

---

## 1. Vercel — give the app a reachable origin

Preview URLs answer `302` to a Vercel SSO login because Deployment Protection
is set to `all_except_custom_domains`. The WebView cannot satisfy that
redirect, so a custom subdomain is the way in — it is exempt from the rule and
stays stable for the 90-day life of a TestFlight build.

1. Vercel → **bible-quest** → Settings → **Domains** → Add
   `native-staging.biblequest.co`, and set it to serve the
   `feat/capacitor-ios-scaffold` branch.
2. Add the DNS record Vercel shows you at your registrar for `biblequest.co`.
3. Settings → **Environment Variables**, scoped to **Preview only** — never
   "All Environments", which would open the native allowance on the live site:
   - `BIBLEQUEST_NATIVE_API_ORIGIN_ENABLED` = `true`
   - `BIBLEQUEST_AVATAR_SYNC_ENABLED` = `true`
4. **Redeploy the branch.** Vercel binds environment variables at deploy time,
   so the latch does nothing until a build runs after you set it.

Gate on the observable — this must print `204`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS https://native-staging.biblequest.co/api/billing/status -H 'Origin: capacitor://localhost' -H 'Access-Control-Request-Method: GET'
```

`302` means protection still covers the host. `403` means the latch is set but
not yet redeployed. Also confirm the plans exclusion survived the edge:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://native-staging.biblequest.co/api/billing/%70lans   # expect 500
curl -s -o /dev/null -w '%{http_code}\n' https://native-staging.biblequest.co/api/billing/plans//   # expect 308
```

The encoded spelling answers `500`, not `404` — measured 2026-08-06 on both this
host and production, so it is a pre-existing quirk of the 404 path rather than
anything the CORS layer introduced. What matters either way is that it never
serves the cacheable plans payload.

## 2. Apple Developer — register the app identity

1. developer.apple.com → Certificates, Identifiers & Profiles → **Identifiers**
   → register App ID `co.biblequest.app`. Tick no capabilities; the app
   declares none.
2. App Store Connect → **Apps** → new app record with that exact bundle ID.
   The upload is rejected if no record exists. Name, primary language, SKU.

## 3. Xcode — sign in once

Xcode → Settings → **Accounts** → add your Apple ID. The team is already
written into the project, so Signing & Capabilities should resolve a
provisioning profile with no further input. If it shows a team-mismatch error,
that means the certificate on this Mac belongs to a different team than the
one the App ID was registered under — fix the App ID, not the project.

## 4. Build the web payload, then archive

The web bundle under `ios/App/App/public` is untracked build output, so it
carries whichever origin was last built in. Always run this immediately before
archiving:

```bash
NEXT_PUBLIC_APP_PLATFORM=native NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN=https://native-staging.biblequest.co pnpm build:native && pnpm exec cap sync ios
```

Bump the build number — every upload needs a higher one than the last, or App
Store Connect rejects it as a redundant binary:

```bash
cd ios/App && xcrun agvtool next-version -all
```

Then in Xcode: open `ios/App/App.xcodeproj`, select **Any iOS Device** as the
destination, Product → **Archive**, and in the Organizer choose **Distribute
App → TestFlight Internal Only**.

## 5. TestFlight — install on your phone

1. App Store Connect → your app → **TestFlight**. The build appears after
   processing (usually a few minutes). It should go straight to "Ready to
   Test" — the export-compliance key is in the binary, so no questionnaire.
2. Users and Access → make sure your Apple ID has a role that can test, then
   add yourself to an **Internal Testing** group.
3. Install **TestFlight** from the App Store on your iPhone, sign in with the
   same Apple ID, and the build will be listed.

## 6. What to check first on the device

- **CORS proof:** Home → tap the avatar top-left (Settings is *not* in the
  bottom nav) → "Bible translation". Success renders a search field listing
  non-English editions, which exist only in the server response. A 403 and a
  CORS block look identical from inside the app — attach Safari's Web
  Inspector (Mac Safari → Develop → your iPhone) to tell them apart.
- **Offline core:** airplane mode, then read a chapter, write a reflection,
  play the daily game. All of it is bundled and must work.
- Launch, background/foreground, and a force-quit relaunch with the journey
  intact.

---

## Known gaps — none of these block internal TestFlight

Expect to see these while testing; they are recorded, not forgotten.

- **Billing UI always errors on native.** `/api/billing/plans` is deliberately
  excluded from the CORS layer (it is the one shared-cacheable response), and
  `usePlus` needs it, so the projection reads "error"/free. Do not read this
  as a bearer-transport failure.
- **Commerce and legal submission surfaces are resolved in build 3.** The
  native export prunes the Plus and Arcade Store routes, removes web-only
  acquisition UI and wallpaper controls, and opens hosted About, Privacy, and
  Terms pages externally. Re-check these when testing the new branch build.
- **"Change photo" is withheld on native** pending a decision on
  `NSCameraUsageDescription` (see the comment in `SettingsScreen.tsx`).
- **Reminders dead-ends** into a sign-in that is itself disabled.
- **Sign-in is unverified end-to-end.** Requires
  `NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED=true` prefixed on the build command (not
  `.env.local`, which breaks ~11 web tests), plus the Preview callback URLs
  added to Supabase → Authentication → URL Configuration. Use the emailed
  numeric code; the emailed link opens Safari and does not complete in-app.
- **Journey mirror is in Documents, so it rides iCloud backup.** That is the
  only recovery a guest has if the phone is lost, and the app's copy claims
  only on-device storage, not backup exclusion — so it is a deliberate open
  question, not a defect.
- iPad is still a declared target (`TARGETED_DEVICE_FAMILY = "1,2"`), which
  obliges iPad screenshots and iPad-quality review at submission.
