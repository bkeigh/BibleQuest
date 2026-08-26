# App Store privacy answers — account build

The published privacy answers describe the **guest** app. The account build
collects different things, and the answers must match the exact binary being
submitted. This is a draft to check against that binary, not a substitute for
the owner's review.

Everything under "Established" was read out of the source, the privacy
manifest, or Production. Everything under "Open" genuinely is not settled, and
guessing at it is how an app gets rejected or, worse, ships a false statement.

## Established — declare these

The account privacy manifest
([`ios/compliance/PrivacyInfo.account-sync.xcprivacy`](../ios/compliance/PrivacyInfo.account-sync.xcprivacy))
declares seven types. Every one is **linked to the user**, none is used for
**tracking**, and all are for **App Functionality**. The App Store answers must
agree item for item.

| App Store data type | Why the app collects it | Linked | Tracking |
| --- | --- | --- | --- |
| Name | Profile display name | Yes | No |
| Email Address | Account identity and the sign-in code | Yes | No |
| Photos or Videos | Optional profile photo | Yes | No |
| Sensitive Info | Religious or philosophical writing — prayers and reflections | Yes | No |
| Other User Content | Bookmarks, Journey, reading, quest and settings content | Yes | No |
| User ID | The Supabase account identifier | Yes | No |
| Product Interaction | Quest and reading progress that drives the journey | Yes | No |

Two things worth stating plainly in the review notes, because both are unusual
and both are true:

- **Journal text is excluded from analytics and is never sent to any AI.** The
  app says this to the person; the submission should say it to Apple.
- **Tracking is `false` across the board**, and `NSPrivacyTrackingDomains` is
  empty.

The release profile pins analytics, payments configuration, native commerce,
and remote push off. Current source closes the Arcade defect found on
2026-08-20: signed-in native regression coverage proves that status, checkout,
and consume make no request, Plus projections fail closed, and the native
export prunes the store routes. The generated account bundle may still contain
dormant web-commerce literals, so source coverage is not a signed-artifact
pass. Inspect the frozen `.app` and exercise the exact TestFlight binary before
claiming “no native commerce.” Brendan must also re-confirm the current
Production analytics posture before submission.

The manifest additionally declares the `FileTimestamp` API under reason
`C617.1`, for the durable local journey mirror inside the app's own container.

## The unresolved gap between the manifest and observed data flow

The manifest declares neither **Device ID** nor **Diagnostics**. The checked-in
source can prove the rate-limit flow below, but it cannot prove what Vercel or
the Scripture provider logs or how long they retain it. Those questions must be
resolved before submission.

The app reads Scripture through `/api/bible/*`, which is rate limited. The
limiter stores a SHA-256 keyed on `network:<first x-forwarded-for address>` in
`public.provider_rate_limit_windows`. So a value **derived from the visitor's
network address** is retained server-side whenever the app reads Scripture,
including from iOS.

Measured in Production on 2026-08-15: **34 rows, oldest `2026-08-03`, newest
`2026-08-14`.**

Retention is **opportunistic, not scheduled**. The claim function prunes
expired windows for a bucket when that bucket is next claimed, so a bucket that
stops being used is never cleaned up. Twelve-day-old rows were present.

Three defensible readings, and this is the owner's call with legal input:

1. **Not disclosable.** It is a one-way hash of a network address, used only to
   protect the service, never linked to an account and never used for tracking.
2. **Disclose as Identifiers → Device ID**, purpose App Functionality, linked
   No, tracking No — the conservative paperwork choice.
3. **Fix the cause instead.** Give the table a scheduled purge and a stated
   retention period, which makes the disclosure question smaller and is worth
   doing regardless.

Option 3 is the one that improves the product rather than only the paperwork.
It is a migration, so it belongs to a reviewed release rather than being done
casually.

## Open — the owner must resolve these before publishing

None of these provider facts is answerable from the checked-in codebase:

- **Retention for the rate-limit records.** Currently unbounded in practice, as
  measured above. Either set one or disclose the collection.
- **The Vercel request log plan** — which fields, and retained how long.
- **HelloAO's written answer** on logging and retention. Without it, the
  Scripture provider's behaviour is an assumption.

## Before publishing

Check each answer against the binary you are actually submitting, not against
this document. The account manifest and the App Store answers have to tell the
same story, and neither may say "no data collected" — that was true of the
guest build and is false for this one.
