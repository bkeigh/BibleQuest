# iOS account beta preparation and handoff

**Status:** fail closed; no reviewed durable staging backend is pinned

**Last policy check:** August 11, 2026

This handoff covers the isolated email-code account and sync beta. It does not
enable Stripe, Plus, MyShepherd, analytics, social OAuth, production CORS, or a
production account rollout. The guest App Store preparation path remains the
canonical release path.

## Current outcome

The repository has two deliberately separate native preparation commands:

```bash
# App Store guest artifact; remains the Xcode Cloud command.
pnpm ios:release:prepare

# Internal account beta; currently stops before building.
pnpm ios:account-beta:prepare
```

`ios:release:prepare` still loads `.env.local` and then overwrites every
identity-sensitive public value with its reviewed guest posture. Supabase URL
and keys are blank; account sync, the native beta, account gating, native
commerce, and analytics are false; and no native bearer-token lookup or billing
projection can run.

`ios:account-beta:prepare` does not load `.env.local`. It reads only the public
Supabase key from ignored `.env.account-beta.local`, then requires that key to
match the SHA-256 fingerprint in
[`config/ios-account-beta.json`](../config/ios-account-beta.json). The checked-in
manifest has `reviewed: false` and blank Supabase fields, so the command exits
before staging source, running Next, replacing `out-native`, or syncing Xcode.
That stop is the intended result until the manual review below is complete.

The builder explicitly refuses these known unsafe projects:

- production `iacnjqnssovaaojswjoh`;
- historical account-sync staging `yjwlunqssyztxkedstjb`; and
- deleted disposable bearer staging `lorqiyzrfmpvvcvsvghc`.

An arbitrary `.env.local`, shell environment, hosted origin, Supabase URL, or
nonmatching public key cannot redirect the beta build. The only future target
is the exact reviewed manifest committed in a separate review. The builder
also rejects any second assignment in `.env.account-beta.local`, removes
unreviewed inherited `NEXT_PUBLIC_*` values, and scans the export for any
non-allowlisted concrete Supabase origin.

## Reviewed manifest contract

The manifest is intentionally public and contains no credential:

```json
{
  "contract": "biblequest_ios_account_beta_target_v1",
  "reviewed": false,
  "hostedOrigin": "https://native-staging.biblequest.co",
  "supabaseOrigin": "",
  "supabasePublishableKeySha256": ""
}
```

After the durable staging review, only `reviewed`, `supabaseOrigin`, and the
public-key fingerprint change. `hostedOrigin` stays the exact stable custom
domain. Do not put the key itself, a service-role key, SMTP credentials, an OTP,
or a database connection string in the manifest.

The ignored key file must contain exactly the public client key input:

```dotenv
BIBLEQUEST_IOS_ACCOUNT_BETA_PUBLISHABLE_KEY=sb_publishable_REDACTED
```

The following command prints only its SHA-256 fingerprint for comparison with
the reviewed manifest:

```bash
node --env-file=.env.account-beta.local -e 'const { createHash } = require("node:crypto"); const key = process.env.BIBLEQUEST_IOS_ACCOUNT_BETA_PUBLISHABLE_KEY; if (!key) process.exit(1); process.stdout.write(createHash("sha256").update(key).digest("hex") + "\n")'
```

## Manual durable staging provisioning and review

These are human-controlled staging steps. They are not performed by the build
command or authorized by this handoff.

1. Create or designate one durable Supabase project used only for the native
   account beta. Confirm its project reference is not production, either retired
   staging project, a disposable branch, or a restore-drill project.
2. In an isolated checkout, capture its remote migration history and reconcile
   it forward to the complete reviewed repository migration set, including the
   native account availability boundary. Review the dry run before any push.
   Never reset, repair, or relink production to make staging pass.
3. Run the complete local database suite, linked pgTAP suite, shared RLS/grant
   report, beta-only
   [`native_account_beta_report.sql`](../supabase/evidence/native_account_beta_report.sql),
   and anonymous-denial checks. Extend the two-user probe through guided
   movements and every other account-owned relation before accepting the target.
