# iOS account replacement release

**Current decision (updated 2026-08-20):**
`HOLD — LOCAL SOURCE REVIEW ONLY; NO FROZEN RELEASE CANDIDATE`

> **Current-state correction.** Production is recorded at `main`
> `9680ff7399ece7be7dd921ee3092839e5a5a73da`, schema contract `0038`, with
> migrations `0037` and `0038` already shipped and native account availability
> off. Section 5 items 1–9 are preserved only as the history that produced that
> state. **Do not replay their migration, merge, deployment, backup, or rollback
> steps.** Remaining work starts with a new frozen-SHA source/artifact pass,
> then section 5 items 10–12 and the device matrix in section 6. Brendan alone
> approves or performs every external action, and must re-confirm the recorded
> Production state before the first one.

This runbook governs the first public BibleQuest iOS replacement that adds
email-code accounts and Production-backed journey sync. It is separate from the
guest-only 1.0 instructions in
[`IOS_RELEASE_READINESS.md`](IOS_RELEASE_READINESS.md) and
[`APP_STORE_SUBMISSION.md`](APP_STORE_SUBMISSION.md). Those documents remain the
contract for build 13 and the current guest release; their guest privacy answers
and review notes must not be reused for this replacement.

The replacement is deliberately narrow:

- modern Supabase publishable and secret keys replace known BibleQuest uses of
  the legacy key classes;
- the native client uses the modern publishable key only;
- migration `0037_native_account_beta_availability.sql` adds a remotely
  controlled native account boundary that defaults off;
- standalone migration `0038_web_account_deletion_hardening.sql` must complete
  the web Storage/deletion safety phase first without enabling native accounts;
- email numeric-code accounts, account deletion, and reviewed journey sync are
  in scope;
- native commerce, Plus acquisition, social OAuth, analytics, APNs, and remote
  reminders remain out of scope; and
- legacy `anon`, legacy `service_role`, and the legacy JWT secret remain enabled
  and unchanged for old-client compatibility. Retiring them is a separate task.

No unchecked item is a pass. Never record a key value, token, email address,
user identifier, private writing, raw provider payload, database credential, or
reusable reviewer credential in this file, CI, chat, tickets, screenshots, or
public logs.

## 1. Frozen release identity

Complete this table immediately before the first external mutation. A moving
branch, local-only commit, dirty tree, or deployment built from a different SHA
is a hard stop.

| Field | Required value | Current preparation evidence | Status |
| --- | --- | --- | --- |
| Release branch | `main` at freeze; proposed fixes reviewed separately first | Remotely rechecked `origin/main` at `cc959fd038ae86ca5d9d1ce125f93efd9c462148` on 2026-08-26; the local candidate remains a separate unpushed branch | OPEN — NO FROZEN CANDIDATE |
| Immutable release SHA | `[FULL 40-CHAR PUSHED SHA]` | Record after the final documentation/control commit | OPEN |
| Production project | `iacnjqnssovaaojswjoh` | Pinned by the target manifest and guarded migration script | PASS FOR SOURCE |
| Native target | Exact reviewed Production origin plus matching modern publishable-key fingerprint | [`config/ios-account-release.json`](../config/ios-account-release.json) | PASS FOR SOURCE |
| Migration posture | `0037_native_account_beta_availability.sql` and `0038_web_account_deletion_hardening.sql` are recorded as already shipped | 2026-08-20 production audit; Brendan must re-confirm before the staffed window | RECORDED COMPLETE — RECONFIRM |
| New migration / guarded packet | None in the remaining iOS release scope | Any new database change reopens the migration, backup, compatibility, and approval gates | NOT APPLICABLE UNLESS SCOPE CHANGES |
| Backup | No database write is part of the remaining local preparation | A current approved backup becomes mandatory again if the scope adds any Production database mutation | NOT APPLICABLE UNLESS SCOPE CHANGES |
| Existing public binary | Version 1.0, build 13, commit `5359dbf15fa6d1d9d2205644adb668d6361eabd0` | Exact archived IPA SHA-256 `01c2600c577b79b27f07ef6ff773b4c6985dad36cbb0d2dc9c493398fe403c91` | PASS FOR IDENTITY |
| Web rollback | `[IMMUTABLE DEPLOYMENT ID / FULL SHA]` | Resolve from current approved health and compatibility evidence at freeze; do not reuse an older hard-coded target | OPEN |
| Replacement build | `[VERSION / BUILD / ARCHIVE SHA-256 / COMMIT]` | Must be produced after every gate below passes | OPEN |

