# Release gate: first-use account replacement candidate

## Recommendation
GO FOR LOCAL SOURCE VERIFICATION; NO-GO FOR A SIGNED BUILD, TESTFLIGHT ACCOUNT WINDOW, APP REVIEW, OR PRODUCTION RELEASE

## Scope

- Working branch: `codex/first-use-release-candidate`
- Clean base before this change: `c3af44df5834a53736da671cfe5a51b9a7ae1475` from `origin/main`
- Intended environment: local source verification, followed by a separately approved internal TestFlight candidate
- Change scope: the merged native-auth recovery repair plus a bounded first-use UX slice covering onboarding length, starter-quest safety, the pre-value Plus screen, and persistent overlay timing
- External owner: Brendan Kenney for Xcode Cloud, TestFlight, Production, App Store Connect, legal publication, and release decisions
- Candidate identity: **not frozen** until the current changes pass review, protected CI, and merge to a clean `main`

This file is the current navigation record. Older App Store packets and Build 43 evidence remain useful history, but they do not establish a releasable candidate.

## Evidence

| Gate | Status | Evidence | Owner / next action |
| --- | --- | --- | --- |
| Build 43 | SUPERSEDED | Build 43 exposed an infinite post-code loading failure after its flag-off smoke | Do not select or submit Build 43 |
| Native-auth source repair | PASS FOR BASE SOURCE | `origin/main` at `c3af44d` includes bounded native session recovery, six-digit code handling, and native Sign in with Apple | Rerun every gate after the UX slice freezes |
| First-use UX | PASS FOR LOCAL REVIEW | Six-step guide, curated low-risk starter pool, direct free-app launch, deferred installation prompt, opt-in floating MyShepherd, and a visually primary local-only native fallback passed local review | Product/content owner reviews copy and placement |
| Automated verification | PASS FOR LOCAL SOURCE | Lint, TypeScript, 1,649 Vitest tests, 24 focused containment/first-use/native-commerce tests, ten Playwright journeys, production/header build, service worker, observability, production audit, and whitespace checks passed | Protected CI reruns against merged `main` |
| Native account export | PASS FOR EXACT LOCAL ARTIFACT | Guarded account-release export generated 261 static pages, retained 79 reviewed public media files, verified the one reviewed public Supabase target, passed content-rights inventory, compiled for Release iPhone, and passed the complete unsigned simulator artifact verifier against its containing commit | Signed archive and device gates remain open |
| Native simulator first screen | PASS; DEEPER FLOW OPEN | A clean iPhone 16 Pro / iOS 18.6 simulator launched and relaunched the exact account-release artifact with correct safe areas, the native availability latch off, one clear evergreen local-only action, and Terms/Privacy visible | macOS remained locked, so Computer Use could not click through the remaining native screens; physical and interactive native matrices stay open |
| Content placement | OPEN — HUMAN REVIEW | `artifacts/first-use-starter-quest-content-review-2026-08-27.md` verifies structure, safety, and Scripture support but does not publish or approve content | Theology/content owner checks the two open boxes |
| Production migration `0039` | PASS — APPLIED | The guarded Production dry-run reported `applied=true`, no proposed writes, exact reviewed packet/source hashes, and a completed physical backup at `2026-08-27T07:53:31.400Z`; `IOS_ACCOUNT_REPLACEMENT_RELEASE.md` now records this as historical execution | Keep checks read-only and do not replay the migration |
| Native availability migration | PASS — APPLIED | After updating the stale append-only history contract, the guarded Production dry-run reported `applied=true` with no proposed writes | Review and merge the checker fix with the candidate |
| Public web identity | OPEN — DEPLOYMENT DRIFT | `https://www.biblequest.co/api/health` reports source `cc959fd`, canonical origin match, and schema `0038`; the database read-only gates prove `0039` is applied and source now advertises `0039` | Treat web promotion as a separate owner-authorized action and require exact SHA/schema parity before traffic |
| Signed replacement build | OPEN | No signed artifact exists for this candidate | After source freeze, owner authorizes the exact Xcode Cloud workflow/build |
| Physical account/device matrix | OPEN | Build 43 flag-off smoke is not evidence for the repaired candidate | Run two-account/two-iPhone, email, Apple, restore, offline, isolation, deletion, and old-client checks |
| App Privacy and legal identity | OPEN | Nine-type account disclosure, live Winterhill Media LLC pages, visual-rights declaration, and named approval are not all complete | Privacy/legal owner closes exact-binary and live-site gates |
| App Review submission | OPEN / NOT AUTHORIZED | No candidate build or complete evidence packet | Founder separately authorizes build selection, Add for Review, and Submit |

## Open blockers

- The current source is a working branch, not a clean reviewed and pushed `main` freeze.
- No signed replacement build proves the repaired auth flow or this first-use slice.
- The full physical account, isolation, offline, deletion, reinstall, and accessibility matrices have not run on the replacement candidate.
- Interactive native continuation beyond the initial screen remains open on this host until macOS is unlocked; browser coverage is not substituted for that evidence.
- The live web release is older than the candidate and still advertises schema `0038`; no candidate promotion has been authorized.
- App Privacy publication, live legal identity, visual rights, screenshots, reviewer notes, availability, and named owner approvals remain open.

## Rollback posture

Build 13 remains the existing public-binary compatibility baseline. Current web health identifies release `cc959fd038ae86ca5d9d1ce125f93efd9c462148` and rollback `ed28b0bfc4d17d884649258227cda101d9f97ca1`; re-resolve both at freeze rather than treating this snapshot as permanent. Native account availability stays off outside a staffed test window and is disabled first during containment. Forward-only migrations are never edited, replayed, or rolled back as part of a binary recovery.

## Explicit approvals needed

- [ ] Product/content owner accepts the compressed guide and starter-quest placement
- [ ] Release owner accepts the exact frozen `main` SHA
- [ ] TestFlight/App Store owner authorizes the exact signed build and internal cohort
- [ ] QA/account owner accepts the physical-device matrix, including any documented second-iPhone gap
- [ ] Privacy/legal owner approves App Privacy, live legal identity, rights, retention, deletion, and reviewer disclosures
- [ ] Founder authorizes App Store build selection and submission
- [ ] Founder separately authorizes manual public release
