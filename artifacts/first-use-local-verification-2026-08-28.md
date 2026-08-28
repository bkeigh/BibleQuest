# First-use local verification evidence

## Decision

PASS FOR LOCAL SOURCE REVIEW; NOT A SIGNED OR DEVICE-VERIFIED RELEASE CANDIDATE

## Candidate scope

- Branch: `codex/first-use-release-candidate`
- Starting source: `c3af44df5834a53736da671cfe5a51b9a7ae1475`
- Recorded: `2026-08-28T04:19:00Z`
- Scope: six-step onboarding, reviewed starter-quest allowlist, direct free-app entry, post-value installation timing, opt-in MyShepherd launcher, and append-only Production native-availability reconciliation

## Automated evidence

| Command / check | Result | Limitation |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | PASS | Local dependency installation only |
| `pnpm lint` | PASS | Static lint only |
| `pnpm exec tsc --noEmit` | PASS | Type analysis only |
| `pnpm test` | PASS — 213 files, 1,649 tests | Repeated after the native local-only action and step-scroll adjustments |
| Focused first-use, containment, and native-commerce tests | PASS — 24 tests | Source-contract and unit coverage, not a signed binary |
| `pnpm test:e2e` | PASS — 10 browser journeys | Local fixture environment |
| `pnpm test:headers` | PASS — production build and 2 header checks | Local fixture environment |
| `pnpm test:service-worker` | PASS — 31 tests | Local worker harness |
| `pnpm test:observability` | PASS — 30 tests | Local/fixture contracts |
| `pnpm audit --prod --audit-level high` | PASS — no known vulnerabilities | Registry state at command time |
| `git diff --check` | PASS | Whitespace only |
| `pnpm ios:account-release:prepare` | PASS — 261 pages, reviewed public target, content-rights inventory, exact containing-commit identity | Local export, not an uploaded archive |
| Unsigned Release iPhone `xcodebuild` | PASS — `BUILD SUCCEEDED` | Proves device-target compilation, not signing, TestFlight processing, or physical-device behavior |
| Complete unsigned simulator artifact verifier | PASS — profile `account-release`, version `1.2`, build `4`, 2,853 files, exact containing-commit source identity | Uses the reviewed unsigned mode; signed archive verification remains open |

## Hands-on UX evidence

At 390×844, a clean account moved through Account, Name, Language/Bible, Daily rhythm, Practices, and First quest. The language heading was clear, the first quest remained stable while the name changed, and Start opened `/app` directly with no Plus interstitial. No install prompt appeared before value.

After completing “Notice Where Kindness Found You,” the completion and First Step milestone dialogs appeared in order. Thirteen seconds after they closed, the installation panel appeared; MyShepherd did not occupy the floating overlay slot. At 320×568, the language screen had no horizontal overflow (`innerWidth=320`, `scrollWidth=320`) and retained ordinary vertical scrolling.

A second local-only responsive pass inspected all six pages at 320×568 and the account page at 375×667. At 375×667, the primary action and both legal links were visible without scrolling. At 320×568, the primary action remained fully visible (`top=496.15`, `bottom=547.65`) with no horizontal overflow; the legal sentence continued below the fold through ordinary vertical scrolling. This pass exposed one transition defect: after scrolling the long Language/Bible page to Continue, the next illustrated page inherited the scroll offset and clipped its mascot. The candidate now resets both the onboarding container and document scroll on every step change. Replaying the narrow path produced `scrollY=0`, a visible mascot (`top=75`), and `scrollWidth=320` on the Daily rhythm and Practices pages, and `scrollY=0` on the First quest page.

### Native simulator first screen

A clean iPhone 16 Pro simulator on iOS 18.6 installed the exact account-release artifact. With the production native-availability latch intentionally off, the first render showed the local-only posture without provider controls or credential collection. The first capture exposed a hierarchy problem: the only viable continuation was a subdued ghost action and nearby copy repeated the fallback message.

The revised artifact uses one full-width evergreen “Continue on this device” control, removes the duplicate sentence, retains the accurate device-local/export explanation, and keeps Terms and Privacy visible above the home indicator. A terminate/relaunch produced the same layout. No account, credential, prayer, reflection, note, identifier, or private URL was used or captured. Both disposable simulator devices created for this check were removed afterward.

Computer Use could not click deeper because macOS was locked and automatic unlock correctly failed. Therefore this is PASS evidence for install, launch, relaunch, account-disabled posture, safe-area layout, and initial hierarchy only; it does not close interactive native onboarding, persistence, auth, physical-device, or accessibility gates.

## Read-only Production evidence

- `check:production-provider-rate-limits`: PASS, `applied=true`, `proposed=[]`; packet `20260826010000_bound_provider_rate_limit_retention.sql`.
- `check:production-native-availability`: PASS after accepting the exact reviewed append-only `0039` history, `applied=true`, `proposed=[]`.
- Apex `https://biblequest.co` returned a 308 redirect to `https://www.biblequest.co/`.
- Canonical health returned `status=ok`, release `cc959fd038ae86ca5d9d1ce125f93efd9c462148`, rollback `ed28b0bfc4d17d884649258227cda101d9f97ca1`, canonical match `true`, and schema `0038`. This is live-deployment drift: the database gate proves `0039` is applied and the candidate source advertises `0039`.

No Production write, deployment, signing, upload, TestFlight assignment, App Review action, or legal publication occurred.

## Open gates

- Human theology/content approval for the starter-quest placement
- Review and protected CI for the isolated candidate branch, then merge to a clean `main`
- Signed archive and exact-artifact verification
- Two-account/two-iPhone auth, restore, offline, isolation, deletion, old-client, accessibility, and reinstall matrices
- Live legal identity, App Privacy, visual-rights, screenshots, reviewer notes, availability, and named owner approvals
