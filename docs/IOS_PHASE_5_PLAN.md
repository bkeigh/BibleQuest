# iOS Phase 5 — release proof and controlled account beta

**Status:** Milestone 1 passed except for Clear My Data; ship its bounded native
cleanup fix in a new TestFlight build, then begin the isolated account beta

**Current tested guest baseline:** `5359dbf` / TestFlight build 13

**Canonical 1.0 procedure:** [`IOS_TESTFLIGHT_RUNBOOK.md`](IOS_TESTFLIGHT_RUNBOOK.md)

Phase 5 turns the existing guest-only iOS foundation into a signed, measured
release candidate. It then validates account sync in a separate internal beta.
Those are two independent decisions: passing the guest release does not enable
accounts, and passing an account beta does not change the App Store build.

## Immediate sequence

1. Merge the Clear My Data repair without account or AI activation changes.
2. Let Xcode Cloud produce the next build from that exact commit.
3. On a physical iPhone, clear a populated journey, force quit, relaunch, and
   prove that the journey, mirror, reminders, drafts, rhythm, game data, and
   avatar do not return. Keep the automated never-settling bridge test as proof
   that a native failure releases the button instead of remaining on
   “Clearing…”.
4. If the focused retest and one core smoke pass succeed, submit that same
   guest-only build for 1.0. Account work must not delay the repaired release.
5. Create a durable staging backend, then begin Milestone 3 in a separate
   account-beta build. MyShepherd follows the stable account lifecycle in
   Milestone 4.

## Guardrails

- Keep the App Store 1.0 artifact guest-only, analytics-off, and commerce-free.
- Do not enable native social OAuth, StoreKit, remote push, or iPad support in
  this phase.
- Do not change a production account or CORS latch merely to make a test pass.
- Use one small, reviewable change for each failure class. Add a regression test
  before removing a compatibility path or changing stored-data behavior.
- Keep comments focused on a block's current goal, invariant, or non-obvious
  policy. Avoid comments that narrate history or restate the code.

## Milestone 0 — restore Xcode Cloud (complete)

The external `App | Default` workflow now archives successfully alongside the
green GitHub iOS Release build.

The original failure happened before signing: Xcode Cloud reached Swift package
resolution without the Capacitor packages under `node_modules/.pnpm`. The
post-clone preparation script fixed that clean-checkout boundary. Enabling
Complete Data Protection for the App ID then allowed automatic signing and
distribution to complete.

### Diagnose from the first red action

1. In App Store Connect, open BibleQuest → Xcode Cloud → Builds → the latest
   failed `App | Default` build.
2. Open the earliest failed action and save its first actionable error. Later
   cleanup, archive, and upload errors are often consequences.
3. Record the commit, workflow, Xcode version, macOS version, action, and error
   in the pull request that fixes it.

### Correct the workflow contract

- Product: `ios/App/App.xcodeproj`
- Scheme: `App`
- Action/configuration: Archive / Release / iOS
- Signing: automatic, team `W8KU6X34XR`, bundle ID `co.biblequest.app`
- Environment: latest released Xcode and macOS. The workflow must not use Xcode
  16 because the checked-in `AppIcon.icon` is an Icon Composer asset. GitHub CI
  currently proves the project with Xcode 26.3.
- Start condition: changes to `main`; use a clean build for TestFlight delivery.

### Generate the ignored Capacitor payload after clone

`node_modules` and `ios/App/App/public` are generated, ignored directories, but
Swift package resolution needs the first and the Xcode target copies the second
into the app. A clean Xcode Cloud checkout therefore uses the executable
`ios/App/ci_scripts/ci_post_clone.sh` to:

1. resolves the repository through `CI_PRIMARY_REPOSITORY_PATH`;
2. selects Node 24 and pnpm 11.10.0;
3. maps Xcode Cloud's increasing build number to `CFBundleVersion`;
4. runs `pnpm install --frozen-lockfile`;
5. runs `pnpm ios:release:prepare`; and
6. prints tool versions and the release-builder result without printing secrets.

Apple recognizes `ci_post_clone.sh` when it is inside a `ci_scripts` directory
next to the Xcode project. Keep the script thin and leave release policy inside
the already-tested package command.

### Refresh signing only when the log requests it

The app declares Complete Data Protection. In Certificates, Identifiers &
Profiles, App ID `co.biblequest.app` must have Data Protection enabled with
Complete Protection. Changing an App ID capability invalidates older profiles;
allow Xcode Cloud's automatic signing to create a fresh profile before the next
archive.

