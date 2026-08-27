# App Store privacy answers — account build

The published privacy answers describe the **guest** app. The account build
collects different things, and the answers must match the exact binary being
submitted. This is a draft to check against that binary, not a substitute for
the owner's review.

Everything under "Established" was read out of source, the privacy manifest,
the active Vercel project, or Production. The remaining gates require the
reviewed migration and exact signed artifact; they must not be guessed through.

## Established — declare these

The account privacy manifest
([`ios/compliance/PrivacyInfo.account-sync.xcprivacy`](../ios/compliance/PrivacyInfo.account-sync.xcprivacy))
declares nine types. Every one is conservatively marked **linked to the user**,
none is used for
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
| Device ID | Conservative classification of the opaque HMAC bucket derived from a network address for abuse prevention | Yes | No |
| Product Interaction | Quest and reading progress that drives the journey | Yes | No |
| Other Diagnostic Data | Bounded Vercel request/runtime diagnostics used for reliability and abuse response | Yes | No |

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

## Network and provider evidence

The manifest now declares **Device ID** and **Other Diagnostic Data** instead of
depending on the least-disclosive interpretation of Apple's IP-address rules.
This deliberately matches the conservative App Store worksheet.

The app reads Scripture through `/api/bible/*`, which is rate limited. The
limiter stores an HMAC-SHA-256 bucket keyed on
`network:<first x-forwarded-for address>` in
`public.provider_rate_limit_windows`. Raw network addresses do not enter that
table or application logs. Authenticated routes bucket by an opaque account ID
instead.

Measured in Production on 2026-08-15: **34 rows, oldest `2026-08-03`, newest
`2026-08-14`.**

Migration `0039_bound_provider_rate_limit_retention.sql` fixes the measured
retention defect: an hourly Supabase Cron job deletes buckets dormant for more
than 48 hours, so deletion occurs no later than the next hourly run; each claim
also performs the same cleanup. An `updated_at` index bounds the work, and the
v3 database contract plus pgTAP/Production postflight prove the schedule and
behavior. The migration also removes already-stale rows when applied.
**Production must pass the guarded 0039 apply and postflight before account
availability or App Privacy publication.**

The active Vercel team was read through the authenticated Vercel API on
2026-08-26 and reported the **Hobby** plan and **zero configured Log Drains**.
Vercel's current
[Runtime Logs documentation](https://vercel.com/docs/logs/runtime) states that
Hobby runtime logs are retained for **one hour**. It documents request path,
method, status, host, user agent, search parameters, region, request/session/
trace IDs, function details, outgoing requests, and an IP-address plus user-
agent match used by its "logs from your browser" filter. BibleQuest's bounded
application log messages do not include private writing, contact data, tokens,
raw network addresses, provider responses, or arbitrary error text.

The Vercel project setting reports Web Analytics enabled, but the repository
has no Vercel Analytics package or collector, the inspected live HTML contains
no Vercel Insights script, and the exact native-payload verifier rejects
unexpected analytics hosts. Recheck the signed archive rather than treating
the project setting alone as proof of collection or non-collection.

HelloAO is called only by BibleQuest's server adapter. The adapter sends the
allowlisted edition ID, book ID, chapter number, and an `Accept` header; it does
not forward the app request's network address, user agent, cookies,
authorization, account ID, name, or private content. An uncached upstream
request can therefore reveal the requested Scripture coordinates and Vercel
egress, but not a BibleQuest user identity. Because HelloAO does not publish a
logging/retention commitment, the worksheet retains **Product Interaction** as
linked/app-functionality rather than relying on that provider to discard it.

Apple's current [App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)
say stored IP addresses must be classified according to use and that data kept
only long enough to service a request is not collected. The nine-type worksheet
is intentionally more conservative than that minimum.

## Remaining release gates

- Apply and postflight 0039 through the guarded Production migration lane after
  a fresh physical backup. Until then, the old unbounded rows remain a hard
  stop for account availability.
- Inspect the signed Build 41 and its generated privacy report for any data type
  or SDK absent from this worksheet.
- Publish the nine matching App Store answers only after the final manifest,
  server flow, and signed artifact are approved together.

## Before publishing

Check each answer against the binary you are actually submitting, not against
this document. The account manifest and the App Store answers have to tell the
same story, and neither may say "no data collected" — that was true of the
guest build and is false for this one.