The build 13 inspection found no Production Supabase host, legacy anonymous
JWT, modern publishable key, modern secret, or service-role JWT. Keep that exact
artifact available for compatibility testing; do not infer its contents from
the current source tree.

## 2. Named authority

One person may hold multiple roles, but every row needs a full name and UTC
acknowledgement. The database owner and rollback authority must both approve a
database recovery decision. The TestFlight/App Store owner must approve tester
creation, build distribution, metadata, review submission, and public release.

| Role | Named human | Acknowledged at | Responsibility |
| --- | --- | --- | --- |
| Release commander | `[FULL NAME]` | `[UTC]` | Calls holds and records the final decision |
| Deploy owner | `[FULL NAME]` | `[UTC]` | Preview, staged Production artifact, promotion, web rollback |
| Database owner | `[FULL NAME]` | `[UTC]` | Project identity, backup, migration, verification |
| QA/account posture owner | `[FULL NAME]` | `[UTC]` | Web and native account/device evidence |
| Privacy/legal owner | `[FULL NAME]` | `[UTC]` | Privacy answers, retention, deletion, review disclosures |
| Monitoring owner | `[FULL NAME]` | `[UTC]` | Staffed test windows and release watch |
| TestFlight/App Store owner | `[FULL NAME]` | `[UTC]` | Tester, signed build, metadata, review, release |
| Rollback authority | `[FULL NAME]` | `[UTC]` | Final go/no-go, disable, rollback, or forward-fix decision |

Repository ownership evidence currently identifies Brendan Kenney. That does
not silently assign the other operational roles.

## 3. Key-consumer and environment gate

Record only key classes, variable names, target environment, owner, and
migration status. Never reveal values or secret fingerprints.

- [ ] Production server workloads use `SUPABASE_SECRET_KEY`; Production code
      cannot fall back to `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Production browser and replacement native clients use
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; no built client uses
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] Synthetic health, readiness, and operator scripts use the modern
      publishable key without putting it in `Authorization: Bearer`.
- [ ] GitHub monitoring has been rewritten to the modern publishable-key class,
      with the exact consumer and rollback recorded.
- [ ] Legacy `anon`, legacy `service_role`, and legacy JWT signing remain
      enabled and unchanged.
- [ ] Every open Preview is mapped to an isolated non-Production Supabase
      project, or has no Supabase configuration. A green Preview check is not
      proof of project identity.
- [ ] No ordinary Preview, shell override, `.env.local`, or generic native build
      can select Production. Only `pnpm ios:account-release:prepare` can do so.

The open integration branch and any Supabase Preview branch must be reconciled
before a second overlapping PR is published. Do not merge both implementations
or delete a Preview merely because its variables are numerous; first prove its
project reference and whether it contains only synthetic data.

## 4. Source and artifact gates

Required source evidence against the frozen SHA:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm test:headers
pnpm test:service-worker
pnpm test:observability
pnpm test:launch-evidence
pnpm test:e2e
pnpm build
pnpm check:supabase-browser-bundle
pnpm audit --prod --audit-level high
git diff --check
```

Required native artifacts:

```bash
# Current guest compatibility artifact.
pnpm ios:release:prepare

# Production account replacement; reads only the ignored public-key input.
pnpm ios:account-release:prepare
```

Xcode Cloud's post-build script must then pass the signed archive through the
same exact-artifact command. Replace the placeholders with the frozen `main`
SHA and the actual Cloud build number; Build 41 is the planned candidate:

```bash
node scripts/verify-ios-release-app.mjs \
  --app "<ARCHIVE>/Products/Applications/App.app" \
  --profile account-release \
  --expected-build 41 \
  --expected-source "<FULL_FROZEN_MAIN_SHA>"
```

- [ ] Guest output contains no Supabase target, key, account marker, analytics,
      or commerce configuration and embeds the guest privacy manifest.
- [ ] Account output contains exactly the reviewed Production origin and modern
      publishable-key fingerprint, no second Supabase origin/key, no secret or
      service-role credential, no Preview/staging host, no analytics, and no
      native commerce.
- [ ] The selected account privacy manifest is byte-identical to
      `ios/compliance/PrivacyInfo.account-sync.xcprivacy`.
- [ ] The account manifest and App Store privacy answers declare linked profile
      photos for app functionality; the guest manifest remains data-free and
      neither profile declares tracking.
- [ ] The final Xcode archive is built from the frozen SHA, signed for the
      intended distribution path, scanned after archive/export, and recorded by
      version, build, commit, and SHA-256.
