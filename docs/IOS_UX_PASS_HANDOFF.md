# iOS UX pass — where this stopped

Branch `feat/capacitor-ios-scaffold`. Target: a polished working build inside
ten days of 2026-08-07. Written mid-session against a dying battery, so it
records state rather than conclusions.

## Done and pushed

**App icon** (`fdfc378`). `ios/App/App/AppIcon.icon` is the Icon Composer
bundle, registered in the target; Xcode 26 compiles it natively — verified
`BUILD SUCCEEDED` with `AppIcon60x60@2x.png` and the layered assets emplaced,
so the iOS 26 tinted/dark/glass variants come free. The old
`AppIcon.appiconset` was removed because it claimed the same `AppIcon` name.
`scripts/build-app-icons.mjs` regenerates the flat web/PWA set from the same
layer art (gradient sampled from Xcode's compiled output; iOS embeds no raster
above 180px, so the 512s cannot be upscaled from the build).

**Safe-area dead space** (`fdfc378`). `pt-safe` and the design gap were
stacking: 75pt above the Home card, 91pt above every page title on a notched
device. New `pt-safe-gap-4` / `pt-safe-gap-8` utilities in `globals.css` take
`max()` of the two. Measured after: web unchanged to the pixel (16px Home,
32px Quests), device reclaims 16pt on Home and 32pt on every titled page.

**Quest catalogue** (`6c199b5`). `QuestRow` replaces `QuestSlip` in the
library only — a 64px line that expands in place, in one `PaperCard` sheet of
hairline-divided rows. Measured at 375px: 24 rows went 7,863px → 1,683px, the
text column 141px → 201px of a 333px sheet, the page 10,280px → 3,641px.
`interleaveByCategory` round-robins the open library, so the first 14 rows are
14 distinct categories instead of 4; category chips carry live counts; the
library heading is sticky (65px) so Filters stays reachable; an empty board
collapses three zero-count accordions to one line. Also fixed 27 buttons whose
accessible name was the identical string "Add to Ready".

**Onboarding language step** (`f9df7b3`). A three-row iOS-style wheel for the
language and abbreviation chips for the edition. The step measures 812px
against an 812px viewport, so it no longer scrolls. The wheel is a real radio
group with scroll-snap over it, not a custom widget, so keyboard and VoiceOver
come free. Verified with a real flick on the simulator: momentum, snap and
commit all work, bidirectionally. One flag per language, and the English gloss
appears only when it differs from the endonym.

**iOS 26 Liquid Glass plan** — `docs/IOS26_LIQUID_GLASS_PLAN.md`. Research
only, no app code. Headline: `app-glass-nav` already ships five of the six
static Liquid Glass material properties, so the gap is shape and behaviour
(both pure CSS/JS), while refraction and specular highlights are genuinely
unreachable from a WebView.

## 2026-08-09 — commerce and legal pass complete

**App Store commerce gating.** The native exporter removes `/app/plus` and
`/app/games/store`, then fails the build if either route reappears. Native UI
now omits the Arcade Store, prices and Buy actions, Plus acquisition actions,
free-user locked previews, and the wallpaper picker. Existing entitlements
remain a separate access path. Billing checkout, billing portal, and arcade
checkout also reject the native origin with `403` as a server-side backstop.
Stale onboarding hand-offs to `/app/plus` normalize to `/app`.

**Legal links.** About, Privacy Policy, and Terms stay relative on web but use
absolute hosted HTTPS URLs on native, so Capacitor opens them outside the
pruned app router instead of bouncing to Home.

**Verification.** `pnpm lint`, `pnpm exec tsc --noEmit`, all 149 test files /
1,121 tests, and the normal web build pass. A fresh native build and Capacitor
sync contain the staging origin in 1,042 files and `www.biblequest.co` in zero;
both commerce routes are absent, and exported native HTML contains none of the
store prices, Buy labels, or Plus acquisition labels. A Release archive still
returns `ARCHIVE SUCCEEDED` for `co.biblequest.app`, build 3.

## Remaining product decisions

1. **The camera decision.** "Change photo" is withheld on native pending a
   call on `NSCameraUsageDescription` — see the comment in `SettingsScreen.tsx`.
2. **iOS 26 Liquid Glass implementation.** Keep it on its own branch and use
   `docs/IOS26_LIQUID_GLASS_PLAN.md` as the starting point.
3. **TestFlight upload.** The archive is buildable, but distribution still
   needs the owner's Apple ID and an Apple Distribution certificate.

## 2026-08-09 — bearer isolation passed

The account owner added the three Supabase variables to Vercel Preview only.
Empty commit `a3b25fe` triggered the exact feature-branch deployment. The new
deployment's CSP included
`https://lorqiyzrfmpvvcvsvghc.supabase.co`, so the safety gate opened and
`pnpm check:native-bearer-isolation` completed with:

```json
{"authenticatedUsers":2,"corsPreflights":2,"billingDirections":2,"failClosedCases":3,"avatarDirections":2,"status":"pass"}
```

This is the first real proof that two Supabase identities resolve to different
BibleQuest accounts across both billing and avatar directions. Production was
rechecked afterwards: its native-origin preflight still returns `204` with no
`access-control-allow-origin`, so the production latch remains off.

Cleanup is complete. Disposable Supabase branch `native-bearer-isolation`
(`lorqiyzrfmpvvcvsvghc`) was deleted, leaving only the production branch.
`.env.staging.local` was removed from the repo and moved to
`~/.Trash/BibleQuest.env.staging.local.2026-08-09` with mode `600`.

The three Vercel Preview variables still reference that deleted disposable
project. Remove them or repoint them to an explicitly approved durable backend
before relying on account-backed `native-staging` APIs again. Passing isolation
removes the security blocker; it does not authorize a production promotion.

## Resuming

```bash
git checkout feat/capacitor-ios-scaffold && git pull
pnpm install
```

The dev server for UI work is `.claude/launch.json` → `biblequest` on port
3200. To skip onboarding when inspecting `/app`, set `onboardingCompleted` on
the `biblequest:v1` localStorage blob.

To put a fresh build on the phone: rebuild the web payload against the staging
origin, sync, bump, then Product → Archive (or just ▶ Run with the phone
connected, which is faster for iteration):

```bash
NEXT_PUBLIC_APP_PLATFORM=native NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN=https://native-staging.biblequest.co pnpm build:native && pnpm exec cap sync ios
```
