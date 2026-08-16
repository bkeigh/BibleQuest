# Building the account replacement in Xcode Cloud

Every Xcode Cloud build BibleQuest has ever produced is the **guest** profile,
including the TestFlight builds numbered 13 and 19. `ci_post_clone.sh` ended at
`pnpm ios:release:prepare`, which blanks the Supabase configuration and turns
both account latches off. A guest build behaving well says nothing about
accounts, and a build number says nothing about the source: Xcode Cloud stamps
`CFBundleVersion` from `CI_BUILD_NUMBER`, which is why TestFlight numbers never
match `CURRENT_PROJECT_VERSION` in the committed project.

This document covers the one workflow that can produce an account-enabled
binary, and the App Store Connect steps only the account holder can perform.

## The containment rule this preserves

[`IOS_ACCOUNT_REPLACEMENT_RELEASE.md`](IOS_ACCOUNT_REPLACEMENT_RELEASE.md) §4
requires that Xcode Cloud's default workflow stay guest-only and that a merge to
`main` alone must never silently upload an account-enabled binary.

`ci_post_clone.sh` now enforces that in the script rather than in a person's
memory:

- Guest is the **default**. Any workflow whose name is not matched builds guest
  and exits.
- The account path is reachable only from a workflow named exactly
  **`BibleQuest Account Release`**.
- That path additionally **fails closed** when the reviewed publishable key is
  absent, rather than building something unpinned.

`tests/ios-release-config.test.ts` pins all three, including that the guest
branch terminates — without its `exit 0` an unnamed workflow would fall through
and build accounts anyway.

## What you set up in App Store Connect

1. Open the BibleQuest app → **Xcode Cloud** → **Manage Workflows**.
2. Create a new workflow named exactly:

   ```
   BibleQuest Account Release
   ```

   The name is the gate. A typo silently produces a guest build, which is the
   safe direction but will look like the account code vanished.
3. **Start Conditions** — use a manual start, or a branch condition on the
   release branch. Do **not** attach it to `main` on every push; that is the
   thing §4 forbids.
4. **Environment** → add a variable:

   | Name | Value | Secret |
   | --- | --- | --- |
   | `BIBLEQUEST_IOS_ACCOUNT_RELEASE_PUBLISHABLE_KEY` | the modern Supabase **publishable** key | yes |

   Mark it secret. It is a publishable key rather than a secret credential, but
   marking it secret keeps it out of build logs, and the script never echoes it.

   The build verifies this key's SHA-256 against the fingerprint in
   [`config/ios-account-release.json`](../config/ios-account-release.json) and
   refuses any key that does not match, so a wrong or stale key fails the build
   instead of shipping.
5. **Actions** → Archive, with the **iOS App Store** deployment preparation.
6. **Post-Actions** → TestFlight internal testers only, for the first build.

## Before distributing the first account build

Both belong to the release owner and neither is checked by CI:

- Confirm custom SMTP, the exact provider and callback settings, the code-only
  email template, and resend limits (§5 item 10).
- Confirm the App Store privacy answers describe the **account** build. The
  current answers describe the guest app and are wrong for this binary.

## Verifying you got the right binary

An account build contains the Production Supabase origin; a guest build contains
no Supabase target at all. After the archive exists:

```bash
grep -rl "iacnjqnssovaaojswjoh" "<App.app>/public" | head -3
```

Output means account. Silence means guest, whatever the workflow was called.

Also confirm the privacy manifest is the account one — the build asserts this,
but it is worth seeing:

```bash
cmp "<App.app>/PrivacyInfo.xcprivacy" ios/compliance/PrivacyInfo.account-sync.xcprivacy
```

## What still cannot be produced this way

A local development build (`xcodebuild -destination generic/platform=iOS`) is
enough to test behaviour on an attached device, and that is how the 2026-08-15
defects were found. It does **not** prove signing, TestFlight delivery,
reinstall, or the App Store distribution path. Those need this workflow.

## This workflow is the only path, not the preferred one

Checked on 2026-08-15: the development Mac holds **no distribution
certificate**. `security find-identity -v -p codesigning` returns a single
"Apple Development" identity and zero "Apple Distribution" ones.

So a distribution-signed archive cannot be produced locally at all, however the
project is configured. Xcode Cloud signs in Apple's own infrastructure, which
makes it the only route to TestFlight or App Review unless a distribution
certificate and provisioning profile are installed here first.

That is worth knowing before anyone spends an afternoon trying to archive
locally: the failure will look like a signing configuration problem and is
actually a missing credential.