- [ ] `native-release-identity.json` names the exact frozen SHA and account
      profile, and `verify-ios-release-app.mjs` passes without
      `--allow-unsigned`. Record its complete tree SHA-256 beside the exported
      IPA/archive SHA-256.
- [ ] Xcode Cloud's default workflow remains guest-only. An account replacement
      must use a separately reviewed workflow/profile; a merge to `main` alone
      must not silently upload an account-enabled binary.

Simulator and unsigned builds do not prove signing, Keychain, reinstall,
notification, TestFlight, or physical-device lifecycle behavior.

## 5. Historical prerequisites and remaining external actions

Each numbered item requires approval for that exact mutation immediately before
execution. Approval of one item is not approval of the next.

**Items 1–9 are a historical record and must not be executed again.** They
describe the already-completed web/schema rollout that preceded the current
`9680ff7` / `0038` / availability-off state. Current owner execution begins at
item 10 only after section 4 is rerun against one clean, pushed, frozen SHA.

1. **Preview isolation or cleanup.** Prove the project reference behind every
   overlapping branch Preview. Detach/delete only an unsafe or superseded
   branch-scoped integration, with its exact branch and data posture named.
2. **Publish the draft PR.** Push the frozen branch and open a draft PR. Require
   protected CI, CodeQL, the native guest export, iOS simulator build, browser
   smoke, database policies, dependency risk, and an isolated Preview. Do not
   merge while any required or release-relevant check is missing or failing.
3. **Rehearse without Production data.** Use a distinct durable staging project
   when available. If the owner elects to proceed without it, record exactly
   `NOT RUN — OWNER-ACCEPTED NO-STAGING RISK`, the reason, affected gates, and
   UTC acceptance. Local Supabase and a branch created from the Production
   project do not prove a clean-room staging restore.
4. **Stage the web candidate against schema `0036`.** Prevent `main` from
   auto-moving Production domains, then create an unpromoted
   Production-environment deployment from the exact frozen SHA. Verify its
   identity, known-good rollback, billing, headers, PWA, privacy, and that the
   new deletion path fails closed before `0038`. Do not mutate Production data
   or claim the deletion gate yet. A Preview artifact must never be promoted as
   Production.
5. **Apply standalone web migration `0038`.** Re-run its guarded dry run,
   confirm exact Production history through `0036`, a completed physical backup
   under 30 hours, the pinned one-packet proposal, and continued absence of
   native `0037`. Obtain approval for this database-first change; the known-good
   `ed28b0b` web rollback remains compatible. Never substitute normal Production
   `db push`, `--include-all`, migration repair, reset, or history editing.
6. **Re-verify the exact web candidate.** Keep customer domains on the
   known-good artifact while the unpromoted candidate proves the exact `0038`
   contract, two-owner isolation, concurrent upload/deletion, zero-residue
   deletion, billing posture, headers, PWA, privacy, logs, and rollback
   compatibility.
7. **Merge and verify the new main artifact.** Merge only after the protected PR
   checks, exact-artifact web deletion regression, rollback rehearsal, and named
   approvals pass. Wait for an unpromoted Production-environment deployment from
   the new exact `main` SHA, repeat its critical checks, and only then rebind
   customer domains to that artifact; never promote the branch deployment.
8. **Apply migration `0037`.** Re-run the read-only guarded dry run, confirm the
   exact one-packet proposal and a completed physical backup under 30 hours,
   then obtain the database owner and rollback authority's approval. Apply only
   with the script's pinned confirmation string. Never use normal Production
   `db push`, `--include-all`, migration repair, reset, or history editing.
9. **Verify the flag remains off.** Re-run the guarded dry run, migration list,
   after-check, RLS/grant report, anonymous denials, web account smoke, and
   native-header denials. The availability RPC must report the fixed contract
   with `available:false`.
10. **Create the internal TestFlight build.** Confirm custom SMTP, exact provider
   and callback settings, the code-only template, resend limits, and in-app
   deletion before creating any tester account. Distribute only the exact
   scanned replacement build to the approved internal cohort.
11. **Open a staffed native test window.** Enable only the native availability
   flag. Do not alter legacy keys or unrelated Production flags. Disable it at
   the end of the window and verify installed clients stop auth, refresh, pull,
   and writes while retaining the local journey.
12. **Prepare and submit the replacement.** Update App Store privacy answers,
    review notes, reviewer access, deletion/retention disclosures, age rating,
    content rights, export compliance, contact details, and agreements to match
    the exact binary. Use manual release. Submission and public release are two
    separate approvals.

