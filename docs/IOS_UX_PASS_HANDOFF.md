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
  "no devices" provisioning failure should be gone — **resolved 2026-08-08,
  see below**.

## 2026-08-08 — start here

Three of the four things needed to run the bearer isolation check are done.
The fourth is a Vercel click-path that needs the account owner.

**Archive verified.** `xcodebuild … archive` returns `ARCHIVE SUCCEEDED`,
signing `co.biblequest.app` at `CFBundleVersion 3` with "iOS Team Provisioning
Profile: co.biblequest.app". The "no devices" failure above is gone. Build
number is committed at 3; the web payload was rebuilt against
`native-staging.biblequest.co` and synced (1,050 files reference that origin,
zero reference `www.biblequest.co`).

Caveat: `security find-identity -v -p codesigning` shows exactly one identity,
**Apple Development**. TestFlight upload signs with an Apple *Distribution*
certificate, which does not exist on this Mac. Xcode's Distribute App flow can
mint one, but that step is unverified and needs an Apple ID with a team role
that permits it.

**A disposable staging Supabase exists.** The org had no staging project — the
`BibleQuest-Account-Sync-Staging` named in
`scripts/reconcile-staging-migration-history.mjs` was deleted at some point, so
`check:native-bearer-isolation` had never been runnable. Branch
`native-bearer-isolation` (ref `lorqiyzrfmpvvcvsvghc`) now covers it, at
roughly $0.32/day. **Delete it when the check passes.**

Supabase's own replay stopped at 23 of 32 migrations, failing on production's
consolidated `reconcile_launch_contracts_and_lifetime_plus` packet. Repo files
0023–0036 were applied instead: 0023 through the MCP, 0024–0036 via
`supabase db push` from a temp workdir holding renumbered copies plus empty
placeholders for the already-applied remote versions. Two mechanics worth
keeping — the direct DB host is IPv6-only and unreachable from this network, and
the transaction pooler (6543) fails with `prepared statement … already exists`.
Use the **session pooler on 5432**. Verified on the branch afterwards:
`profile_avatar_contract()` returns `ok: true`, the private `profile-avatars`
bucket exists, and `grant_operator_plus` and `operator_plus_grants` are present.

**A rehearsal run cleared every stage but the last.** Actor creation, the real
operator Plus grant, and the whole CORS layer all pass; billing status then
answers `503`. That is the deployment's "Supabase not configured" signature —
the same route answers `401` with no token, because it short-circuits before
touching Supabase and only fails on configuration once a real bearer forces it
to resolve an identity. Local runner config is already written to
`.env.staging.local` (gitignored, mode 600).

**The one remaining step.** Add three variables on Vercel → bible-quest →
Settings → Environment Variables, scoped to **Preview only** — "All
Environments" would repoint production at a database that is about to be
deleted. Values are in `.env.staging.local`:

| Vercel variable | Source line in `.env.staging.local` |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://lorqiyzrfmpvvcvsvghc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_…` value |
| `SUPABASE_SECRET_KEY` | the value on the `SUPABASE_SERVICE_ROLE_KEY` line |

That last row is a rename, not a copy — see the `SUPABASE_SECRET_KEY` note
above for why the original name is ignored on Vercel.

Then push a commit to the branch (never the redeploy button), confirm
native-staging's CSP `connect-src` has changed from bare `'self'` to include
`https://lorqiyzrfmpvvcvsvghc.supabase.co`, and run:

```bash
pnpm check:native-bearer-isolation
```

Afterwards, delete the Supabase branch and `.env.staging.local`.

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
