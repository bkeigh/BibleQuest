# iOS build handoff — 2026-08-09

> Historical staging handoff. The canonical App Store path is now
> [`IOS_TESTFLIGHT_RUNBOOK.md`](IOS_TESTFLIGHT_RUNBOOK.md); do not use this
> document's `native-staging` commands for a release archive.

Paste this whole file as the opening prompt of a fresh session. Everything in
it was measured on 2026-08-09, not inferred. Where something is unverified it
says so.

---

Continue BibleQuest iOS work. Repo: `/Users/brendankenney/Development/BibleQuest`.
Apple Team ID `W8KU6X34XR` (WINTERHILL MEDIA LLC), bundle ID `co.biblequest.app`,
Vercel project `bible-quest` on team `winterhill`, Supabase production project
`iacnjqnssovaaojswjoh`.

Read in full before touching anything:

- `docs/IOS_UX_PASS_HANDOFF.md` — start with the "2026-08-08 — start here"
  section; it is the most current state.
- `docs/IOS_TESTFLIGHT_RUNBOOK.md` — the click-path and the known gaps.
- `docs/IOS26_LIQUID_GLASS_PLAN.md` — only if you take the glass branch.

## Git state — read this before branching

All prior iOS work is merged into `origin/main` through PRs #94, #95 and #96.
The exact `feat/capacitor-ios-scaffold` branch has been restored on the remote
after rebasing its local history onto current `origin/main`, so
`native-staging.biblequest.co` can create Preview deployments from it again.

The earlier claim that exactly one commit was unpushed was inaccurate: the
local branch contained two documentation commits. Both were preserved through
the rebase before the remote branch was restored.

`.claude/launch.json` carries an unrelated local edit. Leave it alone; do not
commit it.

Branch naming is load-bearing. `native-staging.biblequest.co` is configured to
serve the `feat/capacitor-ios-scaffold` branch (documented in the runbook §1,
not re-verified today because the Vercel MCP exposes no domain-config tool). A
Preview deploy at that host therefore requires a branch of **that exact name**
on the remote. Keep using that branch for this pass:

```bash
git fetch origin --prune
git checkout feat/capacitor-ios-scaffold
git pull --ff-only
```

## Verified green as of 2026-08-09

- `pnpm lint` and `pnpm exec tsc --noEmit` clean; `pnpm test` 149 files /
  1,121 tests passing. The normal web build also succeeds.
- `NEXT_PUBLIC_APP_PLATFORM=native NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN=https://native-staging.biblequest.co pnpm build:native && pnpm exec cap sync ios`
  succeeds. The synced payload references the staging origin in 1,042 files and
  `www.biblequest.co` in zero. `/app/plus` and `/app/games/store` are absent,
  and the build script verifies that postcondition before publishing. Re-check
  after any rebuild, since `ios/App/App/public` is untracked build output that
  carries whichever origin was last built.
- `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' -archivePath <path> archive`
  returns **ARCHIVE SUCCEEDED**, signing `co.biblequest.app` at
  `CFBundleVersion 3` with "iOS Team Provisioning Profile: co.biblequest.app".
  The runbook's "no devices" provisioning failure is resolved.
- Production is confirmed latch-**off**: an `OPTIONS` to
  `https://www.biblequest.co/api/billing/status` with
  `Origin: capacitor://localhost` returns no `access-control-allow-origin`
  header. Re-verify this before and after anything that touches the CORS layer.

## Bearer isolation — passed and cleaned up 2026-08-09

The account owner added the three required variables to **Preview only**. Empty
commit `a3b25fe` triggered the feature-branch deployment; its CSP then included
the exact staging Supabase origin. The real check passed:

```json
{"authenticatedUsers":2,"corsPreflights":2,"billingDirections":2,"failClosedCases":3,"avatarDirections":2,"status":"pass"}
```

The result proves two real bearer identities stay isolated in both billing and
avatar directions. Production was rechecked after the run and still returns no
`access-control-allow-origin` for `Origin: capacitor://localhost`; its native
latch remains off.

Cleanup is done: disposable Supabase branch `native-bearer-isolation`
(`lorqiyzrfmpvvcvsvghc`) was deleted, and `.env.staging.local` was moved to
`~/.Trash/BibleQuest.env.staging.local.2026-08-09` with mode `600`.

The Vercel Preview variables still point at the now-deleted project. Remove or
repoint them before treating `native-staging` as an account-capable backend.
The passing check removes the security prohibition but does not authorize any
production environment or CORS change.

## Completed in the current pass

1. **App Store commerce gating** — native removes all web-only purchase and
   acquisition entry points, locked free-user previews, and wallpaper controls;
   its export also prunes and verifies the Plus and Arcade Store routes.
2. **Settings legal links** — hosted About, Privacy, and Terms URLs are now
   absolute on native and continue to be relative on web.

## Remaining work

1. **iOS 26 Liquid Glass navbar** — on its own branch, per the plan doc.
2. **`NSCameraUsageDescription` decision** — "Change photo" is withheld on
   native because iOS terminates apps that open the camera without it. This is
   a product call for the owner, not a code change to make unilaterally; see
   the comment in `SettingsScreen.tsx`.
3. **TestFlight upload, runbook §5** — Xcode GUI, needs the owner's Apple ID.
   Note `security find-identity -v -p codesigning` shows exactly one identity,
   **Apple Development**. TestFlight signs with an Apple *Distribution*
   certificate, which does not exist on this Mac. Xcode's Distribute App flow
   can mint one given a sufficient team role, but that step is unverified.

## Traps that have cost real time

- **The browser preview tab runs hidden.** Scroll events and rAF never fire, so
  any scroll- or animation-dependent check silently passes. Verify that class
  of change on the iOS simulator, never the browser. This applies squarely to
  the Liquid Glass work.
- **Vercel's redeploy button keeps landing on `main`,** because each `main`
  redeploy becomes the newest row in the list. Push a commit to the branch
  instead.
- **The staging database's direct host is IPv6-only** and unreachable from this
  network, and its transaction pooler (port 6543) fails with
  `prepared statement "lrupsc_1_0" already exists`. Use the **session pooler on
  port 5432** for any migration work.
- **Vercel Preview URLs are SSO-walled** — every `*.vercel.app` URL 302s to a
  login and the WebView cannot satisfy it. Only custom domains are exempt,
  which is why `native-staging.biblequest.co` exists. A 403 and a CORS block
  look identical from inside the app; attach Safari's Web Inspector to tell
  them apart.
- **`/api/billing/plans` is deliberately excluded from the CORS layer** as the
  one shared-cacheable response, and `usePlus` needs it, so billing UI always
  reads error/free on native. Do not diagnose that as a bearer-transport bug.

## Constraints

Web output stays byte-identical with the latch off. `lint`, `tsc`, `test` and
`build` stay green. No new runtime dependencies. Production promotion is manual
— merging to `main` does not update www.biblequest.co.
