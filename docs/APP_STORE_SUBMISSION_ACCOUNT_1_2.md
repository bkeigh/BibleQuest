# BibleQuest 1.2 account release — App Store submission packet

Status: **DRAFT COMPLETE — HOLD FOR SIGNED BUILD 41 AND OWNER GATES**
Prepared: **2026-08-26**
Target: iPhone, United States only, Free, manual release

This packet replaces the guest-only claims in `docs/APP_STORE_SUBMISSION.md`
for the account-enabled Version 1.2 candidate. Do not paste the old statement
that BibleQuest sends no user data to its servers. Do not submit, change
availability, or publish privacy answers solely because this draft exists.

## Product page fields

| App Store field | Ready-to-paste draft | Gate |
| --- | --- | --- |
| Name | BibleQuest | Owner confirm |
| Subtitle | Scripture, Prayer & Practice | Owner confirm |
| Primary category | Lifestyle | Owner confirm |
| Secondary category | Reference | Owner confirm |
| Price | Free | Owner confirm |
| Availability | United States only; do not auto-add future territories | Owner action |
| Privacy Policy URL | `https://www.biblequest.co/privacy` | Verify live page and legal entity |
| Support URL | `https://www.biblequest.co/contact` | Verify staffed inbox/contact |
| Marketing URL | `https://www.biblequest.co` | Verify live page |
| Copyright | `2026 Winterhill Media LLC` | HOLD until Studio/LLC and exclusive-rights evidence are accepted |
| Release option | Manually release this version | Owner action |

**Promotional text**

```text
Read Scripture, pray honestly, reflect gently, and take one meaningful step into everyday life—with an optional account to carry your journey across devices.
```

**Keywords**

```text
bible,scripture,prayer,devotional,faith,journal,reflection,christian,verse,spiritual
```

**Description**

```text
Bring faith into the life you live.

BibleQuest is a calm Christian companion for Scripture, prayer, reflection, and practical acts of faith. Open it for a few honest minutes, then carry one meaningful step into your day.

READ SCRIPTURE
Explore the Bible, discover passages by topic, bookmark verses, and keep reading offline with the bundled public-domain World English Bible. Reviewed public-domain online editions are clearly labeled with source and license information.

PRAY AND REFLECT
Write private prayers and reflections in a quiet space designed for honesty, not performance. Journal text stays out of analytics and is never sent to AI.

PUT FAITH INTO PRACTICE
Choose small, realistic quests built around kindness, service, gratitude, forgiveness, and spiritual rhythm.

BUILD A GENTLE RHYTHM
Follow your Journey, revisit meaningful moments, and play Scripture-centered games without guilt, rankings, or pressure. Nothing withers while you are away.

USE IT YOUR WAY
Begin without an account, or create a free account with an emailed numeric code to carry supported progress, prayers, reflections, bookmarks, and settings across your devices. Account sync is protected by BibleQuest access controls but is not end-to-end encrypted. Settings includes export, clear-data, sign-out, and account-deletion controls.

BibleQuest does not replace church, clergy, community, counseling, medical care, or emergency help. It is a daily companion for Christians from every tradition and for people exploring faith.

The core experience is free. Version 1.2 contains no native purchase flow or paid spiritual unlock.
```

## What's New

```text
A calmer first day and a clearer welcome back. Version 1.2 refreshes Today, account entry, Settings, and navigation artwork, with small readability, accessibility, and touch-target improvements throughout.
```

This text must be rechecked after the physical first-five-minute study. Remove
any claim the signed build or participant evidence does not support.

## App Review information

Set **Sign-in required** to **No** because the full daily loop is available
without an account. The optional account path still must be reviewable.

**Suggested reviewer notes**

```text
BibleQuest 1.2 is a local-first Christian companion with an optional account. No sign-in is required to complete onboarding, read Scripture, write a device-local prayer or reflection, choose and complete a quest, or view Journey progress.

Optional accounts use an emailed numeric code entered inside the iPhone app. This iOS build offers no Apple or Google social sign-in. Reviewers may choose Create account or Sign in, enter an email address they control, receive the code, and enter it in the app. No shared demo credential or portable sign-in link is required.

Supported journey data can sync to the user's protected BibleQuest account. Account sync is not end-to-end encrypted. Journal text is excluded from analytics and is never sent to AI. Settings includes export, Clear My Data, sign-out, and Delete account controls.

The app bundles the public-domain World English Bible for offline reading. Optional reviewed public-domain online editions are requested through https://www.biblequest.co and display their source/license information. API.Bible copyrighted editions are not connected in this release.

Native commerce, Plus acquisition, analytics, APNs, and remote push are disabled. There are no purchases, external purchase links, paid unlocks, or advertising in this iOS build. Local notification reminders are optional and scheduled on the device after the user acts in Settings.

Suggested guest review path: complete onboarding → Today → open today's Scripture → choose and complete a quest → Prayer → write a synthetic entry → Journey → Settings → Privacy & data.

Suggested account review path: Settings → Account → Create account or Sign in → receive and enter the emailed numeric code → close and reopen the app → confirm the signed-in journey restores → Settings → Account → Delete account.

About, Terms, Privacy Policy, support, Scripture source/license links, and third-party font notices are available from Settings. BibleQuest is not an emergency, counseling, medical, or pastoral service.
```

