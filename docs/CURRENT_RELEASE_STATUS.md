# Release gate: first-use account replacement candidate

## Recommendation
GO FOR LOCAL SOURCE VERIFICATION; NO-GO FOR A SIGNED BUILD, TESTFLIGHT ACCOUNT WINDOW, APP REVIEW, OR PRODUCTION RELEASE

## Scope

- Working branch: `codex/first-use-release-candidate`
- Clean base before this change: `c3af44df5834a53736da671cfe5a51b9a7ae1475` from `origin/main`
- Intended environment: local source verification, followed by a separately approved internal TestFlight candidate
- Change scope: the merged native-auth recovery repair plus a bounded first-use UX slice covering onboarding length, starter-quest safety, the pre-value Plus screen, persistent overlay timing, and the selected-quest handoff from onboarding through Home
- External owner: Brendan Kenney for Xcode Cloud, TestFlight, Production, App Store Connect, legal publication, and release decisions
- Candidate identity: **not frozen** until the current changes pass review, protected CI, and merge to a clean `main`

This file is the current navigation record. Older App Store packets and Build 43 evidence remain useful history, but they do not establish a releasable candidate.

## Evidence

| Gate | Status | Evidence | Owner / next action |
| --- | --- | --- | --- |
| Build 43 | SUPERSEDED | Build 43 exposed an infinite post-code loading failure after its flag-off smoke | Do not select or submit Build 43 |
| Native-auth source repair | PASS FOR BASE SOURCE | `origin/main` at `c3af44d` includes bounded native session recovery, six-digit code handling, and native Sign in with Apple | Rerun every gate after the UX slice freezes |
| First-use UX | PASS FOR LOCAL REVIEW | Six-step guide, curated low-risk starter pool, direct free-app launch, honest “Add this quest to today” copy, an exact selected-quest link on Home, first-screen Prayer/Bible/Reflection shortcuts, deferred installation prompt, opt-in floating MyShepherd, and a visually primary local-only native fallback passed local review. The account screen now distinguishes a live availability check from an unavailable result and avoids promising that device storage is absolutely private. A root-level capture retains Chromium’s one-shot install event across onboarding but the panel cannot appear until after a completed quest and its full delay | Product/content owner reviews copy and placement |
| Automated verification | PASS FOR LOCAL SOURCE | Lint, TypeScript, 1,656 Vitest tests across 216 files, focused first-use/Home/safe-area/keyboard/install-lifecycle tests, eleven Playwright journeys, production/header build, service worker, observability, launch-evidence fixture, reviewed public-target browser-bundle scan, production audit, and whitespace checks passed | Protected CI reruns against merged `main` |
| Local database harness | PASS FOR LOCAL SOURCE | After a bounded restart of the stalled local Docker Desktop engine, a clean BibleQuest-only reset applied all 38 numbered migrations through `0039` with `0013` absent, regenerated the reviewed seed without a diff, and produced the expected 150/180/38/32/32 content counts. All 23 pgTAP files / 572 assertions, public-schema lint, the 45-table RLS report and public posture contracts, and the two-connection account-deletion concurrency harness passed at `2026-08-28T06:54:40Z`. The BibleQuest stack was then torn down without stopping the unrelated RoseCode stack | Protected CI reruns the isolated database lane after merge; remote reconciliation and signed two-account/device evidence remain separate gates |
| Native account export | PASS FOR EXACT LOCAL ARTIFACT | Guarded account-release export generated 261 static pages, retained 79 reviewed public media files, verified the one reviewed public Supabase target, passed content-rights inventory, compiled for Release iPhone, and passed the complete unsigned simulator artifact verifier against its containing commit | Signed archive and device gates remain open |
| Native simulator first use | PASS FOR LOCAL SIMULATOR | Full Keyboard Access exercised the unsigned Release artifact from the local-only account screen through the six-step guide, selected quest, Home, exact quest detail, and terminate/relaunch persistence. The walkthrough exposed and fixed a skip link beneath the Dynamic Island; a fresh exact rebuild embeds the safe-area rule, passes artifact verification, and launched cleanly before the host locked again | Signed, provider-auth, physical-device, VoiceOver, Dynamic Type, reduced-motion, and two-account matrices stay open |
| Content placement | OPEN — HUMAN REVIEW | `artifacts/first-use-starter-quest-content-review-2026-08-27.md` records the exact four-slug allowlist, fail-closed metadata contract, checked-in WEB evidence fingerprints, and contextual review, but does not publish or approve content | Theology/content owner checks the two open boxes |
| First-use privacy design | CLEAR FOR HUMAN REVIEW | `artifacts/first-use-release-privacy-review-2026-08-28.md` traces local and optional account data, the anonymous live availability gate, telemetry posture, deletion paths, and residual exact-binary risks. The copy no longer claims that device storage is absolutely private | Privacy/legal, account/QA, and release owners close the listed manual gates; this is not release clearance |
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
- The language wheel now has one sequential keyboard stop and native arrow movement in optimized-browser coverage; Full Keyboard Access and VoiceOver confirmation on physical hardware remains part of the open accessibility matrix.
- The live web release is older than the candidate and still advertises schema `0038`; no candidate promotion has been authorized.
- App Privacy publication, live legal identity, visual rights, screenshots, reviewer notes, availability, and named owner approvals remain open.
- The privacy source review is clear for human review only; provider retention, signed two-account isolation, deletion, and exact live-policy disclosures are not yet proven.

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