4. Configure Supabase Auth for email numeric-code OTP only for this native beta.
   Keep phone, anonymous auth, Apple, Google, and other social providers out of
   the native flow. Publish the reviewed numeric-code email template, use
   staging SMTP, conservative resend limits, and exact callback/site URLs with
   no wildcard.
5. Repoint the Preview deployment behind
   `https://native-staging.biblequest.co` to the durable project. The historical
   handoff says this host's variables referenced the now-deleted disposable
   project, so project identity must be read back from the deployed CSP and
   health posture rather than inferred from a dashboard label.
6. Scope the native-origin CORS latch and all staging credentials to that exact
   Preview environment. Keep production and every other environment unchanged.
   Verify `Origin: capacitor://localhost` on the exact allowlisted routes and
   verify excluded routes remain undecorated.
7. Apply and review the remote `native_account_beta` availability contract with
   its flag disabled. Prove the public RPC returns only the fixed contract and
   boolean, and prove beta-header reads, writes, and generation-bound RPCs fail
   while disabled without deleting the device's local journey.
8. Run `pnpm check:staging-isolation` plus the disabled-header and anonymous
   denial checks with disposable users and sanitized output. The positive
   native bearer probe remains blocked until the staffed window opens because
   its protected reads and writes must agree with the live database flag.
9. Have a second reviewer compare the exact project reference, migration
   history, provider configuration, Preview deployment target, public-key
   fingerprint, and evidence. Only then commit the manifest with
   `reviewed: true` and the exact non-production origin and fingerprint.
10. Create `.env.account-beta.local`, run
    `pnpm ios:account-beta:prepare`, and audit `out-native` plus
    `ios/App/App/public` for the two allowlisted staging origins and the absence
    of production, historical staging, deleted staging, `*.vercel.app`,
    analytics, AI, and commerce configuration.
11. Enable the staging availability flag only for the bounded internal device
    session after the owner approves the evidence. Run
    `pnpm check:native-bearer-isolation`; it first requires the fixed public
    availability contract to report `available:true`, then proves both account
    directions, avatar cleanup, malformed tokens, native CORS, the beta marker,
    and expected-user binding. Rehearse disabling the flag while a client is
    installed and while a request is in flight, then confirm the same probe
    fails closed. Delete all fixtures and leave Production untouched.
12. Re-run `pnpm ios:release:prepare` after the beta exercise and prove the
    synced Xcode payload returns to guest containment with no Supabase target,
    account traffic, or staging marker.

The staging commands use dedicated ignored operator files. Never copy values
from `.env.local`, `.env.staging-sync.local`, production Vercel, or a Stripe
environment into the native beta input.

## Runtime integration contract

The preparation profile provides these exact public values to neighboring
account work:

- platform `native`;
- hosted origin `https://native-staging.biblequest.co`;
- the reviewed staging Supabase origin and fingerprinted public key;
- account sync `true`;
- native account beta `true`;
- native commerce `false`, independently containing billing, Plus, and AI UI;
- account gate `false`, preserving optional local-first guest use;
- native OAuth callback blank;
- analytics, Plausible, and public Stripe configuration blank or false.

Native beta Supabase requests carry
`x-biblequest-native-account-beta: v1`. The remote availability RPC has the
strict response shape:

```json
{
  "contract": "biblequest_native_account_beta_v1",
  "available": false
}
```

The boolean may be true only in the reviewed staging exercise. Missing,
malformed, oversized, late, or unavailable responses mean unavailable. The
database also checks the header on account-owned reads, writes, and
generation-bound RPCs so an installed client cannot rely only on a cached UI
decision. Account-scoped API and deletion requests additionally carry
`x-biblequest-expected-user`; the server must match it to the verified bearer
subject before acting. The narrow avatar-deletion cleanup marker cannot bypass
that subject check or open any other data path.

Neighboring tasks must not infer identity, ownership, Plus, or purchase success
from this build profile, the availability response, redirects, query strings,
client storage, or storefront state. Supabase bearer verification remains the
identity boundary and server billing state remains the entitlement boundary.
This task exposes no checkout, portal, webhook, StoreKit, or Plus UI contract.

