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

## Not started

1. **Onboarding language + Bible pickers.** Two stacked scroll lists
   (`OnboardingFlow.tsx`, the `max-h-52` list around line 627) eat the step.
   Wanted: flag only for the selected language — drop the redundant
   "English / English" pair — and an iOS-style wheel picker on native so the
   step fits one screen.
2. **Quest browsing and card density.** 150 quests behind a flat "ALL QUESTS"
   list. Wanted: a smarter route through the library, and cards that use their
   container instead of leaving wide empty margins. `QuestBrowse.tsx` is 739
   lines and is the entry point; `QuestBoardCard.tsx` (410) and
   `QuestAccordionCard.tsx` (322) are the card surfaces.
3. **iOS 26 Liquid Glass navbar.** Planning only, on its own branch, per
   Brendan. Not designed yet.

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
