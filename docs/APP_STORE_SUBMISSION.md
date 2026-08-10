# BibleQuest 1.0 — App Store submission package

This is the ready-to-paste draft for the guest-only iPhone release. Re-check it
against the final TestFlight build and the tester-feedback PDF before submission.

## Product page copy

| Field | Draft |
| --- | --- |
| Name | BibleQuest |
| Subtitle | Scripture, Prayer & Practice |
| Primary category | Lifestyle |
| Secondary category | Reference |
| Price | Free |
| Privacy Policy URL | `https://www.biblequest.co/privacy` |
| Support URL | `https://www.biblequest.co/contact` |
| Marketing URL | `https://www.biblequest.co` |
| Copyright | 2026 Winterhill Media LLC |

**Promotional text**

Read Scripture, pray honestly, reflect gently, and take one meaningful step
into everyday life.

**Keywords**

```text
bible,scripture,prayer,devotional,faith,journal,reflection,christian,verse,spiritual
```

**Description**

```text
Bring faith into the life you live.

BibleQuest is a calm Christian companion for Scripture, prayer, reflection, and practical acts of faith. Open it for a few honest minutes, then carry one meaningful step into your day.

READ SCRIPTURE
Explore the Bible, discover passages by topic, bookmark verses, and keep reading even when you are offline with the bundled World English Bible.

PRAY AND REFLECT
Write private prayers and journal reflections in a quiet space designed for honesty, not performance. BibleQuest stores your writing locally and does not send it to BibleQuest servers in this release. iOS may include app data in device backups.

PUT FAITH INTO PRACTICE
Choose small, realistic quests built around kindness, service, gratitude, forgiveness, and spiritual rhythm.

BUILD A GENTLE RHYTHM
Follow your Journey, revisit meaningful moments, and play Scripture-centered games without guilt, rankings, or pressure.

BibleQuest does not replace church, clergy, community, counseling, or emergency help. It is a daily companion for Christians from every tradition and for people exploring faith.

The core experience is free. Version 1.0 requires no account and contains no in-app purchase flow.
```

## Screenshot story

Capture portrait screenshots from the final 6.9-inch iPhone simulator or
physical device after tester fixes land. Keep private writing synthetic.

1. Home — daily verse and one clear next step
2. Bible — books plus “Find Scripture by topic” discovery
3. Reader — a calm chapter view with bookmark/share controls
4. Journal — private reflection with formatting tools
5. Quests — practical ways to live faith today
6. Seven Days Match — Scripture-centered play
7. Journey — progress without guilt or a leaderboard

Use the exact pixel dimensions currently accepted by App Store Connect. Do not
add an iPad set while the Xcode target remains iPhone-only.

## App Review information

**Suggested notes**

```text
BibleQuest 1.0 is a local-first, guest-only Christian companion. No login is required or offered in this build. Account sync, remote push, profile-photo selection, native purchases, external purchase links, and Plus acquisition UI are disabled. Readers may explicitly enable neutral, on-device reminders in Settings; no account or notification server is involved.

The app bundles its core experience and the World English Bible for offline use. Optional reviewed online Bible editions are requested from https://www.biblequest.co. To verify that path: finish onboarding, open Home → profile icon → Bible translation, then use the translation search.

BibleQuest stores personal prayers, reflections, notes, and Journey activity locally and does not send them to BibleQuest servers. iOS may include app data in device backups. Settings provides export and clear controls. About, Terms, and Privacy Policy open the public BibleQuest website; Support opens an email to the support team.

Suggested review path: complete onboarding → open today’s verse → Bible → Find Scripture by topic → write a reflection → choose a quest → open Seven Days Match → Settings → Privacy & data.

There are no purchases or paid unlocks in this iOS build.
```

Set **Sign-in required** to No. Provide current review contact name, email, and
phone number. No demo account is needed for this build.

Before pasting the copyright or submitting legal metadata, confirm whether
“Winterhill Studio” is an authorized trade name/DBA of Winterhill Media LLC.
The public Privacy Policy and Terms currently use the Studio name while the
Apple developer team uses the LLC name. Align the public legal identity if that
relationship is not already documented.

## Privacy-answer worksheet

Do not copy the iOS privacy manifest into App Store Connect blindly. Confirm the
final binary and provider retention first.

| Release behavior | Verified repo posture | Human confirmation needed |
| --- | --- | --- |
| Account identifiers | Account/Supabase public configuration is stripped from the release bundle. | Confirm no account-enabled build was substituted. |
| User content | BibleQuest stores prayers, reflections, notes, progress, and settings locally and does not send them to BibleQuest servers. iOS may include app data in device backups. | Confirm the App Store answer matches the final binary and this disclosure. |
| Analytics | Release build pins analytics and Plausible configuration off. | Confirm no separate native analytics/crash SDK was added in Xcode. |
| Purchases | Native commerce routes and acquisition UI are absent. | Confirm no StoreKit product is attached to version 1.0. |
| Diagnostics/network data | Guest Bible requests use the production API. | Confirm Vercel/provider logging and retention before answering whether diagnostics, device ID, coarse location, or other usage data is collected. |
| Tracking | Privacy manifest declares tracking false and no tracking domains. | Confirm no advertising or cross-company tracking occurs. |

## Age rating and content-rights facts

- No user-generated public feed, chat, gambling, simulated gambling, advertising,
  unrestricted web browser, or location sharing exists in the release.
- The app contains Christian Scripture and devotional material, which can
  reference violence, death, sexuality, alcohol, or other mature themes in a
  religious-text context. Answer Apple's questionnaire literally rather than
  assuming those references are exempt.
- The bundled World English Bible is identified as public domain. Confirm the
  shipping rights/attribution for every bundled asset and every online edition
  shown in the final translation catalog before accepting the content-rights
  declaration.

## Submission gate

- Tester PDF triaged; every P0/P1 issue fixed or explicitly accepted
- Production native CORS header verified on preflight and actual response
- Internal TestFlight matrix passed on a physical iPhone
- Final screenshots uploaded
- Privacy, age rating, content rights, export compliance, category, availability,
  and review contact completed
- Version 1.0 build selected; manual release chosen
