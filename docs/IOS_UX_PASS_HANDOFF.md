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

## Not started

1. **App Store commerce gating.** The Arcade Store still shows $0.99/$2.99
   with a Buy button that cannot work, 14 "Explore Plus" CTAs lead to a page
   with no purchase path, and all 15 wallpapers are locked. These are
   guideline 3.1.1 rejections at submission; none block TestFlight.
2. **Settings legal links** bounce to Home on native.
3. **The camera decision.** "Change photo" is withheld on native pending a
   call on `NSCameraUsageDescription` — see the comment in `SettingsScreen.tsx`.

## Still open from Phase 4b

- `SUPABASE_SECRET_KEY` is **not** on the Vercel Preview environment, so every
  Bible endpoint on `native-staging.biblequest.co` answers
  `{"error":"rate_limit_unavailable"}` (503). The app degrades correctly
  ("Online editions could not be checked"), but other-language editions stay
  dark until it is added and the **branch** is redeployed. Note the code
  accepts only that exact name — `SUPABASE_SERVICE_ROLE_KEY` is deliberately
  ignored when `NODE_ENV=production`, which a Vercel build always is.
- Redeploying from the Vercel deployments list keeps landing on `main`,
  because each `main` redeploy becomes the newest row. Push a commit to the
  branch instead; that builds the branch and nothing else.
- TestFlight upload never ran. The app is installed on the device over the
  cable (`co.biblequest.app`, build 2, confirmed via `devicectl`). Archive
  needs a registered device, which now exists ("stinkyhill"), so the earlier
  "no devices" provisioning failure should be gone — unverified.

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