**Exit gate:** a clean `main` checkout completes post-clone preparation,
archives with a current Xcode release, signs the expected bundle and
entitlements, and produces an App Store Connect build. Preserve the build log
and artifact identifiers as release evidence. This gate passed on August 10,
2026 for commit `1784cfa5ffd4818606c7e00113f8dbfb14f70e9e`.

## Milestone 1 — prove the guest-only TestFlight candidate

Prepare and upload one reusable candidate by following the canonical runbook.
Do not rebuild between internal TestFlight approval and App Review.

Test on at least one current physical iPhone and one meaningfully different
screen/OS combination. If only one physical device is available, record that
limitation and cover the second layout in Simulator; do not represent simulator
coverage as proof of notification delivery, Keychain behavior, or signing.

| Area | Required proof |
| --- | --- |
| Install and restore | Fresh install, upgrade over the prior build, background, force quit, restart, and protected journey restore succeed. |
| Core journey | Scripture, prayer, reflection, quests, games, and Journey work online and offline without account UI. |
| Accessibility | Largest supported Dynamic Type sizes, Bold Text, VoiceOver order and labels, Reduce Motion, keyboard focus, and light/dark contrast remain usable. |
| Local reminders | Permission grant and denial, test notification, daily and weekly delivery, quiet-hours rollover, timezone change, disable, and Clear Everything cleanup work in foreground, background, and terminated states. |
| Privacy | App-switcher cover hides writing; export and clear work; no auth, analytics, billing, or user-content network traffic appears. |
| Signed bundle | Bundle ID, version/build, Complete Data Protection entitlement, privacy manifest, device family, and minimum iOS version match the runbook. |
| Layout and links | Small and large screens clear safe areas and keyboard; About, Terms, Privacy, and support open correctly. |

Every result should include the build number, commit SHA, device, OS version,
timestamp, pass/fail state, and a restricted evidence link. A crash, data loss,
privacy failure, broken restore, or blocked core journey stops release.

## Milestone 2 — close the measured parity gaps

Fix only defects discovered by the signed candidate, then repeat the affected
matrix and one core smoke pass. Add three short living documents:

1. `IOS_SETTINGS_PARITY.md`, labeling each control shared, native-only, hidden
   in guest mode, or deferred;
2. `IOS_ACCESSIBILITY_QA.md`, naming screens, text sizes, VoiceOver order, and
   evidence fields; and
3. `ios-evidence/TEMPLATE.md`, recording build, SHA, owner, device/OS, time,
   result, and restricted evidence links. Its reminder rows must cover delivery
   state, recurrence, time changes, authorization changes, and cleanup.

Native permission, schedule, time, and timezone now use one device-only source
of truth and do not update account-sync settings. Before account beta, provide
an “Open iOS Settings” recovery action after permission denial and refresh
permission and pending-request state when the app returns to the foreground.

Update [`CI.md`](CI.md) whenever required checks change. Keep broad visual
experiments, dependency upgrades, and unrelated refactors out of the release
fix branch. Safe dead-code removal can follow the release candidate when import
reachability, stored-data compatibility, and focused tests prove the deletion.

**Exit gate:** all release blockers are closed, the full regression suite and
native Release build are green, and the canonical runbook contains no stale
instructions.

## Milestone 3 — run an account-enabled internal beta

This milestone begins only after the guest candidate is stable. Use a separate
internal build and reviewed backend environment; never flip the 1.0 release
builder's containment pins.

### Scope

- Add a deterministic `--account-beta` builder and
  `ios:account-beta:prepare` command beside—not in place of—the guest release
  builder. Pin its reviewed backend and flags; never make arbitrary
  `.env.local` contents the beta procedure. CI must prove the guest export has
  no account markers and the beta export contains only the allowlisted staging
  posture.
- Offer email numeric-code sign-in only. Keep Apple and Google hidden until a
  native browser/deep-link flow is designed and device-tested.
- Keep the beta explicitly free-tier unless native Plus entitlement parity is
  fixed and separately tested.
- Use the Keychain-backed native Supabase client, exact native CORS allowlist,
  bearer verification, and explicit credential purge after account deletion.
- Add a server/database account-availability contract before distributing the
  beta. The compiled public flag is not a kill switch because an installed app
  can call Supabase directly; the remote boundary must fail closed without
  deleting the local journey.
- Bound individual sync requests instead of wrapping the entire pull, merge,
  and full push in one short deadline. Batch growing collections, skip an
  unchanged foreground push, and test small, 1,000-row, and realistic mature
  accounts on a constrained network.
- Extend the two-user isolation probe whenever an account-owned table is added;
  the first update must include guided movements. Select only the columns the
  client contract needs and set explicit account-size/text limits.
