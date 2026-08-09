# iOS build handoff — 2026-08-09

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
GitHub then deleted the feature branch, so `origin/feat/capacitor-ios-scaffold`
**no longer exists**; the local branch of that name still does and is marked
`[gone]`. Local `main` is stale — fetch before comparing.

Exactly one commit is unpushed: `49f63a5`, which touches only
`docs/IOS_UX_PASS_HANDOFF.md`. Its build-number change was a no-op, because
`main` already recorded `CURRENT_PROJECT_VERSION = 3` in commit `87b390d`.

`.claude/launch.json` carries an unrelated local edit. Leave it alone; do not
commit it.

Branch naming is load-bearing. `native-staging.biblequest.co` is configured to
serve the `feat/capacitor-ios-scaffold` branch (documented in the runbook §1,
not re-verified today because the Vercel MCP exposes no domain-config tool). A
Preview deploy at that host therefore requires a branch of **that exact name**
on the remote. Recreate it from current main rather than pushing the stale
local branch:

```bash
git fetch origin --prune
git rebase origin/main   # from the local feat/capacitor-ios-scaffold
git push -u origin feat/capacitor-ios-scaffold
```

## Verified green as of 2026-08-09

- `pnpm lint` clean; `pnpm test` 148 files / 1114 tests passing.
- `NEXT_PUBLIC_APP_PLATFORM=native NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN=https://native-staging.biblequest.co pnpm build:native && pnpm exec cap sync ios`
  succeeds. The synced payload references the staging origin in 1,050 files and
  `www.biblequest.co` in zero — worth re-checking after any rebuild, since
  `ios/App/App/public` is untracked build output that carries whichever origin
  was last built.
- `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' -archivePath <path> archive`
  returns **ARCHIVE SUCCEEDED**, signing `co.biblequest.app` at
  `CFBundleVersion 3` with "iOS Team Provisioning Profile: co.biblequest.app".
  The runbook's "no devices" provisioning failure is resolved.
- Production is confirmed latch-**off**: an `OPTIONS` to
  `https://www.biblequest.co/api/billing/status` with
  `Origin: capacitor://localhost` returns no `access-control-allow-origin`
  header. Re-verify this before and after anything that touches the CORS layer.

## The one real gap — the bearer isolation check

`pnpm check:native-bearer-isolation` proves two accounts cannot read each
other's data through the bearer path. It has still never completed. 15 of 16
authenticated surfaces have no RLS backstop, so a wrong identity is a
cross-account breach, and every unit test mocks token verification — nothing
has ever resolved a real token to a real user. **Do not enable
`BIBLEQUEST_NATIVE_API_ORIGIN_ENABLED` anywhere real until this passes.**

Three of the four prerequisites are done:

1. A disposable staging Supabase exists: branch `native-bearer-isolation`,
   ref `lorqiyzrfmpvvcvsvghc`, created 2026-08-08, billing at ~$0.32/day.
   **Delete it once the check passes.** Its dashboard branch status still reads
   `MIGRATIONS_FAILED` — that is stale, because the migrations were applied
   out-of-band; the underlying project is `ACTIVE_HEALTHY` and verified below.
2. Its schema is complete and verified: `profile_avatar_contract()` returns
   `ok: true`, the private `profile-avatars` bucket exists, and
   `grant_operator_plus` plus `operator_plus_grants` are present.
3. `.env.staging.local` is written (gitignored, mode 600) with the branch's
   URL, anon key, publishable key and service-role key, plus the two
   confirmation strings and the target origin. Never print its values.
4. **Blocked on the account owner:** three variables on Vercel → bible-quest →
   Settings → Environment Variables, scoped to **Preview only**:

   | Vercel variable | Source line in `.env.staging.local` |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://lorqiyzrfmpvvcvsvghc.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_…` value |
   | `SUPABASE_SECRET_KEY` | the value on the `SUPABASE_SERVICE_ROLE_KEY` line |

   The last row is a rename, not a copy: `src/lib/supabase/admin.server.ts:12`
   ignores `SUPABASE_SERVICE_ROLE_KEY` when `NODE_ENV=production`, which every
   Vercel build is. Scope must be Preview — "All Environments" would repoint
   production at a database that is about to be deleted.

Once those land, push a commit to the branch, then gate on the observable
before running anything: native-staging's CSP `connect-src` is currently bare
`'self'` and must come back containing
`https://lorqiyzrfmpvvcvsvghc.supabase.co`. Then run:

```bash
pnpm check:native-bearer-isolation
```

A rehearsal on 2026-08-09 already cleared actor creation, the real operator
Plus grant, and the entire CORS layer, then failed at billing with `503`. That
503 is the deployment's "Supabase not configured" signature — the same route
answers `401` with no token, because it short-circuits before touching Supabase
and only fails on configuration once a real bearer forces an identity
resolution. So the script, the fixtures and the CORS layer are all proven; the
identity resolution itself is the only untested thing left.

Afterwards, delete the Supabase branch and `.env.staging.local`.

## Buildable work, in the order I would take it

1. **App Store commerce gating** — the largest item and pure code. The Arcade
   Store shows $0.99/$2.99 with a Buy button that cannot work, 14 "Explore
   Plus" CTAs lead to a page with no purchase path, and all 15 wallpapers are
   locked with no way to buy. These are guideline 3.1.1 rejections at
   submission. Gate them on native the way `ExplorePlusLink` already does, or
   ship StoreKit — the latter is far bigger and adds a native dependency.
2. **Settings legal links** — Privacy Policy / Terms / About bounce to Home on
   native. Small, self-contained, and a submission surface in its own right.
3. **iOS 26 Liquid Glass navbar** — on its own branch, per the plan doc.
4. **`NSCameraUsageDescription` decision** — "Change photo" is withheld on
   native because iOS terminates apps that open the camera without it. This is
   a product call for the owner, not a code change to make unilaterally; see
   the comment in `SettingsScreen.tsx`.
5. **TestFlight upload, runbook §5** — Xcode GUI, needs the owner's Apple ID.
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