Drafts and native reminders remain device-only. Games and Rhythm do not become
cross-device merely because the account profile is enabled. Account deletion
must purge only the verified current account's credential, local ownership,
protected mirror, reminder and draft state, journey, game/Rhythm state, and
avatar, without touching another account.

## Required two-device matrix

Use two physical iPhones with meaningfully different supported iOS/screen
combinations and two disposable accounts. Simulator coverage may supplement
layout checks but is not Keychain, reinstall, notification, or signing proof.

| Scenario | Required result |
| --- | --- |
| Disabled beta, fresh launch | Account actions fail closed; guest Scripture and journey remain usable; no auth/session/sync traffic starts. |
| New account A | Numeric email code creates the expected session; no OAuth control appears. |
| Returning account A | Force quit, lock/unlock, access-token refresh, offline relaunch, and reconnect preserve the correct owner. |
| Guest adoption | The first explicit claim adopts only that device's guest journey into account A. |
| Device B restore | Account A restores the reviewed sync collections with bounded conflicts; device A reminders and drafts never appear. |
| Mature account | Small, 1,000-row, and realistic mature collections complete under constrained networking through per-request deadlines and bounded batches. |
| Account A to B: start fresh | A's private data stops immediately; the device clears the scoped local journey before B restores. |
| Account A to B: claim journey | The explicit claim transfers only the locally presented journey and never silently merges A's server data into B. |
| Failed sign-out | The UI remains fail closed and no stale A subscriber writes through a changed or uncertain session. |
| Account deletion | Both devices, reminders, drafts, protected mirror, game/Rhythm state, avatar, and Keychain credential are purged only after verified account deletion semantics. Ordinary network/token errors do not erase offline data. |
| Reinstall | The install marker removes orphaned Keychain credentials; no deleted or prior account silently returns. |
| Remote disable | Existing UI, OTP requests, refresh, pull, and writes stop; stale responses cannot commit; the local journey is retained. |
| Two-user isolation | Both read and mutation directions deny the other user's rows for every owned relation, including guided movements. |
| Guest rollback | A fresh `ios:release:prepare` exposes no account UI and makes no Supabase auth, refresh, bearer, availability, or sync request. |

For every row record build number, commit SHA, device, iOS version, account
fixture label, time, constrained-network posture, pass/fail, and a restricted
evidence link. Never record an email code, access token, public-key input,
private writing, checkout URL, provider body, or user identifier.

## Security and privacy decisions

- The guest release has its account and native-commerce latches off and no
  Supabase configuration. Clearing configuration is defense in depth; the
  contained clients stop before session inspection, bearer lookup, billing
  projection, or purchase-adapter work.
- The beta accepts one source-reviewed non-production target and a fingerprinted
  public key. It does not inherit arbitrary developer environment state.
- Availability is checked before native auth and again inside sync. The database
  rejects beta-header reads and writes after a remote disable while keeping the
  verified account-deletion path available.
- Individual network operations receive deadlines; a large pull, merge, and
  push must not be placed under one short global timeout.
- Account/generation changes invalidate stale work before it can update local
  ownership or write remotely.
- Account deletion and A-to-B handoff share one device-wide lifecycle. Owner
  state is rechecked after every awaited boundary, concurrent account cleanup
  is refused, and sign-in/sync stay provisional until the lifecycle finishes.
- Start-fresh handoff tombstones the protected mirror and requires verified
  deletion of avatars, drafts, reminders, games, Rhythm, and the persisted
  journey before stamping the incoming owner. Any failed store retains the old
  owner marker and blocks sync instead of relabeling residue.
- Explicit native sign-out revokes through a storage-free client and clears
  only the exact captured Keychain session after server success. A failed
  revoke retains the credential and journey; an account swap preserves the
  newer session and requires a clean reload.