The web candidate has no missing-latch compatibility bridge. An account cleanup
must prove the exact fixed `account_deletion_storage_contract`, install the
durable owner latch, sweep Storage, and call `delete_own_account` from that same
captured-owner server request so its 204 proves the folder is still empty and
the profile/Auth purge committed. Any missing or malformed contract fails
closed before the sweep. A lost response is resolved with the retained captured
credential: `user_not_found` proves the committed deletion, while a still-live
pending owner retries the idempotent route. Standalone `0038` installs that
boundary without native availability; later `0037` reasserts the compatible
boundary and keeps its own default-off gate. Session restoration must also
require the exact authenticated `own_account_deletion_status` response;
`pending:true` keeps the account hidden and resumes the idempotent deletion
flow, while transport or shape errors remain retry-only and never authorize or
purge local data.

## 6. Production-backed device matrix

Use two disposable accounts with synthetic content and two physical iPhones
with meaningfully different supported iOS/screen combinations. Simulator
coverage may supplement layout checks only.

- [ ] Disabled availability on fresh launch keeps guest Scripture and journey
      usable with no auth, session refresh, pull, or write.
- [ ] New and returning numeric-code sign-in works with the exact code-only
      template; no social OAuth control appears.
- [ ] One owner restores on two devices without losing device-only reminders,
      drafts, game state, or Rhythm state.
- [ ] A-to-B and B-to-A reads and writes are denied for every owned relation,
      including guided movements, avatars, and account deletion boundaries.
- [ ] Explicit guest adoption never silently overwrites either local or remote
      state.
- [ ] Offline create/edit/delete, stale revision, duplicate retry, completion
      preservation, and reconnect converge without loss or resurrection.
- [ ] Sign-out, failed sign-out, account switching, force quit, token refresh,
      reinstall, and account deletion preserve the exact verified owner
      boundary.
- [x] Remote disable while installed and while a request is in flight prevents
      stale responses from committing and retains the local journey.
      **PASS — 2026-08-15.** Window `16:29:42Z`–`18:11:32Z` on the Production
      flag, with an account build installed on a physical iPhone and signed in.
      After the disable the availability RPC returned
      `{"contract":"biblequest_native_account_beta_v1","available":false}`, and
      in the following window that device issued only availability probes — no
      `/auth/v1/*` call, no sync read, no write. The owner confirmed prayers and
      journey remained usable on the device throughout. Note the deletion path
      stays reachable while disabled by design, which is what keeps
      5.1.1(v) satisfiable during a kill switch.
- [ ] Build 13 remains usable before, during, and after `0037` and the staffed
      test window.
- [ ] Disposable users and fixtures are deleted; sanitized zero-residual counts
      are recorded.

If a second physical iPhone is unavailable, record `SECOND PHYSICAL IPHONE —
NOT RUN` and obtain explicit owner acceptance before App Review. Never relabel
the narrower matrix as `PASS`.

Any cross-account observation or mutation, resurrection, private logging,
unbounded retry, deletion failure, loss of local data, or unavailable remote
disable is a hard stop.

## 7. Rollback and disable order

1. Stop the test/release window and freeze unrelated changes.
2. Disable native account availability first. Confirm installed account builds
   stop new OTP, refresh, pull, and write activity while preserving local data.
3. For a web-only regression, promote only the verified compatible rollback
   deployment. Do not point old code at an incompatible schema.
4. `0038` and later `0037` are forward-only. Do not edit/delete either history
   row or restore Production merely to remove one. Correct a defect with a
   reviewed higher migration unless actual data corruption requires the
   separately approved backup procedure.
5. A binary defect is handled by stopping manual release, rejecting the build,
   or removing it from sale under the approved incident plan. A processed App
   Store binary is never overwritten; use a new forward build.

## 8. Final release and watch

After App Review approval, enable availability only for a final smoke, manually
release during a staffed window, and record T+0/T+5/T+15/T+30/T+60 health,
auth/sync, privacy, deletion, old-client, and support summaries. Evidence must
remain aggregate and identifier-free.

The replacement is stable only when the exact live build and release SHA match
the record, every required owner signs, build 13 remains functional, the
availability disable control has been rehearsed, and the final watch closes
without an unresolved incident.

## 9. Required residual-risk statement

Include this text verbatim in the final release record:

> The legacy `service_role` credential remains valid despite being treated as
> compromised. All known BibleQuest workloads have migrated away from it, but
> unauthorized use cannot be ruled out until legacy-key retirement is approved
> and completed in a separate task.

Do not schedule or silently begin legacy-key retirement from this runbook.