### Reviewer-access operating plan — OPEN

The database availability flag defaults off. Apple reviews on an unpredictable
schedule, so a short staffed beta window does not by itself make the optional
account path reviewable. Before submission, the founder and database/monitoring
owners must approve one bounded plan:

1. Keep account availability enabled from submission until review completes,
   with sanitized monitoring, rollback authority, and the old-client posture
   staffed; then disable it if launch remains manual; or
2. provide a separately reviewed App Review allowlist that does not publish a
   credential, weaken RLS, or permit unmonitored general enrollment.

Do not put an email code, token, account identifier, private content, Supabase
URL/key, or shared account password in reviewer notes.

## App Privacy worksheet

The exact signed binary must use
`ios/compliance/PrivacyInfo.account-sync.xcprivacy`. App Store Connect must not
retain the guest-build answer **No data collected**.

Declare these seven types as **linked to the user**, **not used for tracking**,
purpose **App Functionality**:

| Data type | Release purpose |
| --- | --- |
| Name | Optional profile display name |
| Email Address | Account identity and numeric-code delivery |
| Photos or Videos | Optional profile photo |
| Sensitive Info | Religious or philosophical writing, including prayers and reflections |
| Other User Content | Bookmarks, Journey, reading, quest, and settings content |
| User ID | Supabase account identifier |
| Product Interaction | Quest and reading progress that drives the user's Journey |

Tracking remains **No** and `NSPrivacyTrackingDomains` remains empty.

### Privacy decisions that block publication

- Decide how to disclose the server-side SHA-256 derived from the request's
  network address and its opportunistic/unbounded rate-limit retention. The
  conservative draft is Identifiers → Device ID, App Functionality, linked
  Yes, tracking No, but the owner/legal reviewer must choose and make the
  privacy manifest agree.
- Confirm Vercel request-log fields and retention for the active plan.
- Obtain HelloAO's written logging/retention answer or disclose conservatively.
- Inspect the signed Build 41 for unexpected diagnostic, analytics, advertising,
  commerce, push, or third-party SDK behavior.
- Publish App Privacy only after the signed artifact, manifest, server flow,
  and App Store answers tell one accepted story.

See `docs/APP_STORE_PRIVACY_ACCOUNT_BUILD.md` for the full evidence and options.

## Age rating worksheet

Answer the current Apple questionnaire literally:

- Parental controls, age assurance, unrestricted web access, public
  user-generated content, chat/messaging, social media, advertising: **No**.
- Mature themes: **Infrequent**.
- Horror or fear themes: **Infrequent**.
- Alcohol, tobacco, or drugs: **Infrequent**.
- Medical or treatment information: **None**.
- Health or wellness topics: **Yes**.
- Sexual content or nudity: **None**.
- Cartoon or fantasy violence: **None**.
- Realistic violence: **Infrequent**.
- Prolonged or graphic violence: **None**.
- Guns or other weapons: **Infrequent**.
- Contests, gambling, simulated gambling, loot boxes, and chance activities:
  **None/No**.
- Age category/override: **Not Applicable**.
- Made for Kids: **No**.

Expected result: **13+**. Save and record Apple's actual calculated result;
this worksheet is not a substitute for the live questionnaire.

## Content rights and legal identity

- Answer that BibleQuest **does contain third-party content**.
- Use `docs/IOS_CONTENT_RIGHTS_INVENTORY.md`; it currently says **NO-GO**
  because core art lacks per-file creator/assignment/tool evidence.
- Launch only in the United States. KJV UK Crown rights remain outside scope;
  mainland China and EU availability remain outside scope.
- Confirm whether Winterhill Studio is an authorized trade name. If yes, use
  `Winterhill Media LLC d/b/a Winterhill Studio` consistently and retain the
  registration evidence. If not, change public legal copy to Winterhill Media
  LLC.
- Confirm whether Winterhill Media LLC alone owns the exclusive app rights
  before using the LLC alone in Apple's copyright field.

## Export compliance and platform posture