- Publish a short Settings explanation of what syncs. Core profile, Scripture,
  quest, prayer, reflection, journey, and pilgrimage data sync; drafts and
  native reminders remain device-only. Decide games and Rhythm separately
  rather than implying they already travel between devices.
- Define deleted-account behavior on a second offline device: erase data stamped
  to that account only after a verified `user_not_found`, never after an
  ordinary network, refresh, or token error.
- Update App Store privacy answers and review notes before any account-enabled
  binary leaves internal testing.

### Required device matrix

- new user and returning user email-code sign-in;
- guest journey adoption into the first account;
- force quit, device lock/unlock, token refresh, offline use, and relaunch;
- second-device restore and bounded conflict handling;
- account A → account B with both “start fresh” and “claim this journey” choices;
- failed sign-out that remains fail-closed;
- account deletion, local journey/reminder purge, relaunch, and reinstall;
- containment rollback that exposes no account UI or auth/sync traffic.

**Exit gate:** two disposable users remain isolated across two devices, every
ownership transition is explicit, deletion leaves no recoverable session or
user data, device A reminder choices never change device B, and returning to
guest containment is tested. The guest output must remain unchanged, and the
beta output must be reproducible and unable to target production accidentally.
Account rollout still requires a separate product and release decision.

## Milestone 4 — prove MyShepherd inside the account beta

MyShepherd should follow—not share—the account activation change. Its server
route already keeps the provider key private, validates navigation actions,
bounds input/output, avoids saving questions, and applies account-scoped rate
limits. This milestone proves the remaining client, entitlement, disclosure,
and model-safety contracts before any public exposure.

### Implementation order

- On native, load Plus entitlement from `/api/billing/status` without fetching
  `/api/billing/plans`. Native has no StoreKit or web-plan acquisition path, and
  the plans route is intentionally absent from its CORS allowlist.
- Add a reviewed runtime MyShepherd switch so a bad provider response or safety
  issue can disable new requests without a replacement binary.
- Give client requests a bounded abort deadline with a calm retry state. Keep
  each question independent and say so clearly; do not add transcript memory,
  retrieval, or cross-device AI history in this phase.
- Align the floating panel, standalone screen, Privacy Policy, About page, Plus
  copy, QA guide, and App Store privacy answers. Name the AI processor, warn
  that answers may be wrong, discourage private information, and direct crisis,
  medical, legal, and pastoral emergencies to appropriate human help.
- Add a mocked provider-response test and a secret-safe staging smoke command.
  The smoke record may contain pass/fail metadata, never the user's question,
  generated answer, email, token, or provider error body.
- Run a reviewed safety set covering fabricated quotations, unsupported
  certainty, claims of divine authority, denominational overreach, medical and
  legal advice, abuse, self-harm, prompt injection, malformed provider output,
  and citation/action relevance.

### Internal proof

Use an operator Plus grant for disposable beta accounts; StoreKit remains out
of scope. Prove the same account on web and iPhone can receive a valid answer,
open every allowed Scripture/action link, hit the rate limit safely, recover
from offline and timeout states, relaunch without retained questions, and stay
isolated from another account. Also prove MyShepherd is hidden for a non-Plus
account and when its runtime switch is off.

**Exit gate:** entitlement is correct on both clients, no question or answer is
persisted or logged, disclosures match observed processing, failure states are
bounded, reviewed safety prompts stay within policy, and the runtime switch has
been rehearsed. Public enablement remains a separate release decision.

## Deferred vertical slices

Treat each item below as its own future design, security review, implementation,
and device-QA slice:

- native Apple and Google OAuth with `ASWebAuthenticationSession`, exact
  callback validation, one-shot PKCE exchange, cancellation, and replay tests;
- StoreKit purchase and entitlement parity, including offline grace;
- APNs or other server-driven notifications;
- iPad layout and multitasking;
- native camera/photo selection and its privacy permission; and
- background sync or refresh.

## Quality rails for every Phase 5 pull request

- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm test`
- all configured web production builds
- `pnpm build:native:release`
- `pnpm ios:release:prepare`
- unsigned iOS Release simulator compilation
- `pnpm audit --audit-level high`
- focused physical-device evidence for behavior that a simulator cannot prove

No milestone is complete because code merged. It is complete only when its
exit gate has reproducible evidence.

## Apple references

- [Xcode Cloud workflow reference](https://developer.apple.com/documentation/xcode/xcode-cloud-workflow-reference)
- [Writing Xcode Cloud custom build scripts](https://developer.apple.com/documentation/xcode/writing-custom-build-scripts)
- [Xcode Cloud environment variables](https://developer.apple.com/documentation/xcode/environment-variable-reference)
- [Enabling App ID capabilities](https://developer.apple.com/help/account/identifiers/enable-app-capabilities)