- Native credential purge compares the persisted Supabase subject and clears
  it under the same serialized Keychain queue used by session writes. A newer
  account is preserved, and a late refresh for the deleted subject cannot
  reinstall it. Multi-account generation and revision ledgers remove only the
  deleted subject's entry.
- Avatar deletion acquires a durable, owner-bound server latch before sweeping
  Storage. Later uploads and pointer commits are denied, missing profile/sync
  scaffolds cannot strand self-service erasure, and unrelated owners remain
  untouched. Partial device cleanup retains its owner and credential so startup
  verification can retry rather than losing the purge boundary.
- No service-role, SMTP, Stripe, AI, signing, or database credential belongs in
  the manifest, public key file, bundle, logs, or evidence.
- The beta pins its independent native-commerce latch off, so Plus projection,
  MyShepherd, checkout, portal, and billing requests stay inactive even while
  account sync is enabled. It remains analytics-off; local-first guest use,
  device-only reminders, and private drafts remain available.

## Current Apple and Stripe policy basis

These sources were read on August 11, 2026 and must be checked again before any
commerce-enabled binary or App Review submission:

- Apple's [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/),
  especially 3.1.1 and 3.1.1(a), state that United States storefront apps do
  not require the external-purchase-link entitlement merely to include buttons,
  external links, or other calls to action to other purchase methods. That
  exception must not be generalized to another storefront.
- Guideline 5.1.1(v) and Apple's
  [account-deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
  require an account-enabled app to let the user initiate deletion in-app and
  remove the full account rather than merely deactivate it. The scoped numeric
  email-code flow is not a third-party/social login service under guideline
  4.8, so this task does not add social OAuth or Sign in with Apple.
- Apple's [Storefront documentation](https://developer.apple.com/documentation/storekit/storefront/)
  and [`Storefront.countryCode`](https://developer.apple.com/documentation/storekit/storefront/countrycode)
  identify the current App Store storefront. Apple says storefront information
  can change and should be obtained immediately before displaying availability,
  not saved into a customer profile or used for tracking. A future purchase
  gate therefore uses current StoreKit storefront state and fails closed when
  it is missing or not `USA`; it never substitutes IP, locale, language, GPS,
  or a typed country.
- Stripe's [mobile digital-goods overview](https://docs.stripe.com/mobile/digital-goods)
  says an iOS app selling digital goods in the United States can redirect to an
  external Stripe-hosted page.
- Stripe's [iOS Checkout guide](https://docs.stripe.com/mobile/digital-goods/checkout)
  describes opening Stripe Checkout in a browser and setting
  `origin_context: "mobile_app"`; webhook processing, not the success page,
  updates digital access.

Those sources explain the policy assumed by neighboring US commerce work. They
do not activate commerce here, prove App Review acceptance, or make a Checkout
success page authoritative for Plus.

## Future production-only steps — not authorized here

Before any account-enabled or commerce-enabled public binary, a human release
owner must separately approve and record production migration history and
backup evidence, exact native CORS destinations, provider configuration,
availability controls, privacy answers, review notes and demo access, United
States App Store availability, current-storefront gating, and the complete
physical-device matrix. Reverify the official policies at that time.

Never put production into `config/ios-account-beta.json`, reuse a staging
fingerprint for production, flip a production feature flag, submit to Apple,
change App Store availability, or make a charge as part of this preparation
task.

## Honest blockers and handoff record

Current blockers are intentional and unresolved:

- no durable non-production Supabase project has been selected and reviewed;
- `native-staging.biblequest.co` has historical evidence of stale variables
  pointing at a deleted project;
- the checked-in target manifest remains `reviewed: false`;
- the native availability migration has not been proven on that future target;
- no account-beta native export, Xcode build, signed binary, physical-device
  sign-in, two-device isolation, reinstall, or remote-disable rehearsal has
  been completed; and
- no Stripe, App Store, App Review, or production proof is claimed.

The implementing task's final handoff must record: outcome, branch and commit,
files changed, focused and broad tests/builds, security/privacy decisions,
Apple/Stripe source check date, the integration contract above, completed
manual steps, and every remaining blocker. A source change alone does not close
the device or provider gates.