| Field | Planned answer | Evidence/gate |
| --- | --- | --- |
| Uses non-exempt encryption | No | Xcode has `ITSAppUsesNonExemptEncryption = false`; recheck archive |
| App supports iPad | No | iPhone-only target and screenshot set; recheck archive |
| Advertising identifier/tracking | No | Privacy manifest and binary inspection |
| In-app purchases | None in Version 1.2 | Native commerce pin, pruned routes, signed-artifact test |
| Remote push | No | APNs/remote-push configuration absent; local reminders only |
| Account deletion | Available in app | Must pass exact Build 41 physical-device test |

## Exact-binary screenshot packet

The five existing 1290 × 2796 opaque PNGs are **not reusable**: they show the
Version 1.0 guest UI, use “Home” instead of “Today,” and include a device-only
journal claim that is incomplete for an account build.

Capture from the signed Build 41 after the comprehension/accessibility window,
using only synthetic content and the final App Store appearance:

| Order | Screen and benefit | Required privacy/content check |
| ---: | --- | --- |
| 1 | Today — one calm, clear first activity | Synthetic display name/progress only |
| 2 | Quests — one practical step | No AI-generation or paid-feature claim |
| 3 | Scripture — clearly labeled offline WEB | Public Scripture only; correct edition label |
| 4 | Prayer/reflection — private writing | Clearly synthetic text; accurate account-sync wording |
| 5 | Journey — encouraging progress | Synthetic milestones; nothing decays/withers claim verified |
| 6, optional | Create account vs Sign in | No email, code, ID, or provider console |
| 7, optional | Settings privacy/data controls | Export, clear, deletion labels; no private content |

Required final checks for every upload file:

- Apple's currently accepted iPhone 6.9-inch dimensions;
- portrait orientation, no alpha, no device frame unless approved;
- exact signed-binary UI and feature availability;
- no private data, misleading subscription/AI claim, obsolete copy, or
  unlicensed asset;
- approved order and locale; and
- filename, pixel dimensions, SHA-256, source build, device/simulator, capture
  UTC, and named approver recorded in the release evidence.

Do not upload Generate-a-quest or MyShepherd posters for this release.

## Build and submission gate

- [ ] Reviewed changes are pushed through a PR, protected CI passes, and the
      approved branch is merged to a clean `main`.
- [ ] Full 40-character immutable `main` SHA is recorded.
- [ ] Only the `BibleQuest Account Release` Xcode Cloud workflow runs from that
      SHA and produces Build 41.
- [ ] Signed `.app` proves Version 1.2, Build 41, bundle ID
      `co.biblequest.app`, exact Production host/public-key fingerprint,
      account privacy manifest, content/media inventory, third-party notices,
      and absence of staging/preview, privileged keys, analytics, remote push,
      and native commerce.
- [ ] Xcode Cloud and the downloaded artifact both pass
      `scripts/verify-ios-release-app.mjs` for the frozen `main` SHA without
      `--allow-unsigned`; record its tree SHA-256 and the separate archive/IPA
      file SHA-256.
- [ ] Exact Build 41 passes the two-account/two-iPhone beta, offline/conflict,
      returning-session, deletion, old-client, first-five-minute,
      VoiceOver/Dynamic Type/contrast/reduced-motion, and device-size matrices.
- [ ] Exact screenshots are captured and approved.
- [ ] Privacy/provider retention, rights, legal identity, support contact,
      category, age rating, export compliance, availability, agreements, tax/
      banking posture, reviewer access, and manual release are all signed.
- [ ] Founder separately authorizes build selection, Add for Review, and Submit
      to App Review.

App Review approval is not public-release approval. Keep manual release, run
the final staffed smoke, obtain separate founder authorization, then run the
T+0/+5/+15/+30/+60 launch watch in the operative release runbook.

## Submission record

| Field | Value/evidence | Status |
| --- | --- | --- |
| Final `main` SHA | `[FULL SHA]` | OPEN |
| Xcode Cloud workflow/build | `[WORKFLOW URL / BUILD 41]` | OPEN |
| Signed artifact hash | `[SHA-256]` | OPEN |
| Physical-device evidence | `[RESTRICTED LINK]` | OPEN |
| Screenshot packet | `[PATH / HASH LIST]` | OPEN |
| App Privacy publication | `[UTC / OWNER / EVIDENCE]` | OPEN |
| Rights/legal approval | `[UTC / OWNER / EVIDENCE]` | OPEN |
| Review contact | `[NAME / VERIFIED CONTACT RECORD]` | OPEN |
| App Review submission | `[UTC / OWNER / SUBMISSION ID]` | OPEN |
| App Review result | `[APPROVED / REJECTED / MESSAGE]` | OPEN |
| Manual release authorization | `[UTC / OWNER]` | OPEN |
| T+60 outcome | `[STABLE / INCIDENT]` | OPEN |
