BibleQuest Codex v1.4 — Production Recovery Update

## v1.4 implementation update — July 19, 2026

This section records the repository's current launch contract and supersedes
older counts, the old "empty repository" description, legacy `BibleQuest.us`
host references, unimplemented-library scaffolding claims, and any earlier
six-stage tree or single-day quest-cap language elsewhere in this document. The
remainder of the Codex still governs brand, theology, safety, privacy, and
product tone. The production canonical host is `https://www.biblequest.co`.

### Current product inventory

- The full public-domain World English Bible remains available for chapter
  reading: 66 books and 31,103 verses.
- The daily rotation contains 180 unique, checked-in WEB passages distributed
  across all 66 books. Exact text is rebuilt from local Bible files rather than
  copied from an external model.
- The free reviewed quest catalogue contains 150 quests across all 14 launch
  categories. The 66-quest expansion intentionally adds longer study, service,
  reconciliation, justice, discernment, silence, family, and community work so
  the catalogue is not dominated by surface-level five-minute actions.
- The journey contains 20 named tree stages from Seed through Sheltering, with
  thresholds from the first meaningful action through 250 actions.
- The milestone catalogue contains 38 milestones and includes measurable
  progress for every quest category.
- The production sprite catalogue contains 63 reviewed transparent PNGs: 30
  interface/category marks, five candle states, 20 tree stages, and eight
  feature mascots. Source art is conditioned on the approved BibleQuest
  reference sheet and anchors, then reconstructed by the deterministic
  native-grid processor; unreviewed generator output never ships directly.
  The praying-hands mark must always read unmistakably as two hands joined in
  prayer.

### Quest lifecycle and Plus

- A free account has three concurrent rolling quest slots. Claiming a quest
  opens its own 24-hour window; completing it does not immediately recycle the
  slot. A new slot becomes available when that window expires.
- A quest remains addressable and clickable after selection and after
  completion. Today’s Quests shows its completion check and exact remaining or
  reset time. Expired unfinished work remains on the private quest shelf and
  can be resumed when a slot is available; progress is never silently erased.
- BibleQuest Plus has unlimited concurrent quest windows and access to Generate
  a quest. Launch generation is private and deterministic: it recommends from
  the 150 human-reviewed local quests using structured filters, sends no prayer,
  reflection, or journal text off-device, and never invents spiritual claims.
- `QuestGenerationProvider` is the provider-neutral seam for a future OpenAI,
  Anthropic, or other server adapter. No external model is enabled until
  entitlement enforcement, structured-output validation, safety review,
  privacy disclosure, observability, and a human content-review path exist.

### Launch UX contract

- The Home identity card exposes a labeled, accessible Settings action.
- Recent Verses is persistent, deduplicated, horizontally scrollable, and each
  item opens the exact verse range in its chapter.
- Verse sharing uses the native share sheet when available and otherwise offers
  a real choice of link copy, verse copy, email, and text message. Shared links
  resolve to a public verse page with canonical and social metadata.
- Scripture lead type is smaller and more compact than the earlier prototype;
  the Large Text accessibility setting remains authoritative.
- Long catalogues use disclosure, compact shelves, and progressive or sideways
  browsing where it reduces mobile scroll without hiding the daily loop.
- One-time support uses a same-origin redirect to a strictly validated Stripe
  Payment Link. If `STRIPE_DONATION_URL` is absent or invalid, the payment
  control fails closed and explains that support is unavailable.

### QuestOS and BibleQuest Console parity

- Local QuestOS persistence, import/export, sync mappings, and Supabase rows all
  carry `picked_at`, `expires_at`, and owner-only recent-verse history. A
  database trigger keeps same-passage timestamps monotonic so a stale device
  cannot overwrite the complete newer visit recorded by another device.
- Apply `0010_rolling_quest_windows_and_recent_verses.sql` and
  `0011_bible_translation_preference.sql` only through the staged migration
  procedure. Verify schema and RLS before a separate dry-run/review/application
  of the regenerated idempotent `supabase/seed.sql`. The seed mirrors 150
  quests, 180 daily passages, and 38
  milestones, updates existing reviewed rows by natural key, and preserves
  public-domain scripture snapshots. It also explicitly reactivates the
  canonical BibleQuest provider and launch content during a deliberate seed.
- A July 19 read-only production probe found both migrations' expected schema
  absent and the content mirror behind the checked-in catalogue. Follow
  `docs/ACCOUNT_SYNC_RUNBOOK.md`: rehearse on staging, confirm the exact linked
  project and backup, approve/apply the migration-only dry run, verify schema
  and RLS, then separately approve the `--dry-run --include-seed` result with no
  migrations pending. Never infer migration history from a column probe and
  never reset a hosted project.

### Deployment gates still owned by the operator

- Configure custom Supabase Auth SMTP, align its Site URL and callback with the
  canonical `www` host, and pass cross-browser email-link tests.
- Set and verify RevenueCat's live public configuration before selling Plus.
- Set the server-only `STRIPE_DONATION_URL` to the intended
  `https://buy.stripe.com/...` Payment Link before enabling donations.
- Run the complete build, unit, security-header, service-worker, responsive,
  keyboard, reduced-motion, offline, staging database, and payment smoke gates
  in `docs/LAUNCH_RUNBOOK.md`. Passing local code checks is necessary but does
  not by itself publish or migrate production.

Canonical Product, Brand, Design, Engineering, and Growth Specification

  

Prepared for: BibleQuest.us

Internal platform name: QuestOS

Status: Repository-Aware Handoff Draft GITHUB REPOSITORY UPDATE — READ BEFORE IMPLEMENTATION

  

Version: v1.2 Repo-Aware Claude Handoff

Canonical repository: https://github.com/bkeigh/BibleQuest

Repository full name: bkeigh/BibleQuest

Clone URL: https://github.com/bkeigh/BibleQuest.git

Default branch: main

Visibility: private

Current repo state at review time: empty repository / size 0

Access confirmed: Brendan has admin, maintain, push, pull, and triage permissions

Repo status: not archived

  

Implementation decision: from this point forward, BibleQuest should be treated as an actual GitHub-backed product, not just a concept document. Claude Code Fable 5 Ultracode should work inside the bkeigh/BibleQuest repository and use this Codex as the canonical product/design/engineering source of truth.

  

Repository-first rule:

  

1\. Do not create a second repo.

2\. Do not rename the project folder away from BibleQuest unless Brendan explicitly asks.

3\. Do not build a throwaway prototype outside the repo unless it is immediately migrated into the repo.

4\. The repository should become the single implementation home for BibleQuest V1.

5\. The Codex should be copied into the repo before build work begins.

  

Required first repo file:

  

docs/BIBLEQUEST\_CODEX.md

  

Recommended first commit message:

  

chore: add BibleQuest Codex v1.2

  

Recommended initial branch strategy:

  

\- main: stable production-ready branch

\- develop: optional integration branch if Claude needs multi-pass work

\- feat/mvp-foundation: first implementation branch

\- feat/questos-engine: QuestOS/domain engine work

\- feat/living-editorial-ui: design system and UI work

\- feat/supabase-schema: database/auth/RLS work

\- feat/pwa-offline: PWA manifest, service worker, and offline fallback

  

If Brendan wants the fastest solo workflow, Claude may work directly on main during the initial empty-repo scaffolding phase, then switch to feature branches once the first app compiles.

  

Repository setup expectations:

  

\- Use a clean Next.js + TypeScript + Tailwind foundation unless the repo already contains another stack.

\- Because the current repository is empty, Claude should scaffold the full application from scratch.

\- Add docs early, not after the build.

\- Add a README that explains BibleQuest clearly to humans and AI agents.

\- Add SECURITY.md because the app will store sensitive prayer/reflection data.

\- Add .env.example with placeholder keys only.

\- Add .gitignore before any environment files are created.

\- Never commit real API keys, Supabase service role keys, OpenAI/Anthropic keys, Stripe keys, Bible API keys, or private credentials.

\- Keep the public/client Supabase anon key separate from server-only secrets.

\- Treat Supabase service role key as server/admin-only.

  

Required starter repo structure:

  

/

  README.md

  SECURITY.md

  .env.example

  .gitignore

  package.json

  next.config.ts

  tsconfig.json

  tailwind.config.ts

  postcss.config.js

  docs/

    BIBLEQUEST\_CODEX.md

    ARCHITECTURE.md

    DESIGN\_SYSTEM.md

    CONTENT\_GUARDRAILS.md

    DEPLOYMENT.md

  public/

    manifest.webmanifest

    icons/

    images/

  src/

    app/

    components/

      biblequest/

      layout/

      quest/

      journal/

      growth/

      reader/

      marketing/

    lib/

      questos/

      supabase/

      content/

      analytics/

      safety/

      utils/

    data/

      seed/

    styles/

  supabase/

    migrations/

    seed.sql

  

Claude should create this structure in a way that matches the actual framework it installs. Do not create empty folders only for aesthetics; every folder should have a clear purpose or a starter file.

  

GitHub-aware Claude instruction:

  

Claude Code should begin by inspecting the repository. If the repository is empty, scaffold BibleQuest V1 according to this Codex. If files exist later, Claude must inspect the existing code before making changes and preserve useful work.

  

Repo-specific build command for Claude:

  

“Clone or open https://github.com/bkeigh/BibleQuest. Read docs/BIBLEQUEST\_CODEX.md first. Treat the v1.2 GitHub Repository Update and v1.1 Second Pass Review sections as highest priority. Because the repository is currently empty, scaffold the project cleanly from scratch as a mobile-first Next.js PWA with TypeScript, Tailwind, Supabase scaffolding, RLS migrations, seed content, Living Editorial UI, and documentation. Do not create a second repository. Do not commit secrets. Implement the MVP daily loop first.”

  

Repository acceptance criteria:

  

The first Claude implementation pass is not complete until:

  

\- The app installs successfully.

\- The app runs locally.

\- The app has a visible landing page.

\- The app has a mobile-first app shell.

\- The app includes the daily loop screens.

\- The app includes BibleQuest design tokens/components.

\- The app includes seed quest/prayer/reflection content.

\- The app includes Supabase schema/RLS files or clear local mock fallback.

\- The app includes docs/BIBLEQUEST\_CODEX.md.

\- The app includes README.md.

\- The app includes SECURITY.md.

\- The app includes .env.example.

\- No secrets are committed.

\- The visual result does not look like a generic Tailwind dashboard.

  
  

v1.2

CreatSECOND PASS REVIEW — READ THIS FIRST

  

Version: v1.1 Reviewed Claude Handoff

Review purpose: tighten scope, reduce ambiguity, strengthen safety boundaries, and prepare this Codex for Claude Code Fable 5 Ultracode implementation.

  

Priority order for Claude Code:

  

1\. Follow this v1.1 Second Pass Review section first.

2\. Then follow Volume X — Claude Code Fable 5 Ultracode Master Prompt.

3\. Then follow Volume VII — Engineering Bible, Volume V — Product Requirements, and Volume VI — QuestOS Architecture.

4\. Then follow Volume IV — UX Bible and Volume III — Brand and Design Bible.

5\. Then follow Volume VIII — Theology and Content Guardrails for all content, quests, prayer, reflection, AI Guide, and safety decisions.

6\. Then follow Volume IX — Growth, Marketing, and Distribution.

7\. Earlier seeded sections are useful for vision and tone, but later expansion passes supersede them when more specific.

  

Second-pass decision: BibleQuest V1 should be built as a focused Christian PWA, not a multi-faith platform at launch. QuestOS should be architected cleanly enough to avoid hard-coding everything, but future non-Christian or denomination-specific products are not launch commitments. Any future expansion beyond BibleQuest requires separate tradition-specific research, advisors, legal review, safety review, and content governance.

  

Second-pass decision: AI Guide is scaffold-only for V1 unless explicitly enabled later with proper guardrails. Claude Code should not ship an unguarded spiritual chatbot. AI must never claim to speak for God, replace clergy, replace therapy, or provide crisis/medical/legal authority.

  

Second-pass decision: Bible translation licensing must be verified before production launch. V1 may use public-domain content, limited seed content, or a properly licensed translation. This Codex does not grant Bible translation rights. The codebase should support translation metadata and future licensing.

  

Second-pass decision: Supabase service role keys are server/admin-only. They must never appear in client code, public environment variables, browser bundles, analytics, or logs.

  

Second-pass decision: prayer, reflection, notes, and private spiritual writing are sensitive data. Claude Code must protect them with RLS, server-side validation, no analytics body text, and clear privacy copy.

  

Second-pass decision: premium monetization must never imply paid users are closer to God or have better access to Scripture, prayer, or core spiritual growth. Plus may deepen the experience, but core Bible reading, prayer, reflection, basic quests, and basic journey features must remain free.

  

Second-pass decision: the MVP should prioritize the complete daily loop over feature sprawl. If Claude Code must reduce scope, preserve this loop: onboarding → Home → daily verse → daily quest → quest completion → reflection → prayer → growth tree → journey timeline.

Current-contract decision (July 2026; supersedes older Home requirements throughout this document): Home opens with the personal account surface, places a compact, lively “View Today’s Verse” action directly beneath it, then presents active and completed quests as the strongest content section. The action opens the Bible hub; the full daily verse card, verse actions, and recent-verse history live on the Bible page. This keeps Scripture in the daily loop without letting it compete with the user’s quests on Home.

  

Second-pass decision: the visual identity is non-negotiable. BibleQuest should not look like a generic Tailwind dashboard, a default shadcn app, a cheap Bible template, or a mobile game casino. The design language is Living Editorial: Paper + Pixel + Prayer.

  

Recommended handoff instruction: export this document as Markdown or copy it into the repository as docs/BIBLEQUEST\_CODEX.md before running Claude Code. Then use the Master Prompt in Volume X as the build command.

  
  

ed: July 6, 2026

  
  

HOW TO USE THIS DOCUMENT

  

This Codex is the source of truth for BibleQuest. It is not only a prompt. It is the operating manual for the product, brand, design system, engineering architecture, content engine, monetization model, launch strategy, and future company.

  

BibleQuest should be built from this document before it is built from code. Every future prompt, sprint, design review, Claude Code session, Codex session, investor conversation, contractor handoff, and launch plan should point back to this Codex.

  

This document will grow in volumes. The first seeded draft establishes the north star, design constitution, product philosophy, and execution brief. Later passes will expand each volume into deeper implementation-ready sections.

  
  

TABLE OF CONTENTS

  

Volume I — Vision

1\. Founder’s Letter

2\. Why BibleQuest Exists

3\. Mission

4\. North Star

5\. What BibleQuest Is

6\. What BibleQuest Is Not

7\. Product Philosophy

8\. The Daily Loop

9\. Emotional Goals

10\. Success Metrics

  

Volume II — Design Constitution

1\. Peace over Productivity

2\. Invitation over Obligation

3\. Transformation over Engagement

4\. One Meaningful Thing

5\. Editorial before Technical

6\. Paper before Plastic

7\. Motion with Meaning

8\. Quiet Confidence

9\. Designed to Age Well

10\. Build Something Worth Keeping

  

Volume III — Brand Bible

Living Editorial, Paper + Pixel + Prayer, tone, voice, typography, color, imagery, iconography, motion, sound, and seasonal identity.

  

Volume IV — UX Bible

Every core screen, flow, interaction state, navigation pattern, onboarding step, notification, empty state, edge case, and user journey.

  

Volume V — Product Requirements

Feature inventory, acceptance criteria, launch scope, V1/V2 roadmap, monetization, retention loops, church tools, family tools, widgets, and future platform expansion.

  

Volume VI — QuestOS Architecture

Faith providers, quest engine, Bible content engine, prayer engine, reflection engine, growth tree, seasonal engine, notification engine, admin/CMS, API, and SDK.

  

Volume VII — Engineering Bible

Next.js, TypeScript, Supabase, Postgres, PWA, offline, caching, auth, RLS, testing, analytics, monitoring, security, CI/CD, deployment, and iOS wrapper strategy.

  

Volume VIII — Theology and Content Guardrails

Christian content rules, Catholic awareness, ecumenical language, AI boundaries, pastoral safety, prayer writing, quest writing, denomination awareness, and future faith-provider guidelines.

  

Volume IX — Growth, Marketing, and Distribution

Landing page strategy, SEO, ASO, TikTok/Reels, church outreach, creator partnerships, referral loops, email lifecycle, launch plan, content calendar, and press kit.

  

Volume X — Claude Code Master Prompt

The final implementation prompt for Claude Code Fable 5 Ultracode to build the launch-ready PWA and operational foundation.

  
  

VOLUME I — VISION

  

1\. Founder’s Letter

  

BibleQuest exists because spiritual growth is often treated like a content problem, when for many people it is really a direction problem.

  

Most people do not lack access to Scripture. They lack rhythm. They lack a clear next step. They lack a gentle daily invitation that helps them move from belief into lived action.

  

BibleQuest is built around a simple belief:

  

Faith should not feel like homework.

  

It should feel like opening a beautifully crafted invitation to spend a few meaningful minutes with God.

  

The app should help people read Scripture, pray honestly, reflect deeply, and act with kindness. It should help them become more patient, more generous, more forgiving, more disciplined, more peaceful, and more present.

  

BibleQuest is not designed to keep people trapped in an app. It is designed to help them leave the app and live differently.

  

The best version of BibleQuest is not measured by screen time. It is measured by whether someone prayed when they otherwise would not have, forgave when they otherwise would have held resentment, read Scripture when they otherwise would have scrolled, or served someone when they otherwise would have ignored the opportunity.

  

BibleQuest should feel like an old journal that somehow came alive. It should carry the warmth of paper, the delight of subtle pixel art, the peace of a quiet morning, and the clarity of an Apple-level product.

  

This is not just a Bible app.

  

This is a spiritual companion.

  
  

2\. Why BibleQuest Exists

  

The modern Christian app category is crowded with Bible readers, devotionals, sermon libraries, and habit trackers. Many of them are useful. Few feel emotionally unforgettable.

  

BibleQuest should occupy a different space.

  

BibleQuest is not trying to become the largest Bible library. It is trying to become the most meaningful daily companion for Christians who want to grow closer to God through small, repeatable, real-life actions.

  

The problem BibleQuest solves:

  

“I want to grow closer to God, but I do not know what to do today.”

  

The answer BibleQuest provides:

  

“Here is one verse, one reflection, one prayer, and one quest for today.”

  

The product exists to reduce spiritual overwhelm. It gives the user a path without turning faith into productivity software.

  
  

3\. Mission

  

BibleQuest helps people grow closer to God through Scripture, prayer, reflection, and small daily acts of faith.

  

The mission must remain simple enough to guide every product decision.

  

If a feature does not support Scripture, prayer, reflection, growth, or meaningful action, it should be removed, deferred, or redesigned.

  
  

4\. North Star

  

The North Star of BibleQuest is not daily active users. It is not time spent. It is not streak length. It is not subscription conversion.

  

The North Star is:

  

Meaningful spiritual actions completed.

  

A meaningful spiritual action can include:

  

\- Reading a verse or chapter with attention.

\- Completing a quest of kindness, prayer, service, gratitude, forgiveness, discipline, or reflection.

\- Writing an honest prayer.

\- Reflecting after a completed quest.

\- Returning after a long absence without shame.

\- Sharing encouragement with another person.

\- Participating in a church, family, or small-group practice.

  

Engagement is only useful when it leads to transformation.

  
  

5\. What BibleQuest Is

  

BibleQuest is:

  

\- A mobile-first, installable Progressive Web App for BibleQuest.us.

\- A daily Christian spiritual companion.

\- A quest-based faith habit system.

\- A Bible reading and verse discovery app.

\- A prayer and reflection journal.

\- A gentle growth tracker.

\- A future platform built on QuestOS.

\- A product whose architecture should not prevent future faith-specific or values-based apps, while recognizing that any non-Christian or denomination-specific product would require separate tradition-specific research, advisors, legal review, and content governance.

  

BibleQuest should feel like:

  

\- General Intelligence Company’s editorial confidence and cinematic pacing.

\- The uploaded General Intelligence design reference’s warm paper, literary, minimal, hand-crafted atmosphere.

\- Apple Sports’ clarity and native polish.

\- Notion’s calm document-like surfaces.

\- Nintendo’s gentle delight.

\- Calm’s emotional spaciousness.

\- A devotional journal that quietly came alive.

  
  

6\. What BibleQuest Is Not

  

BibleQuest is not:

  

\- A social media app.

\- A replacement for church.

\- A replacement for priests, pastors, clergy, therapists, or spiritual directors.

\- A theology debate app.

\- A shame-based streak tracker.

\- A productivity app with religious language.

\- A casino-like gamification system.

\- A cheap Bible reader clone.

\- A content dump.

\- An AI preacher.

  

BibleQuest should never weaponize guilt. It should never imply that God’s love is dependent on app activity. It should never claim spiritual superiority. It should never turn holiness into a leaderboard.

  
  

7\. Product Philosophy

  

BibleQuest is built around a daily rhythm:

  

Arrive.

Breathe.

Read.

Reflect.

Act.

Pray.

Grow.

Leave.

Return.

  

The product should slow the user down. Every screen should reduce cognitive load and invite one meaningful next step.

  

The app should be emotionally warm but visually disciplined. It should not be over-decorated. It should not use religious cliché as a substitute for design. Its sacred feeling should come from restraint, language, pacing, typography, paper texture, quiet motion, and meaningful interaction.

  

The core experience should be free and complete. Premium should deepen the experience, not hold spiritual growth hostage.

  
  

8\. The Daily Loop

  

The daily loop is the foundation of the product.

  

Open BibleQuest.

  

See today’s greeting.

  

Receive a verse.

  

Choose or receive a quest.

  

Complete the quest.

  

Reflect on what happened.

  

Pray.

  

See growth.

  

Leave the app with peace.

  

Return tomorrow.

  

Everything else is secondary.

  
  

9\. Emotional Goals

  

When a user opens BibleQuest, they should feel:

  

\- Welcomed, not judged.

\- Calm, not rushed.

\- Guided, not controlled.

\- Encouraged, not shamed.

\- Curious, not overwhelmed.

\- Grounded, not distracted.

\- Hopeful, not pressured.

  

The product should feel like a quiet companion.

  

A good session can last two minutes.

  

A great session can end with the user closing the app and doing something kind.

  
  

10\. Success Metrics

  

Primary product metrics:

  

\- Quest completions.

\- Reflections written.

\- Prayers created.

\- Bible sessions completed.

\- Return-after-absence rate.

\- Weekly meaningful action rate.

\- Onboarding completion.

\- PWA install rate.

\- Premium conversion, without compromising the free mission.

  

Qualitative success:

  

\- Users describe BibleQuest as peaceful.

\- Users say it helped them pray more often.

\- Users say it helped them act differently in real life.

\- Users feel safe journaling in the app.

\- Users return without shame after missing days.

\- Churches, families, and small groups see it as helpful rather than distracting.

  
  

VOLUME II — DESIGN CONSTITUTION

  

These principles override individual feature ideas. If a feature violates the Constitution, redesign the feature.

  

1\. Peace over Productivity

  

BibleQuest should never feel like a task manager. It may contain tasks, but they are spiritual invitations, not obligations. The interface should breathe. The app should not provoke anxiety, urgency, or fear of falling behind.

  

2\. Invitation over Obligation

  

Never shame. Never guilt. Always invite. The user is not failing when they miss a day. They are simply continuing the pilgrimage when they return.

  

3\. Transformation over Engagement

  

The goal is not to maximize screen time. The goal is to encourage meaningful spiritual action. If a feature keeps users in the app without helping them live differently, it is not serving the mission.

  

4\. One Meaningful Thing

  

Every screen should help the user do one meaningful thing. Do not overload the home screen. Do not bury the next step. Do not present faith as a dashboard of chores.

  

5\. Editorial before Technical

  

BibleQuest should explain beautifully, not exhaustively. Language should feel literary, warm, and human. Technical capability should be hidden behind emotional clarity.

  

6\. Paper before Plastic

  

The UI should feel crafted, not manufactured. Use warm parchment backgrounds, paper cards, hairline borders, serif display type, subtle texture, and document-like surfaces. Avoid glossy app-store sameness.

  

7\. Motion with Meaning

  

Everything that moves should reinforce the story. Leaves sway because the tree is alive. Paper slips into the journal because a reflection became part of the user’s pilgrimage. Light changes because the day changes. Never animate for spectacle alone.

  

8\. Quiet Confidence

  

No hype. No dopamine explosions. No flashing rewards. Celebrate gently. Trust the user. Trust the product. Trust the silence.

  

9\. Designed to Age Well

  

BibleQuest should still feel beautiful ten years from now. Avoid trend-chasing, novelty UI, gimmicks, and aggressive visual language.

  

10\. Build Something Worth Keeping

  

If a user journals in BibleQuest for ten years, the product should become one of the most meaningful digital artifacts they own. Treat their prayers, reflections, and history with the gravity they deserve.

  
  

VOLUME III — BRAND AND DESIGN DIRECTION

  

Working design language: Living Editorial.

  

Supporting phrase: Paper + Pixel + Prayer.

  

BibleQuest should feel like opening an old devotional journal that somehow came alive.

  

The visual world should combine:

  

\- Warm paper surfaces.

\- Literary serif typography.

\- Minimal UI chrome.

\- Hairline green-gray borders.

\- Soft white cards.

\- Gentle pixel art.

\- Atmospheric hand-painted illustrations.

\- Slow ambient motion.

\- Seasonal light.

\- Calm, precise interactions.

  

Primary UI inspiration:

  

\- General Intelligence Company light paper/editorial design reference.

\- General Intelligence Cofounder scrollytelling and cinematic pacing.

\- Apple Sports for clarity and restraint.

\- Notion for document-like calm.

\- Calm for emotional pacing.

\- Nintendo and modern pixel art for delight.

  

Key translation from reference material:

  

Use the warm parchment paper system from the light General Intelligence design reference as the main app surface. Use the dark Cofounder-style scrollytelling as inspiration for the landing page narrative rhythm, not as the primary app aesthetic.

  

The app should not become a dark AI-lab product. BibleQuest should remain warm, devotional, editorial, and human.

  
  

DESIGN TOKENS — FIRST PASS

  

Core colors:

  

\- Parchment Canvas: \#fefffc

\- Paper Card: \#ffffff

\- Linen Wash: \#f9faf7

\- Ink Black: \#171717

\- Graphite: \#2c2c2c

\- Charcoal: \#444141

\- Ash: \#646464

\- Mist Border: \#dee2de

\- Twilight: \#282834

\- Dusk: \#1f1f29

\- Signal Blue: \#41a1cf

\- Cerulean: \#0081c0

  

BibleQuest adaptation colors:

  

\- Olive: for growth, quests, tree, patience, ordinary time.

\- Warm Gold: for candlelight, blessing, celebration, Easter accents.

\- Soft Blue: for calm, Mary/Catholic-aware moments, Advent, sky, water.

\- Violet: for Lent, quiet sacrifice, reflection.

\- Rose: for joy, gratitude, gentle warmth.

  

Typography:

  

Use a literary serif for headings 27px and above. Suggested substitutes: Fraunces, Recoleta, Cormorant Garamond, Newsreader, GT Sectra-like alternatives.

  

Use a clean sans for UI and body text. Suggested: Inter, Geist, Söhne-like alternatives.

  

Do not use heavy bold serif display. The serif should speak quietly.

  

Spacing:

  

Use a 4px base system. Prefer generous breathing room. Cards should not be crowded. Let one idea land at a time.

  

Shape:

  

\- Cards: 12px–16px radius.

\- Large atmospheric surfaces: 24px radius.

\- Buttons: 8px radius.

\- Navigation pill: full rounded.

  

Buttons:

  

Prefer outlined actions over filled buttons. Use filled dark buttons sparingly. Never make the app feel salesy.

  
  

ILLUSTRATION PRINCIPLES

  

BibleQuest illustration should be warm, human, and emotionally quiet.

  

Use:

  

\- Pixel candles.

\- Pixel stars.

\- Pixel leaves.

\- Pixel birds.

\- Pixel flowers.

\- Tiny chapels, hills, rivers, trees, benches, journals, bookmarks, and lanterns.

\- Hand-painted atmospheric backgrounds for landing pages and seasonal moments.

  

Avoid:

  

\- Generic religious clipart.

\- Overuse of crosses.

\- Stock photography.

\- Hyper-realistic church imagery.

\- AI-looking fantasy art.

\- Overly ornate medieval decoration.

  

Pixel art should not feel like retro nostalgia. It should feel like a modern spiritual storybook.

  
  

MOTION PRINCIPLES

  

BibleQuest should feel alive, not animated.

  

Examples:

  

\- Tree leaves gently sway.

\- A candle flickers while praying.

\- Paper slides into the journal after reflection.

\- A tiny bird lands on the growth tree after a kindness quest.

\- Stars appear at night.

\- Morning light warms the home screen.

\- Seasonal particles drift lightly: petals, snow, ash, rain, dust, fireflies.

  

Motion should be slow, optional, respectful, and accessible. Honor reduced-motion preferences.

  
  

VOICE PRINCIPLES

  

BibleQuest copy should be:

  

\- Warm.

\- Literary.

\- Calm.

\- Direct.

\- Encouraging.

\- Human.

\- Non-performative.

  

Use language like:

  

\- “Your journey continues.”

\- “A small quest is waiting.”

\- “Begin when you’re ready.”

\- “Take a quiet moment.”

\- “Welcome back.”

\- “Small steps still count.”

  

Avoid:

  

\- “You failed.”

\- “Don’t lose your streak.”

\- “God is disappointed.”

\- “Level up your holiness.”

\- “Crush your spiritual goals.”

  
  

VOLUME IV — PRODUCT CORE

  

Main navigation:

  

\- Home

\- Quests

\- Bible

\- Prayer

\- Journey

  

Home:

  

The Home screen should feel like opening a personal devotional journal that has been waiting for the user.

  

Core elements:

  

\- Greeting.

\- Today’s verse.

\- Today’s quest.

\- Quick prayer.

\- Growth tree.

\- Reflection prompt.

\- Continue reading.

\- Recent growth.

  

Quests:

  

Quests are the heart of BibleQuest. They are spiritually meaningful actions that help the user live out Scripture.

  

Durations:

  

\- 5 minutes

\- 10 minutes

\- 15 minutes

\- 30 minutes

\- 1 hour

\- Half day

\- Full day

  

Categories:

  

\- Prayer

\- Scripture

\- Service

\- Kindness

\- Forgiveness

\- Generosity

\- Discipline

\- Gratitude

\- Silence

\- Worship

\- Family

\- Community

\- Reflection

\- Evangelization

\- Self-control

\- Humility

\- Patience

  

Every quest must include:

  

\- Title

\- Description

\- Estimated duration

\- Difficulty

\- Category

\- Energy level

\- Solo/social indicator

\- Indoor/outdoor indicator

\- Supporting Scripture

\- Why it matters

\- Completion action

\- Reflection prompt

\- Prayer prompt

\- Growth impact

\- Tags

\- Denomination compatibility

\- Seasonal relevance

  

Bible:

  

V1 should use a public-domain Bible translation unless licensing is configured. Support book, chapter, verse reading, bookmarks, highlights, notes, reading history, search scaffold, and offline caching scaffold.

  

Prayer:

  

Prayer should be private by default. Include prayer journal, prayer requests, answered prayers, prayer categories, quick prayer, timer, and reminder scaffold.

  

Journey:

  

Journey is the user’s pilgrimage timeline. Include completed quests, reflections, prayers, readings, milestones, growth tree, weekly recap, monthly recap scaffold, and year-in-review scaffold.

  

Growth Tree:

  

Replace XP with a living tree.

  

\- Prayer nourishes roots.

\- Scripture grows branches.

\- Kindness grows leaves.

\- Service bears fruit.

\- Reflection brings sunlight.

\- Gratitude brings flowers.

  

The tree never dies when the user misses days. Growth continues when they return.

  
  

VOLUME V — QUESTOS FIRST ARCHITECTURE

  

QuestOS is the internal platform beneath BibleQuest.

  

BibleQuest is the first faith provider.

  

Future provider possibilities, not commitments:

  

\- Denomination-specific BibleQuest extensions

\- Church/parish/ministry-specific configurations

\- Other faith-specific or values-based apps only after separate tradition-specific research, advisors, legal review, and content governance

  

Core engines:

  

\- Faith Provider Engine

\- Quest Engine

\- Verse Engine

\- Prayer Engine

\- Reflection Engine

\- Growth Engine

\- Seasonal Engine

\- Notification Engine

\- Personalization Engine

\- Subscription Engine

\- Admin/CMS Engine

  

Recommended technical stack:

  

\- Next.js App Router

\- TypeScript

\- Tailwind CSS

\- shadcn/ui, adapted heavily to the BibleQuest design system

\- Framer Motion or Motion

\- Supabase

\- Postgres

\- Supabase Auth

\- Row Level Security

\- Drizzle ORM or Prisma

\- Zod

\- React Hook Form

\- Zustand or lightweight state

\- PWA service worker

\- Vercel deployment

\- Stripe or RevenueCat scaffold

\- Sentry scaffold

\- PostHog or Plausible scaffold

\- Resend scaffold

\- Capacitor later for iOS

  

Data models needed:

  

\- users

\- profiles

\- faith\_providers

\- denominations

\- bible\_translations

\- bible\_books

\- bible\_chapters

\- bible\_verses

\- daily\_verses

\- quest\_templates

\- quests

\- quest\_completions

\- reflections

\- prayers

\- prayer\_requests

\- prayer\_categories

\- bookmarks

\- highlights

\- notes

\- milestones

\- user\_milestones

\- growth\_events

\- notification\_preferences

\- reading\_plans

\- reading\_plan\_days

\- user\_reading\_progress

\- subscriptions

\- feature\_flags

\- seasonal\_calendars

\- callings

\- user\_callings

  

Privacy:

  

Prayer and reflection data are sensitive. Use private-by-default storage, clear privacy language, RLS, minimal analytics, no selling personal data, and no tracking of raw journal/prayer content.

  
  

VOLUME VI — MONETIZATION FIRST PASS

  

Free must feel complete.

  

Free includes:

  

\- Bible reader

\- Verse of the Day

\- Daily quests

\- Prayer journal

\- Reflection journal

\- Basic growth tree

\- Basic milestones

\- Basic reading history

\- Basic reminders

\- Seasonal themes

\- Offline access scaffold

  

Premium: BibleQuest Plus

  

Plus deepens the experience without holding core spiritual growth hostage.

  

Plus includes:

  

\- AI Guide

\- Personalized quest generation

\- Advanced reading plans

\- Premium themes

\- Advanced widgets

\- Voice journaling

\- Prayer and reflection insights

\- Monthly spiritual recap

\- Year in Review

\- Family prayer groups

\- Cross-device sync

\- Enhanced offline access

\- Early access features

  

Support: BibleQuest Patron

  

Patron exists for users who want to support the mission. It should not create a spiritual advantage. Offer a patron badge, thank-you screen, optional supporter wall, and transparency reports.

  

Future: Church Mode

  

Church Mode can become a B2B/B2Church offering with custom quests, reading plans, prayer circles, group announcements, events, and small-group tools.

  
  

VOLUME VII — CLAUDE CODE EXECUTION BRIEF

  

When building BibleQuest, Claude Code Fable 5 Ultracode should not treat this as a small app or prototype.

  

It should act as the founding product team.

  

Before writing code, it must:

  

1\. Read and internalize this Codex.

2\. Produce a concise implementation plan.

3\. Define V1 launch scope.

4\. Create the file tree.

5\. Define schema and migrations.

6\. Create the design tokens.

7\. Build the app in phases.

8\. Test core flows.

9\. Document manual setup.

10\. Prepare deployment instructions.

  

The goal is not to build every future feature immediately. The goal is to build a launch-ready V1 with the right architecture, design system, content model, and emotional foundation.

  

Launch-ready V1 should include:

  

\- Landing page at BibleQuest.us.

\- PWA app shell.

\- Onboarding.

\- Home.

\- Quest system with seeded quests.

\- Bible reader using public-domain content or a seed scaffold.

\- Prayer journal.

\- Reflection journal.

\- Journey timeline.

\- Growth tree.

\- Settings.

\- Premium scaffold.

\- Supabase-ready schema.

\- PWA manifest and install support.

\- Offline fallback.

\- Privacy policy and terms placeholders.

\- README and deployment guide.

  

Manual setup to document:

  

\- Domain configuration for BibleQuest.us.

\- Supabase project creation.

\- Environment variables.

\- Vercel deployment.

\- Stripe or RevenueCat setup.

\- Bible translation licensing.

\- App icons and splash screens.

\- Privacy policy and terms review.

\- iPhone PWA install test.

\- Capacitor/iOS wrapper later.

  
  

NEXT EXPANSION PASSES

  

Pass 1: Expand Volume III into a full Brand and Design Bible.

Pass 2: Expand Volume IV into a screen-by-screen UX Bible.

Pass 3: Expand Volume V into a full Engineering Bible and QuestOS architecture.

Pass 4: Expand Theology and Content Guardrails.

Pass 5: Create the final Claude Code Fable 5 Ultracode Master Build Prompt.

Pass 6: Create marketing, launch, and distribution playbooks.

  
  

END OF SEEDED DRAFT v1.0 — SUPERSEDED WHERE EXPANSION PASSES OR v1.1 HANDOFF NOTES ARE MORE SPECIFIC

  
  

EXPANSION PASS 1 — VOLUME III: BRAND AND DESIGN BIBLE

  

This pass expands the initial brand and design direction into a more complete creative operating system for BibleQuest. This section should be treated as the design source of truth for Claude Code, future designers, UI engineers, motion designers, illustrators, and marketing collaborators.

  
  

1\. Brand Thesis

  

BibleQuest should feel like a devotional journal that quietly came alive.

  

It is not a Bible app with gamification attached. It is a spiritual storyworld expressed through product design.

  

The brand should sit at the intersection of:

  

\- Paper: warmth, memory, journaling, Scripture, margin notes, physicality, permanence.

\- Pixel: quests, wonder, tiny delight, digital craftsmanship, collectibility, playful clarity.

\- Prayer: quiet, reverence, humility, reflection, spiritual depth, peace.

  

The simplest shorthand:

  

Paper + Pixel + Prayer.

  

The more complete design language:

  

Living Editorial.

  

Living Editorial means the product feels written, composed, and intentionally paced like a beautiful essay, but it also feels alive through subtle motion, seasonal changes, gentle pixel details, and user growth.

  

The app should never feel like it was assembled from a generic component library. It should feel authored.

  
  

2\. Emotional Positioning

  

BibleQuest should make the user feel like they have stepped away from the noise of the internet and entered a quiet spiritual space.

  

The product should feel:

  

\- Warm, not sterile.

\- Sacred, not performative.

\- Premium, not luxury for luxury’s sake.

\- Peaceful, not sleepy.

\- Playful, not childish.

\- Christian, not cliché.

\- Modern, not trendy.

\- Human, not corporate.

\- Guided, not controlling.

\- Alive, not busy.

  

The emotional promise:

  

“Open BibleQuest and receive one meaningful step toward God today.”

  

The emotional memory after use:

  

“I feel calmer. I know what to do next. I want to come back.”

  
  

3\. Visual World

  

BibleQuest should live in a warm editorial world of paper, light, small symbols, and tiny living details.

  

The base interface is quiet:

  

\- Parchment canvas.

\- White paper cards.

\- Soft green-gray borders.

\- Serif headings.

\- Sans UI text.

\- Gentle outlines.

\- Minimal filled color.

\- Generous negative space.

  

The emotional layer is illustrated:

  

\- Pixel flowers.

\- Pixel candles.

\- Pixel stars.

\- Pixel birds.

\- Pixel leaves.

\- Tiny chapels.

\- Small hills.

\- Warm windows.

\- Slow clouds.

\- Fireflies at night.

\- Journal paper slipping into place.

\- A living tree that grows with the user’s pilgrimage.

  

The site and app should use illustrated moments the way General Intelligence Company uses atmospheric illustrated sections: not decoration, but emotional structure. Illustration should carry feeling between clean UI sections.

  
  

4\. Primary Design References

  

General Intelligence Company — Light Editorial Reference

  

Use this as the strongest visual foundation:

  

\- Warm parchment background.

\- Literary serif headlines.

\- Minimal color.

\- Hairline borders.

\- White paper cards.

\- Subtle green-gray edge treatment.

\- Soft, almost invisible shadows.

\- Sparse UI chrome.

\- Hand-painted atmospheric illustrations.

\- One idea per screen.

  

General Intelligence Cofounder — Scrollytelling Reference

  

Use this mainly for the landing page and marketing narrative:

  

\- Scroll as narrative engine.

\- A thesis unfolds as the user moves.

\- Ambient motion creates a living background.

\- Copy does real design work.

\- Product is demonstrated through simulated real UI moments.

\- The page argues a belief, not a feature list.

  

Apple Sports

  

Use for:

  

\- Clarity.

\- Native-feeling mobile UI.

\- Confident spacing.

\- Low-friction information hierarchy.

\- Bottom navigation discipline.

\- Calm presentation of live/daily state.

  

Notion

  

Use for:

  

\- Document-like calm.

\- Paper surfaces.

\- Friendly empty states.

\- Content organization.

\- The feeling that user-generated writing matters.

  

Nintendo / Modern Pixel Games

  

Use for:

  

\- Gentle delight.

\- Micro-rewards.

\- Pixel collectibles.

\- Tiny living world details.

\- A sense of pilgrimage without aggressive gamification.

  

Calm / Headspace

  

Use for:

  

\- Emotional pacing.

\- Soft rituals.

\- Breathing room.

\- Gentle notification tone.

\- Respect for quiet time.

  

Avoid copying any one reference too literally. BibleQuest must become its own visual world.

  
  

5\. Design Constitution Applied to Visuals

  

Peace over Productivity

  

Do not create dashboards that look like work software. Even when showing progress, the presentation should feel like a journal entry or pilgrimage marker.

  

Invitation over Obligation

  

Quest cards must look like invitations, not assignments. Use soft language, light cards, gentle icons, and no aggressive urgency.

  

Transformation over Engagement

  

Avoid UI that encourages endless scrolling. The app can be beautiful, but it should still make it easy to leave after completing a meaningful act.

  

One Meaningful Thing

  

The Home screen should have hierarchy. The user should always know the one next action. Secondary items can exist, but they must not compete.

  

Editorial before Technical

  

Use headlines that read like prose. Technical labels should be short and quiet. Do not over-explain the system in the UI.

  

Paper before Plastic

  

Avoid glossy gradients, generic SaaS cards, glassmorphism everywhere, and heavy digital shine. Use paper, border, serif, and texture as the base.

  

Motion with Meaning

  

Animations should explain state changes emotionally. If the user completes a quest, the journal receives a page. If they pray, a candle flickers. If they return, the tree gently wakes.

  

Quiet Confidence

  

Do not oversell. Do not make the app scream. Avoid excessive confetti, badges, and “achievement unlocked” language.

  

Designed to Age Well

  

Use timeless typography, restraint, and simple geometry. Avoid UI trends that will look dated.

  

Build Something Worth Keeping

  

User-generated content should be treated like a keepsake. Prayers and reflections should never look disposable.

  
  

6\. Color System

  

The color system should be mostly neutral, warm, and paper-based. Color exists as atmosphere, not decoration.

  

Core Neutral Tokens

  

Parchment Canvas — \#fefffc

Use as the global page and app background. It should feel warmer than pure white and subtly like a book page.

  

Paper Card — \#ffffff

Use for cards, journal entries, modal surfaces, and elevated content areas.

  

Linen Wash — \#f9faf7

Use for inputs, secondary surfaces, subtle page sections, and disabled wash areas.

  

Ink Black — \#171717

Use for highest-contrast text only. Avoid pure black.

  

Graphite — \#2c2c2c

Use for primary headings and strong body text.

  

Charcoal — \#444141

Use for primary body text and UI labels.

  

Ash — \#646464

Use for helper text, captions, timestamps, metadata, and secondary explanations.

  

Fog — \#b4b8b4

Use for disabled text, quiet dividers, and inactive icon states.

  

Mist — \#dee2de

Use for hairline borders, card edges, dividers, and the signature paper edge treatment.

  

Twilight — \#282834

Use for dark outlines, icon strokes, and occasional high-emphasis borders.

  

Dusk — \#1f1f29

Use sparingly as the only dark filled button or deep footer/landing section tone.

  

Signal Blue — \#41a1cf

Use as a rare outlined CTA accent, not a primary fill.

  

Cerulean — \#0081c0

Use as a rare atmospheric surface, not a general UI color.

  

BibleQuest Extended Tokens

  

Olive Grove

Use for growth, ordinary time, tree states, service quests, and grounded spiritual progress.

  

Suggested values:

\- Olive 50: \#f4f7ef

\- Olive 100: \#e7eddd

\- Olive 300: \#a8b98c

\- Olive 500: \#6f8155

\- Olive 700: \#3f4d31

  

Candle Gold

Use for candlelight, prayer, blessing, celebration, Easter warmth, and subtle premium emphasis.

  

Suggested values:

\- Gold 50: \#fff9ec

\- Gold 100: \#f7edcf

\- Gold 300: \#e5c36d

\- Gold 500: \#b68b2f

\- Gold 700: \#6f531d

  

Marian Blue / Advent Blue

Use for calm, sky, water, Advent, Mary-aware Catholic moments, and peaceful states.

  

Suggested values:

\- Blue 50: \#f1f7fb

\- Blue 100: \#dbeaf3

\- Blue 300: \#8fb9d4

\- Blue 500: \#3f7ea3

\- Blue 700: \#244a61

  

Lenten Violet

Use for Lent, sacrifice, silence, repentance, confession prompts, and deeper reflection.

  

Suggested values:

\- Violet 50: \#f7f3fa

\- Violet 100: \#eadff1

\- Violet 300: \#bea4cf

\- Violet 500: \#7d5793

\- Violet 700: \#4b315d

  

Rose Joy

Use sparingly for gratitude, joy, celebration, kindness, and gentle warmth.

  

Suggested values:

\- Rose 50: \#fff5f4

\- Rose 100: \#f8dfdc

\- Rose 300: \#e5a8a1

\- Rose 500: \#b9645d

\- Rose 700: \#743a35

  

Color Usage Rules

  

\- Use parchment and paper for 80–90% of the interface.

\- Use Mist borders everywhere as the signature structure.

\- Use color mostly through small icons, tags, seasonal accents, illustrations, and atmospheric moments.

\- Do not create a rainbow UI.

\- Do not make each quest category a loud saturated color.

\- Premium should not be gold-plated. Premium can use candlelight warmth, but never a tacky luxury aesthetic.

\- Liturgical/seasonal colors should shift the mood, not repaint the entire app.

  
  

7\. Typography System

  

Typography carries the soul of BibleQuest.

  

Display Serif

  

Use for:

  

\- Landing page hero headlines.

\- Section headings.

\- Home greeting moments.

\- Verse display.

\- Journal title moments.

\- Empty states.

\- Major emotional copy.

  

Suggested fonts:

  

\- Fraunces.

\- Newsreader.

\- Cormorant Garamond.

\- Recoleta-like if licensed.

\- GT Sectra-like if licensed.

  

Guidelines:

  

\- Use weight 400 or 500.

\- Avoid heavy 700 serif headings.

\- Use tight but not cramped tracking.

\- Use line-height around 1.1 for display.

\- Let serif type feel set, not shouted.

  

UI Sans

  

Use for:

  

\- Navigation.

\- Buttons.

\- Labels.

\- Quest metadata.

\- Body text.

\- Forms.

\- Settings.

\- Tables.

\- Technical/admin screens.

  

Suggested fonts:

  

\- Inter.

\- Geist.

\- Söhne-like if licensed.

\- Avenir-like if needed.

  

Guidelines:

  

\- Use 400 for body.

\- Use 500 for interactive labels.

\- Use 600 sparingly for section labels.

\- Avoid overusing bold.

\- Body line-height should feel readable and calm.

  

Type Scale

  

Caption: 13px, line-height 1.3.

Small body: 15px, line-height 1.35.

Body: 16px, line-height 1.5.

Subheading: 18px, line-height 1.35.

Small editorial heading: 27px, line-height 1.25.

Heading: 40px, line-height 1.1.

Large heading: 48px, line-height 1.1.

Display: 54px+, line-height 1.05–1.1.

  

Reading Rules

  

\- Bible text should be comfortable, not tiny.

\- Verse line lengths should be controlled.

\- Reflection/journal writing areas should feel like paper, not generic forms.

\- Long-form content should not exceed comfortable reading widths.

\- Avoid dense paragraphs on mobile.

  
  

8\. Layout System

  

Base Unit

  

Use a 4px spacing base.

  

Common spacing:

  

\- 4px: micro gaps.

\- 8px: tight related elements.

\- 12px: label/content gaps.

\- 16px: default card padding.

\- 20px: mobile section rhythm.

\- 24px: comfortable component spacing.

\- 32px: major screen groups.

\- 48px: page sections.

\- 64px: landing page rhythm.

\- 80px+: atmospheric marketing sections.

  

Mobile Layout

  

BibleQuest is mobile-first.

  

Rules:

  

\- Bottom navigation must respect safe areas.

\- Top content should never hide behind notches.

\- Primary actions should be thumb-friendly.

\- Cards should stack in a calm vertical rhythm.

\- Avoid multi-column layouts in the app shell on mobile.

\- Prefer one primary card/action per viewport.

  

Desktop Layout

  

Desktop should not feel like a stretched mobile app.

  

Use:

  

\- Centered max-width content.

\- Wider reading layouts for Bible and journal.

\- Optional side panels for chapter lists, bookmarks, or journey timeline.

\- Editorial landing page sections.

  

Screen Rhythm

  

Each screen should answer:

  

\- Where am I?

\- What is today’s invitation?

\- What is the one next thing?

\- What can I explore if I want more?

  

Avoid showing every feature at once.

  
  

9\. Surface and Card System

  

BibleQuest uses paper surfaces as emotional architecture.

  

Primary Surface: Parchment Canvas

  

The base app background should feel like warm paper. It should be quiet enough for daily use.

  

Secondary Surface: Paper Card

  

Most content appears on white cards with Mist borders. Cards should feel like inserts, notes, journal pages, or devotional cards.

  

Tertiary Surface: Linen Wash

  

Use for inputs, quiet panels, settings groups, and nested content.

  

Atmospheric Surface

  

Use for special illustrated cards, seasonal moments, landing page sections, and growth tree worlds.

  

Card Rules

  

\- Border: 1px solid Mist.

\- Radius: 12px–16px.

\- Padding: usually 16px–24px.

\- Shadow: subtle and paper-like.

\- Avoid heavy elevation.

\- Avoid glossy glass cards inside the main app.

  

Quest Card

  

A Quest Card should feel like a paper slip handed to the user.

  

Must include:

  

\- Quest title.

\- Duration.

\- Category.

\- One-sentence invitation.

\- Supporting Scripture reference.

\- Primary action.

  

Optional:

  

\- Tiny pixel icon.

\- Difficulty dot.

\- Energy label.

\- Seasonal tag.

  

Quest cards should not look like Jira tasks.

  

Verse Card

  

A Verse Card should feel like a devotional card or margin note.

  

Must include:

  

\- Verse text.

\- Reference.

\- Save/bookmark action.

\- Optional share action.

\- Gentle reflection prompt.

  

Prayer Card

  

Prayer cards should feel private and held.

  

Use quieter visual treatment than quest cards. Avoid making prayer requests look like social feed posts.

  

Reflection Card

  

Reflection cards should feel like journal pages. If a user writes something meaningful, the design should honor it.

  

Growth Tree Card

  

The growth tree should be a living illustrated area, not a data visualization. It can include small metrics, but the tree itself is the main emotional object.

  
  

10\. Navigation System

  

App Navigation

  

Use bottom navigation for the installed PWA/mobile app:

  

\- Home

\- Quests

\- Bible

\- Prayer

\- Journey

  

Each nav item should use a simple line icon or pixel-inspired glyph.

  

Nav behavior:

  

\- Always accessible.

\- Safe-area aware.

\- Minimal labels.

\- Current section indicated quietly.

\- Do not use loud active colors.

  

Landing Page Navigation

  

Use a floating editorial nav inspired by the General Intelligence reference:

  

\- BibleQuest logo/wordmark.

\- About.

\- How it Works.

\- Writing.

\- Churches.

\- Pricing.

\- Get BibleQuest.

  

The nav should feel like a small paper/glass pill. Use backdrop blur sparingly if placed over illustration.

  

The landing page should include a Writing section because BibleQuest should lead with ideas, not just features. Essays can later become SEO, trust-building, and brand authority.

  
  

11\. Button System

  

Primary Outlined Button

  

Use for the most common CTAs.

  

Style:

  

\- Transparent background.

\- 1px border.

\- 8px radius.

\- Medium sans text.

\- Small arrow or glyph.

  

Primary color can adapt by context:

  

\- Signal Blue for landing page CTA.

\- Olive for growth/quest contexts.

\- Twilight for neutral actions.

  

Filled Dark Button

  

Use sparingly for high-emphasis moments:

  

\- Start onboarding.

\- Begin today’s journey.

\- Subscribe confirmation.

  

Never overuse dark filled buttons.

  

Ghost Button

  

Use for secondary actions:

  

\- Skip.

\- Maybe later.

\- Save for later.

\- Reroll quest.

  

Text Link

  

Use for tertiary actions and inline references.

  

Danger Button

  

Use only for account deletion, prayer deletion, or destructive settings.

  

Use clear language and confirmation. Do not dramatize.

  
  

12\. Iconography

  

BibleQuest iconography should be minimal and emotionally soft.

  

Use line icons for UI clarity.

  

Use pixel glyphs for quest/art delight.

  

Potential icon language:

  

\- Home: small chapel/window/journal.

\- Quests: path marker/flag/leaf.

\- Bible: open book.

\- Prayer: candle/hands/heart.

\- Journey: tree/path.

  

Avoid:

  

\- Excessive crosses.

\- Overly ornate icons.

\- Game-like swords/shields unless heavily softened.

\- Aggressive achievement badges.

  

The app can use Christian symbolism, but it should not rely on symbols alone to feel Christian. The lived practice is the Christianity.

  
  

13\. Pixel Art System

  

Pixel art is one of BibleQuest’s differentiators.

  

It should feel:

  

\- Warm.

\- Small.

\- Handmade.

\- Tactile.

\- Spiritual without being kitschy.

\- Modern rather than retro arcade.

  

Pixel art should be used for:

  

\- Quest category glyphs.

\- Growth tree details.

\- Seasonal objects.

\- Tiny collectible moments.

\- Empty states.

\- Loading states.

\- Milestones.

\- Share cards.

  

Pixel objects:

  

\- Candle.

\- Leaf.

\- Flower.

\- Star.

\- Bird.

\- Journal.

\- Bookmark.

\- Chapel.

\- Bell.

\- Lantern.

\- Bread.

\- Fish.

\- Olive branch.

\- River.

\- Mountain.

\- Path stone.

\- Window light.

  

Pixel rules:

  

\- Keep objects small.

\- Do not overload screens with sprites.

\- Use limited palettes.

\- Avoid harsh black outlines unless stylistically softened.

\- Use subtle animation: flicker, sway, twinkle, drift.

\- Pixel art should support emotion, not become the entire interface.

  
  

14\. Illustration System

  

There are two illustration modes:

  

Mode A: Atmospheric Painted Illustration

  

Use for:

  

\- Landing page hero.

\- Major marketing sections.

\- Seasonal transitions.

\- Empty states with emotional weight.

\- App Store screenshots and promotional imagery.

  

Style:

  

\- Painterly.

\- Warm.

\- Cinematic.

\- Soft depth.

\- Natural scenes.

\- Light through windows.

\- Hills, trees, meadows, night skies, chapels, rivers.

  

Mode B: Pixel Illustration

  

Use for:

  

\- In-app delight.

\- Quest glyphs.

\- Growth details.

\- Milestones.

\- Small interactions.

  

The two modes should feel related through palette, warmth, and storybook tone.

  

Avoid:

  

\- AI fantasy excess.

\- Hyper-detailed religious paintings.

\- Generic stock illustrations.

\- Corporate vector people.

\- Overly cute mascot energy.

  
  

15\. Motion System

  

Motion should follow a principle:

  

The app is alive, but never restless.

  

Motion Categories

  

Ambient Motion

  

Always soft and optional. Examples: paper grain, candle flicker, tree sway, stars, drifting petals.

  

State Motion

  

Used to communicate transition: quest starts, reflection saved, prayer marked answered, verse bookmarked.

  

Reward Motion

  

Used gently: leaf grows, small flower appears, bird lands, journal page settles.

  

Navigation Motion

  

Use subtle page transitions, fade/slide, and native-feeling easing.

  

Scroll Motion

  

Landing page uses scrollytelling. App screens use normal scrolling with gentle reveals.

  

Reduced Motion

  

Must honor reduced-motion preferences. Replace motion with static state changes.

  

Motion Rules

  

\- No aggressive bounce.

\- No confetti explosions.

\- No endless distracting loops near text.

\- No motion that feels like ads or games trying to retain attention.

\- Animations should be under control, slow enough to feel intentional.

  
  

16\. Sound System

  

Sound should be optional and off by default or introduced carefully.

  

Possible soundscapes:

  

\- Morning birds.

\- Soft rain.

\- Candle room.

\- Forest.

\- Ocean.

\- Wind over hills.

\- Distant church bells.

\- Quiet monastery ambience.

  

Sound use cases:

  

\- Prayer timer.

\- Reflection mode.

\- Bible reading focus mode.

\- Seasonal sessions.

  

Rules:

  

\- Never autoplay unexpectedly.

\- Always provide mute.

\- Keep files lightweight.

\- Avoid cheesy religious music.

\- Avoid attention-grabbing reward sounds.

  
  

17\. Copywriting and Voice

  

BibleQuest’s voice should feel like a gentle spiritual companion.

  

Voice attributes:

  

\- Warm.

\- Clear.

\- Literary.

\- Reverent.

\- Encouraging.

\- Grounded.

\- Non-performative.

\- Never manipulative.

  

Core phrases:

  

\- “Your journey continues.”

\- “One small step today.”

\- “Begin when you’re ready.”

\- “Take a quiet moment.”

\- “Welcome back.”

\- “Small steps still count.”

\- “A quest is waiting.”

\- “Let this become part of your pilgrimage.”

\- “Carry this with you today.”

  

Quest copy structure:

  

Title: short and memorable.

Invitation: one sentence.

Why it matters: theological/practical grounding.

Scripture: supporting verse.

Reflection: one question.

Prayer: optional prompt.

  

Example:

  

Title: Encourage One Person

Invitation: Send a simple message to someone who may need kindness today.

Why it matters: Encouragement is one of the quiet ways love becomes visible.

Scripture: “Therefore encourage one another, and build each other up…” — 1 Thessalonians 5:11

Reflection: What changed in you when you chose encouragement?

Prayer: Lord, help me notice who needs kindness today.

  

Avoid:

  

\- Corporate productivity language.

\- Overly casual slang.

\- Theological overconfidence.

\- Guilt-based persuasion.

\- “Crush,” “dominate,” “optimize,” or “level up” language.

  
  

18\. Notifications Voice

  

Notifications should feel like gentle invitations.

  

Good:

  

\- “Today’s verse is ready.”

\- “A small quest is waiting when you are.”

\- “Take a quiet moment with God.”

\- “Your journey continues.”

\- “A prayer you wrote may be worth revisiting.”

\- “Sunday is a good day to return.”

  

Bad:

  

\- “You missed prayer.”

\- “Your streak is in danger.”

\- “Don’t disappoint God.”

\- “You’re falling behind.”

\- “Open now.”

  

Notification categories:

  

\- Verse reminder.

\- Quest reminder.

\- Prayer reminder.

\- Reflection reminder.

\- Sunday reminder.

\- Seasonal reminder.

\- Weekly recap.

  

The user must control frequency.

  
  

19\. Landing Page Design Direction

  

BibleQuest.us should not be a standard SaaS landing page.

  

It should be a scrollytelling essay.

  

Narrative arc:

  

1\. Opening: “What if growing closer to God felt less overwhelming?”

2\. The problem: people have access to Scripture but lack rhythm and direction.

3\. The turn: one verse, one prayer, one quest.

4\. The product: BibleQuest gives a meaningful step every day.

5\. The experience: living journal, quests, Bible, prayer, journey tree.

6\. The proof: show simulated app moments.

7\. The future: families, churches, seasonal pilgrimages, QuestOS.

8\. Closing: “Everyone’s journey with God is different. Everyone can take one step today.”

9\. CTA: Get BibleQuest.

  

Landing page structure:

  

\- Hero with atmospheric illustrated field or journal/tree scene.

\- Floating navigation pill.

\- Editorial headline.

\- Outlined CTA.

\- Scrollytelling belief panels.

\- Product demo cards.

\- Quest examples.

\- Growth tree section.

\- Prayer/journal section.

\- Bible reader section.

\- Premium/support section.

\- Church/family future section.

\- Final closing line.

  

The landing page should sell the feeling before the feature set.

  
  

20\. App Store / PWA Visual Direction

  

App icon should be simple, warm, and memorable.

  

Possible concepts:

  

\- A pixel leaf inside an open book.

\- A small candle and path marker.

\- A tree growing from a Bible page.

\- A bookmark shaped like a path.

\- A tiny chapel window glowing on parchment.

  

Avoid:

  

\- Generic cross-only logo.

\- Overly detailed Bible icon.

\- Dark aggressive icon.

\- Gold luxury emblem.

  

Screenshots should show:

  

\- Today’s verse.

\- A quest card.

\- Growth tree.

\- Prayer journal.

\- Bible reader.

\- Journey timeline.

  

Screenshot copy should be emotional, not feature-stuffed:

  

\- “One meaningful step today.”

\- “Turn Scripture into action.”

\- “Pray, reflect, and grow.”

\- “Your journey continues.”

  
  

21\. Dark Mode

  

Dark mode should exist, but it should not become the primary identity.

  

Dark mode should feel like:

  

\- Candlelight.

\- Night prayer.

\- Quiet chapel.

\- Moonlit paper.

  

Not:

  

\- AI lab.

\- Cyberpunk.

\- Pure black OLED tech app.

  

Dark tokens:

  

\- Night Ink: \#17171d

\- Deep Chapel: \#1f1f29

\- Moon Paper: \#efede4

\- Candle Gold: \#e5c36d

\- Muted Mist: \#393b39

\- Soft Ash: \#a8a8a0

  

Dark mode rules:

  

\- Preserve warmth.

\- Keep Bible text readable.

\- Avoid pure white text on pure black.

\- Use candlelit accents sparingly.

  
  

22\. Seasonal Design System

  

BibleQuest should feel alive across the Christian calendar.

  

Ordinary Time

  

Mood: growth, patience, daily faithfulness.

Colors: olive, parchment, soft sky.

Objects: leaves, fields, paths, birds.

  

Advent

  

Mood: waiting, hope, preparation.

Colors: blue, violet, candlelight.

Objects: stars, windows, candles, night sky.

  

Christmas

  

Mood: joy, warmth, generosity.

Colors: warm gold, cream, evergreen, rose.

Objects: lanterns, windows, snow, simple gifts.

  

Lent

  

Mood: reflection, discipline, repentance, quiet.

Colors: violet, ash, parchment, muted gold.

Objects: desert, stones, simple candle, journal.

  

Holy Week

  

Mood: reverence, stillness, sacrifice.

Colors: deep violet, charcoal, candlelight.

Objects: palms, shadows, quiet road.

  

Easter

  

Mood: light, renewal, life, joy.

Colors: ivory, gold, rose, fresh green.

Objects: sunrise, flowers, open field, birds.

  

Pentecost

  

Mood: courage, spirit, movement.

Colors: warm red accents, gold, parchment.

Objects: flame, wind, small sparks.

  

Seasonal rules:

  

\- Shift accent colors and illustrations.

\- Do not redesign the entire app per season.

\- Seasonal content should be optional and gentle.

\- The app should still feel like BibleQuest.

  
  

23\. Premium Visual Language

  

BibleQuest Plus should not look like a paywall casino.

  

Premium should feel like:

  

\- Deeper guidance.

\- More thoughtful tools.

\- More beautiful reflection.

\- Support for the mission.

  

Premium surfaces can use:

  

\- Candle Gold accents.

\- Subtle illuminated borders.

\- Richer illustrated cards.

\- A quiet “Plus” glyph.

  

Do not use:

  

\- Flashy upgrade banners.

\- Locked icons everywhere.

\- Aggressive scarcity copy.

\- Spiritual guilt to convert.

  

Good premium copy:

  

“Go deeper with guided reflections, personalized quests, and long-term spiritual insights.”

  

Bad premium copy:

  

“Unlock your full relationship with God.”

  

The free app must feel spiritually complete.

  
  

24\. Accessibility Standards

  

BibleQuest must be accessible from the beginning.

  

Requirements:

  

\- High contrast for text.

\- Dynamic type / scalable font support.

\- Reduced motion support.

\- Keyboard navigation on desktop.

\- Screen reader labels.

\- Clear focus states.

\- Large tap targets.

\- Avoid text embedded in images.

\- Avoid color-only meaning.

\- Comfortable Bible reading size.

\- Clear language.

  

Spiritual apps must be especially accessible because users may interact during stress, grief, fatigue, anxiety, or quiet prayer.

  

The app should never punish users with cognitive overload.

  
  

25\. Design QA Checklist

  

Before any screen ships, ask:

  

\- Does this screen feel peaceful?

\- Is there one clear next action?

\- Does it use paper surfaces correctly?

\- Is the typography calm and readable?

\- Are borders and shadows subtle?

\- Is color used sparingly?

\- Does motion have meaning?

\- Is there any guilt-based copy?

\- Does this feel like BibleQuest rather than a generic app?

\- Would this still look good in five years?

\- Does it respect prayer and journal privacy?

\- Can the user leave the app with clarity?

  

If the answer is no, redesign.

  
  

26\. Implementation Notes for Claude Code

  

When implementing the design system:

  

\- Create CSS variables for all tokens.

\- Create Tailwind theme extensions.

\- Build custom BibleQuest components instead of relying on default shadcn styling.

\- Use shadcn only as accessible primitives, not visual identity.

\- Create a dedicated design tokens file.

\- Create reusable card variants: paper, linen, atmospheric, quest, verse, prayer, reflection.

\- Create typography utilities for editorial headings and UI labels.

\- Create seasonal theme architecture early.

\- Create reduced-motion variants early.

\- Create pixel icon components as simple SVG/CSS/pixel blocks or importable assets.

\- Keep component names meaningful and product-specific.

  

Suggested component names:

  

\- PaperCard

\- VerseCard

\- QuestSlip

\- PrayerPage

\- ReflectionPage

\- JourneyTimeline

\- GrowthTree

\- PixelCandle

\- PixelLeaf

\- PixelStar

\- SeasonalAtmosphere

\- EditorialSection

\- PilgrimageMarker

\- GentleButton

\- BibleReader

  

This helps the codebase preserve the brand language.

  
  

27\. The Non-Negotiable Design Standard

  

BibleQuest should never look like a template.

  

If the first build looks like a generic Tailwind dashboard, it has failed the design brief.

  

If it looks like a generic Bible app with badges, it has failed the design brief.

  

If it looks like a productivity app with Bible verses, it has failed the design brief.

  

If it feels peaceful, warm, editorial, gently alive, and spiritually useful, it is on the right path.

  

The goal is not to build the most feature-rich Christian app.

  

The goal is to build the Christian app people want to keep for years.

  
  

END OF EXPANSION PASS 1 — VOLUME III

  
  
  
  

EXPANSION PASS 2 — VOLUME IV: UX BIBLE

  

This pass defines the user experience system for BibleQuest. It should guide every screen, flow, state, interaction, and product decision for the launch-ready Progressive Web App.

  

The UX goal is not to maximize usage. The UX goal is to help the user complete one meaningful spiritual action with peace and clarity.

  

BibleQuest must feel less like a dashboard and more like a living devotional journal.

  
  

1\. UX Thesis

  

Most Bible apps begin with content.

  

BibleQuest begins with direction.

  

The user should never open BibleQuest and feel lost. The app should gently answer:

  

\- What is today’s invitation?

\- What should I read?

\- What should I pray?

\- What should I do?

\- What should I reflect on?

\- How is my journey growing over time?

  

BibleQuest UX should reduce spiritual overwhelm by presenting one meaningful next step at a time.

  

The interface should feel like a quiet guide, not a command center.

  
  

2\. Core UX Principles

  

1\. Start with today.

  

The app should always orient the user around today’s journey. Long-term growth matters, but the daily invitation comes first.

  

2\. One primary action per screen.

  

Each screen may contain secondary actions, but only one action should feel primary.

  

3\. Let users return without shame.

  

There should be no punitive missed-day states. Return moments should be warm.

  

4\. Make spiritual writing feel sacred.

  

Prayer and reflection inputs should feel like journal pages, not generic forms.

  

5\. Make progress feel organic.

  

Use pilgrimage, growth, tree, seasons, and journal accumulation instead of XP obsession.

  

6\. Keep the Bible close.

  

Scripture should be accessible from every meaningful journey, but not forced awkwardly into every screen.

  

7\. Avoid feature clutter.

  

BibleQuest can be deep, but the surface should remain simple.

  

8\. Honor privacy.

  

Prayer, reflection, and journal content should feel protected by default.

  

9\. Let the app breathe.

  

Whitespace is part of the spiritual experience.

  

10\. Design for two-minute sessions and twenty-minute sessions.

  

Both should feel complete.

  
  

3\. Global App Structure

  

Primary app navigation:

  

\- Home

\- Quests

\- Bible

\- Prayer

\- Journey

  

Secondary areas:

  

\- Profile

\- Settings

\- Plus

\- Onboarding

\- Legal

\- Support

\- Church Mode scaffold

\- Family/Group scaffold

\- Admin/CMS scaffold for future

  

The launch app should not expose unfinished areas as broken pages. Future features may appear as polished “coming later” cards where appropriate.

  
  

4\. App Shell

  

The App Shell is the container for the installed PWA experience.

  

Required elements:

  

\- Safe-area aware layout.

\- Bottom navigation on mobile.

\- Optional top header with greeting/context.

\- Parchment canvas background.

\- Paper card content rhythm.

\- Offline indicator when relevant.

\- Gentle loading states.

\- Toast system for saves/completions.

  

Mobile bottom navigation:

  

Home — daily return point.

Quests — all quest browsing and selection.

Bible — reading and verse discovery.

Prayer — prayer journal and requests.

Journey — growth history and timeline.

  

Navigation behavior:

  

\- Active state should be subtle.

\- Icons should be readable but not loud.

\- Navigation should never feel like a game HUD.

\- On scroll, bottom nav may remain fixed.

\- Respect iOS PWA safe areas.

  

Desktop layout:

  

\- Keep the same primary sections.

\- Use centered max-width content.

\- Bible reader may gain a side rail.

\- Journey may use a wider timeline.

\- Avoid turning desktop into a heavy admin dashboard.

  
  

5\. Landing Page UX

  

BibleQuest.us should be a scrollytelling landing page, not a generic SaaS page.

  

Primary goal:

  

Make the visitor understand the feeling and promise of BibleQuest before listing features.

  

Landing page narrative:

  

1\. Hero: “What if growing closer to God felt less overwhelming?”

2\. Problem: Access is not the issue. Direction is.

3\. Belief: One meaningful step can change a day.

4\. Product reveal: BibleQuest gives a verse, prayer, reflection, and quest.

5\. Demonstration: Show today’s journey card, quest slip, prayer page, growth tree.

6\. Differentiation: Not a streak app. A pilgrimage.

7\. Free promise: Core spiritual growth is free.

8\. Plus/Patron: Go deeper or support the mission.

9\. Church/family future: Built for personal growth now, shared growth later.

10\. Closing: “Begin with one step.”

  

Landing page sections:

  

\- Floating nav.

\- Atmospheric hero.

\- Editorial thesis sections.

\- Product demo cards.

\- Quest examples.

\- Growth tree section.

\- Prayer and reflection section.

\- Bible reader section.

\- Premium/support section.

\- FAQ.

\- Final CTA.

  

Landing page CTA labels:

  

\- Begin your journey.

\- Get BibleQuest.

\- Join the waitlist, if prelaunch.

\- Open the app, if launched.

  

Avoid:

  

\- Feature grid overload.

\- Loud pricing block too early.

\- Fear-based religious copy.

\- Overpromising transformation.

  
  

6\. Onboarding UX

  

Onboarding should feel like opening the first page of a journal.

  

Goal:

  

Personalize the first journey without making the user feel interrogated.

  

Onboarding length:

  

Prefer 5–7 short steps maximum.

  

Onboarding steps:

  

Step 1 — Welcome

  

Copy direction:

  

“Welcome to BibleQuest. One verse, one prayer, one quest, one step at a time.”

  

Primary CTA:

  

Begin.

  

Step 2 — What brings you here?

  

Options:

  

\- Grow closer to God.

\- Read Scripture more often.

\- Build a prayer habit.

\- Practice kindness.

\- Return to faith.

\- Explore Christianity.

\- Support my family/church life.

  

Step 3 — Your tradition, optional

  

Options:

  

\- Catholic.

\- Protestant.

\- Orthodox.

\- Non-denominational.

\- Exploring.

\- Prefer not to say.

  

This should be optional and framed gently. Do not make users feel excluded.

  

Step 4 — Daily rhythm

  

Options:

  

\- Morning.

\- Afternoon.

\- Evening.

\- Flexible.

  

Step 5 — Quest style

  

Options:

  

\- Quiet and reflective.

\- Scripture-focused.

\- Service-focused.

\- Kindness-focused.

\- Discipline-focused.

\- Surprise me.

  

Step 6 — Calling, optional

  

Options:

  

\- Student.

\- Parent.

\- Creative.

\- Business owner.

\- Teacher.

\- Healthcare worker.

\- Caregiver.

\- Athlete.

\- New believer.

\- Returning to faith.

\- Retired.

\- Prefer not to say.

  

Step 7 — First journey generated

  

Show:

  

\- Today’s verse.

\- First quest.

\- Prayer prompt.

  

CTA:

  

Begin today’s journey.

  

Onboarding rules:

  

\- Allow skip where possible.

\- Avoid guilt.

\- Avoid long forms.

\- Save progress.

\- Let users change settings later.

\- Make first success fast.

  
  

7\. Home Screen UX

  

The Home screen is the spiritual daily cockpit, but it should not look like a cockpit.

  

It should feel like the day’s journal page.

  

Primary purpose:

  

Give the user one clear next step.

  

Required Home sections:

  

1\. Greeting

  

Examples:

  

“Good morning, Brendan.”

“Your journey continues.”

“Welcome back.”

“Begin with one small step.”

  

The greeting should adapt by time of day and return state.

  

2\. Today’s Verse Card

  

Show:

  

\- Verse text.

\- Reference.

\- Save action.

\- Share action scaffold.

\- “Reflect on this” secondary action.

  

3\. Today’s Quest Card

  

Show the primary quest of the day.

  

Required:

  

\- Quest title.

\- Duration.

\- Category.

\- Invitation copy.

\- Supporting Scripture reference.

\- Begin button.

\- Reroll/change option if allowed.

  

4\. Quick Prayer

  

Small card or button:

  

“Take one quiet minute.”

  

This can open prayer timer or quick prayer entry.

  

5\. Growth Tree Preview

  

Show the user’s tree/pilgrimage growth.

  

Do not over-focus on numbers.

  

6\. Reflection Prompt

  

If quest completed, prompt reflection.

  

If not, show a gentle optional prompt tied to verse.

  

7\. Continue Reading

  

Show last Bible location or recommended daily reading.

  

8\. Recent Growth

  

Show 1–3 recent meaningful actions.

  

Home states:

  

New user:

  

\- Show first journey.

\- Avoid empty timeline.

\- Use encouraging copy.

  

Returning daily user:

  

\- Show today’s journey.

\- Continue where they left off.

  

Missed days user:

  

\- “Welcome back. Your journey continues.”

\- Never mention failure.

  

Quest completed user:

  

\- Show reflection prompt as primary action.

\- Growth tree updates gently.

  

Full daily journey completed:

  

\- Show peaceful completion state.

\- Suggest Bible reading, prayer, or simply “Carry this with you today.”

  
  

8\. Quests UX

  

Quests are the core differentiator.

  

Primary purpose:

  

Help users practice faith through small, meaningful actions.

  

Quests screen structure:

  

\- Header: “Today’s Quests” or “Choose a Quest.”

\- Duration filter: 5m, 10m, 15m, 30m, 1h, Half Day, Full Day.

\- Category filters.

\- Featured daily quest.

\- Quest list/cards.

\- Seasonal quest section.

\- Saved quests scaffold.

  

Quest card anatomy:

  

\- Pixel/icon marker.

\- Title.

\- Duration.

\- Category.

\- One-line invitation.

\- Scripture reference.

\- Difficulty/energy label.

\- Begin CTA.

  

Quest detail screen:

  

Required sections:

  

\- Title.

\- Duration/category metadata.

\- Invitation.

\- Why it matters.

\- Scripture.

\- Steps, if needed.

\- Prayer before starting.

\- Begin quest.

\- Mark complete.

\- Reflection after completion.

  

Quest completion flow:

  

1\. User taps “Mark complete.”

2\. Show gentle completion state.

3\. Ask reflection question.

4\. User can write or skip.

5\. Save reflection.

6\. Growth tree updates.

7\. Journey timeline receives entry.

  

Completion copy examples:

  

\- “This became part of your journey.”

\- “A small act, faithfully done.”

\- “Your tree grew today.”

\- “Carry this with you.”

  

Rerolling quests:

  

Allow users to choose a different quest without shame.

  

Copy:

  

“Need something different today?”

  

Do not say:

  

“Skip.”

“Give up.”

“Reject quest.”

  

Quest filters:

  

\- Time.

\- Energy.

\- Solo/social.

\- Indoor/outdoor.

\- Category.

\- Tradition/denomination, if relevant.

  

Quest empty states:

  

If no quests match filters:

  

“Nothing here yet. Try a shorter quest or clear a filter.”

  

If offline:

  

“Saved quests are available offline. New quests will appear when you reconnect.”

  
  

9\. Bible UX

  

The Bible reader should be beautiful, readable, and calm.

  

Primary purpose:

  

Help users read Scripture without friction.

  

Bible section structure:

  

\- Search scaffold.

\- Continue reading card.

\- Daily reading/verse.

\- Book list.

\- Reading plans scaffold.

\- Bookmarks/highlights/notes.

  

Book list UX:

  

\- Old Testament.

\- New Testament.

\- Optional grouping by genre later.

\- Search by book name.

  

Chapter reader UX:

  

Required:

  

\- Book/chapter header.

\- Translation label.

\- Previous/next chapter.

\- Verse text with readable spacing.

\- Tap verse to highlight/bookmark/note.

\- Save progress.

\- Offline support scaffold.

  

Verse interaction sheet:

  

Actions:

  

\- Bookmark.

\- Highlight.

\- Add note.

\- Copy.

\- Share card scaffold.

\- Ask Guide, premium scaffold.

  

Bible reading modes:

  

\- Standard reading.

\- Focus mode.

\- Night/candle mode.

\- Large text mode.

  

Bible UX rules:

  

\- Do not overload the reader with toolbars.

\- Keep controls accessible but quiet.

\- Bible text should be treated with visual dignity.

\- Notes and highlights should feel like margins, not clutter.

  

Translation licensing:

  

V1 should use public-domain translation unless licensed translations are configured.

  

The UI should make translation clear.

  
  

10\. Prayer UX

  

Prayer is private, sensitive, and central.

  

Primary purpose:

  

Help users speak honestly with God and remember what they are carrying.

  

Prayer section structure:

  

\- Quick prayer.

\- Prayer journal.

\- Prayer requests.

\- Answered prayers.

\- Categories.

\- Prayer timer.

\- Reminder preferences.

  

Prayer home states:

  

No prayers yet:

  

“This can be a quiet place to bring what you’re carrying.”

  

Existing prayers:

  

Show recent prayers with privacy-first cards.

  

Prayer entry form:

  

Fields:

  

\- Title, optional.

\- Prayer body.

\- Category.

\- Status: active / answered / archived.

\- Reminder, optional.

\- Private indicator.

  

The form should feel like a journal page.

  

Answered prayer flow:

  

When user marks prayer answered:

  

\- Ask optional reflection: “How would you like to remember this?”

\- Move to answered prayers.

\- Add journey entry.

\- Growth tree can show a subtle flower/light moment.

  

Privacy UX:

  

\- Make “private by default” visible but not scary.

\- Settings should explain data handling clearly.

\- Do not show prayer content in analytics or public/community areas by default.

  

Prayer timer UX:

  

\- Simple duration options: 1m, 3m, 5m, 10m.

\- Candle animation optional.

\- End state: “Amen” / “Save a note” / “Return home.”

  
  

11\. Reflection UX

  

Reflection turns action into memory.

  

Primary purpose:

  

Help the user notice what happened spiritually or emotionally.

  

Reflection entry points:

  

\- After quest completion.

\- From daily verse.

\- From Prayer.

\- From Journey.

\- From Home prompt.

  

Reflection form:

  

\- Prompt at top.

\- Optional mood selector.

\- Freeform text.

\- Related quest/verse auto-attached when relevant.

\- Save privately.

  

Reflection prompts:

  

\- What did you notice?

\- Where did you see God today?

\- What felt difficult?

\- What are you grateful for?

\- What changed in you?

\- What would you like to bring to prayer?

  

Reflection completion:

  

\- Save to Journey.

\- Optional growth tree update.

\- Optional prompt to pray.

  

UX rule:

  

Reflection should never feel like homework. It is always optional, but clearly valuable.

  
  

12\. Journey UX

  

Journey is the long-term memory of BibleQuest.

  

Primary purpose:

  

Show the user that small faithful actions are becoming a life pattern.

  

Journey sections:

  

\- Pilgrimage overview.

\- Growth tree.

\- Timeline.

\- Milestones.

\- Weekly recap.

\- Monthly recap scaffold.

\- Year in Review scaffold.

\- Favorite verses.

\- Answered prayers.

  

Pilgrimage language:

  

Use “Pilgrimage” or “Journey,” not “stats dashboard.”

  

Timeline entries:

  

\- Quest completed.

\- Reflection written.

\- Prayer created.

\- Prayer answered.

\- Bible chapter read.

\- Milestone reached.

  

Timeline design:

  

Should feel like accumulated journal pages, markers, or pressed flowers, not a social feed.

  

Growth tree UX:

  

The tree is the emotional center of Journey.

  

Tree states:

  

\- Seed.

\- Sprout.

\- Young Tree.

\- Olive Tree.

\- Fruit Bearing Tree.

\- Sheltering Tree.

  

Action mapping:

  

\- Prayer: roots.

\- Scripture: branches.

\- Kindness: leaves.

\- Service: fruit.

\- Reflection: sunlight.

\- Gratitude: flowers.

  

Never show tree decay as punishment.

  

Return state:

  

If user returns after absence:

  

“Your tree has been waiting. Continue with one small step.”

  

Milestones:

  

Milestones should be gentle and meaningful.

  

Examples:

  

\- First Quest.

\- First Prayer.

\- First Reflection.

\- Seven Days of Scripture.

\- Encourager.

\- Patient Heart.

\- Servant Heart.

\- Quiet Strength.

\- Gratitude Week.

  

Avoid childish badge explosions.

  
  

13\. Settings UX

  

Settings should be clear, respectful, and privacy-forward.

  

Settings sections:

  

\- Account.

\- Profile.

\- Tradition/denomination.

\- Daily rhythm.

\- Quest preferences.

\- Notification preferences.

\- Appearance.

\- Accessibility.

\- Privacy and data.

\- Subscription.

\- Support.

\- Legal.

  

Important settings:

  

Daily verse frequency:

  

\- Morning.

\- Afternoon.

\- Evening.

\- Random.

\- Multiple daily.

\- Off.

  

Quest preference:

  

\- Quest duration preference.

\- Quest categories.

\- Energy level.

\- Solo/social.

\- Calling.

  

Appearance:

  

\- Light.

\- Dark.

\- System.

\- Reduced motion.

\- Text size.

  

Privacy:

  

\- Export data scaffold.

\- Delete account scaffold.

\- AI usage explanation.

\- Prayer/reflection privacy explanation.

  

Settings copy should be plain and trustworthy.

  
  

14\. Profile UX

  

Profile should not become vanity.

  

Primary purpose:

  

Let the user manage identity, rhythm, and pilgrimage preferences.

  

Profile may show:

  

\- First name.

\- Tradition, optional.

\- Calling, optional.

\- Current pilgrimage stage.

\- Favorite verse, optional.

\- Joined date.

  

Avoid:

  

\- Follower counts.

\- Public holiness stats.

\- Competitive badges.

  
  

15\. Premium / Plus UX

  

Premium should feel like support and depth, not restriction.

  

Plus page structure:

  

\- Calm headline.

\- Explain free promise.

\- Explain Plus benefits.

\- Explain Patron support.

\- Pricing cards.

\- FAQ.

\- Transparency statement.

  

Copy direction:

  

“BibleQuest is free for the essentials. Plus helps you go deeper and supports continued development.”

  

Plus benefits:

  

\- AI Guide.

\- Personalized quests.

\- Advanced reading plans.

\- Reflection insights.

\- Voice journaling.

\- Premium themes.

\- Family prayer groups.

\- Year in Review.

\- Enhanced offline/cross-device sync.

  

Patron:

  

For users who want to support the mission without needing more features.

  

Do not:

  

\- Put locks everywhere.

\- Make free users feel lesser.

\- Suggest premium users are closer to God.

  
  

16\. AI Guide UX

  

AI Guide is a future/premium scaffold.

  

The Guide should not feel like ChatGPT inside a Bible app.

  

It should feel like a patient librarian or study companion.

  

Entry points:

  

\- Ask about a passage.

\- Find verses by feeling/topic.

\- Generate prayer draft.

\- Suggest quest.

\- Summarize reflection themes.

\- Build reading plan.

  

Required disclaimers:

  

\- AI commentary is not Scripture.

\- AI is not clergy.

\- For serious pastoral, mental health, abuse, or crisis issues, speak with trusted people/professionals.

  

Tone:

  

\- Gentle.

\- Humble.

\- Clear.

\- Non-authoritarian.

  

Avoid:

  

\- “God says you should…”

\- Definitive claims on disputed theology.

\- Replacing priests/pastors/spiritual directors.

  
  

17\. Notifications UX

  

Notifications should be opt-in and user-controlled.

  

Notification setup should happen after the user receives value, not immediately on first launch.

  

Prompt moment:

  

After first quest or first reflection:

  

“Would you like a gentle reminder for tomorrow?”

  

Notification types:

  

\- Verse.

\- Quest.

\- Prayer.

\- Reflection.

\- Sunday.

\- Seasonal.

\- Weekly recap.

  

Frequency controls:

  

\- Off.

\- Daily.

\- Selected days.

\- Morning/afternoon/evening.

  

Tone examples:

  

\- “Today’s verse is ready.”

\- “A small quest is waiting when you are.”

\- “Take a quiet moment.”

\- “Your journey continues.”

  

Do not use urgency or streak-threat language.

  
  

18\. Offline UX

  

BibleQuest should remain useful offline.

  

V1 offline support:

  

\- App shell fallback.

\- Recently loaded Bible content.

\- Saved quests.

\- Local draft prayers/reflections.

\- Sync when connection returns.

  

Offline state copy:

  

“You’re offline. Saved pages and drafts are still here.”

  

When sync succeeds:

  

“Saved.”

  

Avoid alarming network errors.

  
  

19\. Empty States

  

Empty states are moments of invitation.

  

Prayer empty state:

  

“This can be a quiet place to bring what you’re carrying.”

  

Reflection empty state:

  

“Your reflections will gather here over time.”

  

Journey empty state:

  

“Your pilgrimage begins with one small step.”

  

Bookmarks empty state:

  

“Save verses you want to return to.”

  

Quests filtered empty state:

  

“No quests match that yet. Try a shorter time or a different category.”

  

Empty states should include one clear action.

  
  

20\. Error States

  

Errors should be calm, honest, and useful.

  

General error:

  

“Something didn’t load correctly. Try again in a moment.”

  

Save error:

  

“We couldn’t save this yet. Your draft is still here.”

  

Auth error:

  

“That sign-in link did not work. Request a new one.”

  

Offline error:

  

“You’re offline. We’ll sync when you reconnect.”

  

Never use technical stack traces in user UI.

  
  

21\. Loading States

  

Loading states should match the brand.

  

Examples:

  

\- Tiny pixel candle flicker.

\- Paper shimmer.

\- Leaf drift.

\- Simple text: “Preparing today’s journey…”

  

Avoid generic spinners where possible.

  

Loading should never block unnecessarily.

  
  

22\. Authentication UX

  

Auth should be low-friction.

  

Supported flows:

  

\- Guest mode scaffold, if feasible.

\- Email magic link.

\- Email/password if needed.

\- Google/Apple auth scaffold later.

  

Auth principles:

  

\- Let users explore before forcing account creation if possible.

\- Explain why account helps: sync, privacy, saved prayers, journey history.

\- Do not make authentication feel like a wall before spiritual value.

  

Account deletion and data export must be scaffolded.

  
  

23\. Privacy UX

  

Privacy should be visible but not scary.

  

Key messages:

  

\- “Your prayers and reflections are private by default.”

\- “We do not sell your personal data.”

\- “Analytics never include prayer or journal text.”

\- “You control what you share.”

  

Privacy touchpoints:

  

\- Onboarding.

\- Prayer first use.

\- Reflection first use.

\- AI Guide first use.

\- Settings.

  
  

24\. Church / Group Future UX

  

Do not build full Church Mode in V1, but scaffold the UX direction.

  

Future Church Mode may include:

  

\- Church-created quests.

\- Reading plans.

\- Prayer circles.

\- Small groups.

\- Announcements.

\- Events.

\- Group reflections.

  

UX rules:

  

\- No holiness leaderboards.

\- No public pressure.

\- Private by default.

\- Group participation should encourage, not compare.

  

Future group language:

  

\- Circle.

\- Small group.

\- Parish.

\- Church.

\- Family.

  

Avoid social media language:

  

\- Followers.

\- Likes.

\- Ranking.

\- Viral.

  
  

25\. First-Run Experience

  

The first 60 seconds matter.

  

Ideal first-run flow:

  

1\. User opens BibleQuest.

2\. Sees warm hero/welcome.

3\. Completes short onboarding.

4\. Receives first verse.

5\. Receives first quest.

6\. Completes or saves quest.

7\. Writes optional reflection.

8\. Sees first growth tree moment.

  

The first session should not ask for too many permissions.

  

Do not ask for notifications before the user experiences value.

  
  

26\. Return Experience

  

Returning after one day:

  

“Good morning. Your journey continues.”

  

Returning after a week:

  

“Welcome back. Begin again with one small step.”

  

Returning after months:

  

“Your journal is still here. Start with today.”

  

Never:

  

“You lost your streak.”

“You failed your goal.”

“You are behind.”

  
  

27\. Core Launch User Flows

  

Flow A — Complete Daily Journey

  

Open app → Home → Read verse → Begin quest → Mark complete → Reflect → Prayer prompt → Growth tree update → Journey entry.

  

Flow B — Read Bible

  

Open app → Bible → Select book → Select chapter → Read → Tap verse → Bookmark/highlight/note → Continue reading saved.

  

Flow C — Create Prayer

  

Open app → Prayer → New Prayer → Write → Categorize → Save → Optional reminder → Prayer appears in journal.

  

Flow D — Answer Prayer

  

Prayer → Select prayer → Mark answered → Optional reflection → Save → Journey entry.

  

Flow E — Return After Absence

  

Open app → Warm return copy → Today’s verse/quest → Continue without penalty.

  

Flow F — Subscribe

  

Plus page → Understand free promise → Choose Plus/Patron → Provider checkout scaffold → Return success state → Premium status reflected.

  

Flow G — Offline Draft

  

Open app offline → Create reflection/prayer → Save locally → Connection returns → Sync → Confirm saved.

  
  

28\. UX Acceptance Criteria for Claude Code

  

For launch V1, Claude should implement:

  

\- Mobile-first app shell with bottom navigation.

\- Landing page with editorial scrollytelling structure.

\- Onboarding flow with stored preferences.

\- Home screen with daily verse, quest, prayer, growth, reflection, continue reading.

\- Quest list, filters, detail, completion, reflection flow.

\- Bible book/chapter reader using public-domain seed or content scaffold.

\- Prayer journal CRUD.

\- Reflection journal CRUD.

\- Journey timeline and growth tree.

\- Settings with notification/preferences/privacy scaffolds.

\- Premium page and subscription scaffolding.

\- Empty, loading, offline, and error states.

\- Privacy-forward UX copy.

\- PWA install readiness.

  

Do not ship:

  

\- Broken placeholder routes.

\- Generic dashboard UI.

\- Shame-based streak states.

\- Unfinished AI chat pretending to be spiritual authority.

\- Social features without privacy controls.

  
  

29\. UX QA Checklist

  

Before approving any UX flow, ask:

  

\- Does the user know what to do next?

\- Does the screen feel peaceful?

\- Is there only one primary action?

\- Is the language invitational?

\- Can the user skip or return without shame?

\- Is private content treated with care?

\- Does the UI feel like paper/journal rather than dashboard?

\- Does motion support meaning?

\- Does this flow work in two minutes?

\- Does this flow still work for a user with anxiety, fatigue, grief, or low attention?

\- Does it honor the Design Constitution?

  

If not, revise.

  
  

30\. UX North Star

  

The best BibleQuest session is not the longest one.

  

The best session is the one where the user leaves with peace and does something faithful in real life.

  

BibleQuest should guide, then get out of the way.

  

END OF EXPANSION PASS 2 — VOLUME IV

  
  
  

EXPANSION PASS 3 — VOLUME V: PRODUCT REQUIREMENTS DOCUMENT

  

This pass defines the launch-ready product scope for BibleQuest V1 and the structured roadmap beyond V1. It should be treated as the product requirements document for Claude Code Fable 5 Ultracode and any future product/design/engineering collaborator.

  

The purpose of this PRD is to prevent BibleQuest from becoming either too small to matter or too large to ship.

  

V1 should be emotionally complete, technically solid, and architecturally ready for growth.

  
  

1\. Product Summary

  

BibleQuest is a mobile-first Progressive Web App that helps Christians grow closer to God through Scripture, prayer, reflection, and daily quests.

  

Core product promise:

  

One verse. One prayer. One quest. One step closer to God today.

  

The product should not feel like a Bible app with badges. It should feel like a living devotional journal that gives the user one meaningful spiritual invitation every day.

  
  

2\. Launch Goal

  

The V1 launch goal is to ship a polished, installable PWA at BibleQuest.us that users can actually return to daily.

  

V1 must include:

  

\- A beautiful landing page.

\- A mobile-first app shell.

\- Account/auth scaffold.

\- Onboarding.

\- Daily Home screen.

\- Verse of the Day.

\- Quest system.

\- Bible reader scaffold with public-domain content or structured seed data.

\- Prayer journal.

\- Reflection journal.

\- Journey timeline.

\- Growth tree.

\- Settings.

\- Premium/Plus scaffold.

\- PWA manifest.

\- Offline fallback.

\- Supabase-ready database schema.

\- Deployment and setup docs.

  

V1 does not need full AI, full Church Mode, full paid subscriptions, full Bible licensing, full native iOS, or full social/community features.

  

It must, however, be built so those can be added cleanly.

  
  

3\. Target Users

  

Primary User: The Everyday Christian

  

A person who wants to grow spiritually but struggles with consistency, direction, or overwhelm.

  

Needs:

  

\- A simple daily rhythm.

\- Encouragement without guilt.

\- Bible reading guidance.

\- Prayer habit support.

\- Real-life actions of faith.

  

Secondary User: The Returning Christian

  

A person who has drifted from spiritual habits and wants a gentle way back.

  

Needs:

  

\- Warm onboarding.

\- No shame language.

\- Short quests.

\- Simple prayers.

\- A sense of welcome.

  

Secondary User: The Busy Believer

  

A parent, worker, student, caregiver, or business owner who wants spiritual habits that fit into a real life.

  

Needs:

  

\- 5–15 minute quests.

\- Flexible reminders.

\- Quick prayers.

\- Offline access.

\- Low-friction journaling.

  

Secondary User: The Explorer

  

Someone exploring Christianity who wants a non-intimidating entry point.

  

Needs:

  

\- Clear explanations.

\- Optional tradition selection.

\- No denominational assumptions.

\- Basic Bible guidance.

\- Gentle language.

  

Future User: Church/Group Leader

  

A pastor, priest, small-group leader, parent, or ministry leader who wants shared spiritual practices.

  

Needs later:

  

\- Custom quests.

\- Reading plans.

\- Prayer circles.

\- Group reminders.

\- Privacy controls.

  
  

4\. Product Principles

  

V1 must obey these principles:

  

1\. Free is spiritually complete.

  

A free user must be able to read Scripture, pray, reflect, complete quests, and grow.

  

2\. Premium deepens; it never gatekeeps God.

  

Premium features should add personalization, insights, themes, and convenience. They must never imply paid users have better access to faith.

  

3\. The daily loop matters more than the feature list.

  

A small excellent loop is better than a huge unfinished app.

  

4\. Journal content is sacred.

  

Prayers and reflections require privacy, clarity, and trust.

  

5\. Growth is organic.

  

Use pilgrimage and tree growth instead of punitive streaks or aggressive gamification.

  

6\. Architecture should outlive V1.

  

BibleQuest is the first expression of QuestOS. Do not hard-code everything in ways that block future providers.

  
  

5\. V1 Feature Inventory

  

A. Public Landing Page

  

Purpose:

  

Introduce BibleQuest, communicate the product promise, and drive users into the app/waitlist/install flow.

  

Requirements:

  

\- Responsive landing page.

\- Editorial scrollytelling structure.

\- Hero section.

\- Product demonstration sections.

\- Quest examples.

\- Growth tree explanation.

\- Prayer/journal explanation.

\- Bible reader explanation.

\- Plus/Patron scaffold.

\- FAQ.

\- Final CTA.

\- Basic SEO metadata.

\- Open Graph metadata.

\- Privacy/terms links.

  

Acceptance criteria:

  

\- Loads quickly on mobile.

\- Clearly communicates what BibleQuest does in under 10 seconds.

\- Has at least two CTA placements.

\- Does not look like a generic SaaS landing page.

\- Uses Living Editorial design language.

  
  

B. Authentication and Account System

  

Purpose:

  

Allow users to save prayers, reflections, progress, preferences, and journey history.

  

V1 options:

  

\- Supabase Auth.

\- Email/password or magic link.

\- Optional Google auth scaffold if easy.

\- Guest mode scaffold if feasible.

  

Requirements:

  

\- Sign up.

\- Sign in.

\- Sign out.

\- Persist session.

\- Profile creation on first auth.

\- Secure user-owned data with RLS.

  

Acceptance criteria:

  

\- User can create account and return with saved data.

\- Private records are inaccessible to other users.

\- Auth errors have calm, clear copy.

\- App can run with mock/local mode if env vars are missing during development.

  
  

C. Onboarding

  

Purpose:

  

Personalize the first journey and introduce BibleQuest’s tone.

  

Requirements:

  

\- Welcome screen.

\- Reason for using BibleQuest.

\- Tradition/denomination optional.

\- Daily rhythm preference.

\- Quest style preference.

\- Calling/life context optional.

\- First journey preview.

  

Data captured:

  

\- primary\_goal

\- tradition

\- daily\_rhythm

\- quest\_preferences

\- calling

\- notification\_preference scaffold

  

Acceptance criteria:

  

\- User can complete onboarding in under 2 minutes.

\- User can skip optional questions.

\- User receives a first verse and quest.

\- Onboarding state is saved.

  
  

D. Home Screen

  

Purpose:

  

Serve as the daily spiritual landing page.

  

Requirements:

  

\- Greeting.

\- Date/day context.

\- Today’s verse card.

\- Today’s quest card.

\- Quick prayer entry.

\- Reflection prompt.

\- Growth tree preview.

\- Continue Bible reading.

\- Recent journey activity.

  

Acceptance criteria:

  

\- One primary action is visually obvious.

\- Home adapts to user state: new, returning, completed, missed days.

\- No shame-based copy.

\- Home remains calm on mobile.

  
  

E. Quest System

  

Purpose:

  

Turn Scripture and faith into real-life action.

  

Requirements:

  

\- Seeded quest templates.

\- Daily quest selection logic.

\- Quest browsing.

\- Quest filters.

\- Quest detail screen.

\- Begin quest action.

\- Mark complete action.

\- Reflection after completion.

\- Growth event creation.

\- Journey timeline entry.

  

Quest template fields:

  

\- id

\- faith\_provider\_id

\- title

\- slug

\- description

\- invitation

\- why\_it\_matters

\- category

\- duration\_minutes

\- difficulty

\- energy\_level

\- solo\_or\_social

\- indoor\_or\_outdoor

\- scripture\_reference

\- scripture\_text\_snapshot optional

\- reflection\_prompt

\- prayer\_prompt

\- growth\_type

\- tags

\- season\_tags

\- tradition\_tags

\- is\_premium

\- is\_active

  

V1 quest categories:

  

\- Prayer

\- Scripture

\- Service

\- Kindness

\- Forgiveness

\- Generosity

\- Discipline

\- Gratitude

\- Silence

\- Worship

\- Family

\- Community

\- Reflection

\- Patience

  

Acceptance criteria:

  

\- User can browse quests.

\- User can start and complete a quest.

\- Completion creates a record.

\- Reflection can be attached.

\- Journey and growth tree update.

\- Quest system works with seed data.

  

Seed requirement:

  

V1 should include at least 75 high-quality starter quests across durations and categories.

  
  

F. Bible Reader

  

Purpose:

  

Let users read Scripture in a calm, beautiful interface.

  

V1 scope:

  

Use public-domain translation content or a seeded scaffold if full import is not included.

  

Requirements:

  

\- Bible translation model.

\- Book list.

\- Chapter list.

\- Chapter reading page.

\- Verse display.

\- Bookmark verse.

\- Highlight verse scaffold.

\- Add note scaffold.

\- Continue reading state.

\- Daily verse selection.

  

Acceptance criteria:

  

\- User can navigate to a book/chapter.

\- User can read verses with good typography.

\- User can bookmark a verse.

\- Last reading position is saved.

\- Bible pages are usable on mobile.

  

V1 content fallback:

  

If full Bible import is too large for initial build, include a limited public-domain seeded set with clear architecture for full import.

  

Do not use copyrighted translations without licensing.

  
  

G. Prayer Journal

  

Purpose:

  

Give users a private place to pray, remember, and revisit what they are carrying.

  

Requirements:

  

\- Create prayer.

\- Edit prayer.

\- Delete/archive prayer.

\- Mark answered.

\- Categorize prayer.

\- Add reminder scaffold.

\- View active prayers.

\- View answered prayers.

  

Prayer fields:

  

\- id

\- user\_id

\- title

\- body

\- category

\- status

\- answered\_at

\- answer\_reflection

\- reminder\_at

\- created\_at

\- updated\_at

  

Acceptance criteria:

  

\- Prayer data is private to user.

\- CRUD works.

\- Answered prayer flow creates journey entry.

\- Prayer UI feels like journal, not task app.

  
  

H. Reflection Journal

  

Purpose:

  

Capture spiritual memory and connect actions to growth.

  

Requirements:

  

\- Create reflection.

\- Edit reflection.

\- Delete/archive reflection.

\- Attach to quest completion.

\- Attach to verse optional.

\- Add mood optional.

\- View reflections by date.

  

Reflection fields:

  

\- id

\- user\_id

\- prompt

\- body

\- mood

\- related\_quest\_completion\_id

\- related\_verse\_id

\- created\_at

\- updated\_at

  

Acceptance criteria:

  

\- User can save reflection after quest completion.

\- Reflection appears in Journey.

\- User can write standalone reflection.

\- Reflections are private by default.

  
  

I. Journey Timeline

  

Purpose:

  

Show long-term spiritual growth without shame or competition.

  

Requirements:

  

\- Timeline of user activity.

\- Quest completions.

\- Reflections.

\- Prayers.

\- Answered prayers.

\- Bible reading activity.

\- Milestones.

\- Growth tree view.

  

Acceptance criteria:

  

\- Completing actions creates journey entries.

\- Timeline is readable and calm.

\- Empty state invites first step.

\- Return after absence does not punish user.

  
  

J. Growth Tree

  

Purpose:

  

Create an emotional representation of spiritual growth.

  

Growth inputs:

  

\- Prayer → roots.

\- Scripture → branches.

\- Kindness → leaves.

\- Service → fruit.

\- Reflection → sunlight.

\- Gratitude → flowers.

  

V1 implementation:

  

\- Simple illustrated/SVG/CSS tree states.

\- Growth points by category.

\- Stage calculation.

\- Gentle animation on update.

  

Tree stages:

  

\- Seed.

\- Sprout.

\- Young Tree.

\- Growing Tree.

\- Fruit Bearing Tree.

\- Sheltering Tree.

  

Acceptance criteria:

  

\- User sees tree grow after meaningful actions.

\- Tree never decays from missed days.

\- Growth language remains gentle.

  
  

K. Settings

  

Purpose:

  

Give users control over account, preferences, appearance, privacy, and subscription.

  

Requirements:

  

\- Profile settings.

\- Tradition/calling preferences.

\- Quest preferences.

\- Notification preferences scaffold.

\- Appearance: light/dark/system scaffold.

\- Reduced motion.

\- Privacy/data section.

\- Subscription section.

\- Legal links.

  

Acceptance criteria:

  

\- User can update preferences.

\- Settings are persisted.

\- Privacy copy is clear.

\- Destructive actions require confirmation.

  
  

L. Premium / Plus Scaffold

  

Purpose:

  

Prepare monetization without compromising V1 free value.

  

Requirements:

  

\- Plus page.

\- Patron page/section.

\- Feature list.

\- Pricing card placeholders.

\- Checkout integration scaffold.

\- Subscription status model.

\- Feature flag utility.

  

Acceptance criteria:

  

\- Plus page explains free promise.

\- No actual locked spiritual essentials.

\- Premium checks are centralized.

\- Environment variable placeholders documented.

  
  

M. PWA Requirements

  

Purpose:

  

Make BibleQuest installable and app-like on iOS/Android before native release.

  

Requirements:

  

\- Web app manifest.

\- App icons.

\- Theme colors.

\- Mobile viewport setup.

\- Offline fallback page.

\- Service worker or Next PWA equivalent.

\- Safe-area CSS.

\- Install guidance UI.

  

Acceptance criteria:

  

\- App can be added to iPhone home screen.

\- App opens standalone if installed.

\- Offline fallback works.

\- Lighthouse PWA criteria mostly pass.

  
  

6\. V1 Content Requirements

  

Seed content should include:

  

\- 75 starter quests.

\- 30 prayer prompts.

\- 30 reflection prompts.

\- 50 verse references with text if public-domain permitted.

\- 20 milestones.

\- 7 onboarding goal options.

\- 10 calling options.

\- 6 seasonal placeholder states.

  

Content quality requirements:

  

\- Quests must be specific and doable.

\- Prompts must be gentle and non-guilt-based.

\- Scripture references should be accurate.

\- No denominationally aggressive language.

\- Avoid therapeutic claims.

\- Avoid AI-sounding blandness.

  
  

7\. V1 Non-Goals

  

Do not build in V1:

  

\- Full social network.

\- Public prayer feed.

\- Leaderboards.

\- Native iOS app.

\- Full AI spiritual guide.

\- Full Church Mode.

\- Full group messaging.

\- Full Bible translation licensing marketplace.

\- Complex CMS.

\- Full analytics dashboard.

\- Payment production launch unless credentials are supplied.

  

These should be scaffolded or documented, not overbuilt.

  
  

8\. Version Roadmap

  

V1 — Pilgrimage Foundation

  

\- Landing page.

\- PWA app.

\- Daily verse/quest/prayer/reflection loop.

\- Bible reader scaffold.

\- Growth tree.

\- Journey timeline.

\- Settings.

\- Plus scaffold.

  

V1.1 — Polish and Retention

  

\- Improved seed content.

\- Better offline support.

\- Share cards.

\- Better install prompts.

\- Weekly recap.

\- App icons and splash polish.

\- More growth tree states.

  

V1.2 — Content Depth

  

\- Reading plans.

\- Seasonal quests.

\- More Bible content.

\- Verse search.

\- Prayer categories improved.

\- Reflection collections.

  

V2 — BibleQuest Plus

  

\- AI Guide.

\- Personalized quest generation.

\- Guided reading plans.

\- Reflection insights.

\- Voice journaling.

\- Advanced themes.

\- Year in Review.

  

V3 — Families and Groups

  

\- Family prayer circles.

\- Shared reading plans.

\- Small-group quests.

\- Group privacy controls.

  

V4 — Church Mode

  

\- Church admin.

\- Custom quests.

\- Church reading plans.

\- Announcements/events.

\- Ministry dashboards.

  

V5 — QuestOS Platform

  

\- Multiple faith providers.

\- Provider-specific content systems.

\- Modular quest engines.

\- SDK/API.

\- Future faith-specific apps only if pursued through separate tradition-specific research, advisors, legal review, and content governance.

  
  

9\. Product Analytics Requirements

  

Track only what is necessary.

  

Allowed analytics:

  

\- Page views.

\- Onboarding completion.

\- Quest viewed/started/completed.

\- Bible chapter opened.

\- Prayer created count, not content.

\- Reflection created count, not content.

\- PWA install prompt viewed/clicked.

\- Plus page viewed.

\- Subscription started/cancelled.

\- Error events.

  

Do not track:

  

\- Prayer text.

\- Reflection text.

\- Private note text.

\- Sensitive spiritual disclosures.

  

Analytics principles:

  

\- Minimal.

\- Transparent.

\- Privacy-first.

\- No selling data.

\- No manipulative retention experiments.

  
  

10\. Product QA Checklist

  

Before V1 is considered launch-ready:

  

\- User can complete onboarding.

\- User can complete a daily quest.

\- User can write a reflection.

\- User can create and answer a prayer.

\- User can read Bible content.

\- User can bookmark a verse.

\- Journey updates correctly.

\- Growth tree updates correctly.

\- Settings save correctly.

\- Auth works.

\- RLS protects private data.

\- PWA installs on iPhone.

\- Offline fallback works.

\- Design matches Living Editorial.

\- No shame copy exists.

\- Privacy policy/terms placeholders exist.

\- README explains setup.

\- Deployment guide exists.

  
  

END OF EXPANSION PASS 3 — VOLUME V

  
  

EXPANSION PASS 4 — VOLUME VI: QUESTOS ARCHITECTURE

  

QuestOS is the internal platform layer beneath BibleQuest.

  

BibleQuest is the first product built on QuestOS, but the architecture should not assume Christianity is the only possible provider forever. The platform should support faith-provider configuration, content engines, growth engines, quest engines, and future app variants.

  

QuestOS should be modular without becoming over-engineered.

  

V1 should implement the foundation. Future versions can expand the platform.

  
  

1\. Architecture Thesis

  

BibleQuest should be built as a product, not a prototype.

  

The codebase should support:

  

\- A beautiful PWA.

\- User accounts.

\- Private journals.

\- Quest templates.

\- Daily quest generation.

\- Bible content.

\- Prayer and reflection systems.

\- Growth events.

\- Subscription state.

\- Future AI features.

\- Future Church Mode.

\- Future provider expansion.

  

The architecture should separate:

  

\- Faith content.

\- User data.

\- Quest logic.

\- Growth logic.

\- UI presentation.

\- Subscription access.

\- Admin/content management.

  
  

2\. Recommended Stack

  

Frontend:

  

\- Next.js App Router.

\- TypeScript.

\- Tailwind CSS.

\- Custom BibleQuest design system.

\- shadcn/ui as accessible primitives only.

\- Framer Motion or Motion for animations.

\- React Hook Form.

\- Zod.

\- Zustand or lightweight client state.

  

Backend:

  

\- Supabase.

\- Postgres.

\- Supabase Auth.

\- Row Level Security.

\- Supabase Storage for future assets.

\- Edge functions optional later.

  

ORM / DB:

  

\- Drizzle ORM or Prisma.

\- SQL migrations.

\- Seed scripts.

  

Payments:

  

\- Stripe for web subscriptions.

\- RevenueCat later for native app/subscription management.

  

Analytics:

  

\- Plausible or PostHog with privacy configuration.

  

Monitoring:

  

\- Sentry.

  

Email:

  

\- Resend for transactional/lifecycle email later.

  

Deployment:

  

\- Vercel.

  

Native later:

  

\- Capacitor wrapper for iOS/Android.

  
  

3\. Suggested Repository Structure

  

The codebase should be easy for AI agents and humans to navigate.

  

Suggested structure:

  

app/

  (marketing)/

    page.tsx

    about/

    pricing/

    writing/

  (auth)/

    sign-in/

    sign-up/

    callback/

  app/

    layout.tsx

    page.tsx

    quests/

    bible/

    prayer/

    journey/

    settings/

    plus/

  api/

    webhooks/

    cron/

  

components/

  design-system/

    PaperCard.tsx

    GentleButton.tsx

    EditorialSection.tsx

    PixelIcon.tsx

    SeasonalAtmosphere.tsx

  app-shell/

    AppShell.tsx

    BottomNav.tsx

    TopGreeting.tsx

  bible/

    BibleReader.tsx

    VerseCard.tsx

    BookList.tsx

  quests/

    QuestSlip.tsx

    QuestDetail.tsx

    QuestFilters.tsx

  prayer/

    PrayerPage.tsx

    PrayerEditor.tsx

  reflection/

    ReflectionEditor.tsx

    ReflectionCard.tsx

  journey/

    JourneyTimeline.tsx

    GrowthTree.tsx

    PilgrimageMarker.tsx

  

lib/

  supabase/

    client.ts

    server.ts

    middleware.ts

  db/

    schema.ts

    queries.ts

    seed.ts

  questos/

    providers.ts

    quest-engine.ts

    verse-engine.ts

    prayer-engine.ts

    reflection-engine.ts

    growth-engine.ts

    seasonal-engine.ts

    notification-engine.ts

    subscription-engine.ts

  content/

    quests.seed.ts

    verses.seed.ts

    prayers.seed.ts

    reflections.seed.ts

  analytics/

    events.ts

  auth/

    helpers.ts

  utils/

    dates.ts

    copy.ts

    accessibility.ts

  

styles/

  globals.css

  tokens.css

  

docs/

  setup.md

  deployment.md

  env.md

  content-guide.md

  security.md

  

supabase/

  migrations/

  seed.sql

  policies.sql

  

public/

  icons/

  pixel/

  illustrations/

  manifest.webmanifest

  
  

4\. Core Domain Model

  

The system revolves around these concepts:

  

Faith Provider

  

A faith provider defines the tradition/content universe.

  

For V1:

  

\- provider\_key: christianity

\- product\_name: BibleQuest

\- canonical\_text\_label: Bible

\- core\_practices: Scripture, Prayer, Reflection, Quest

  

Future providers could define different canonical text systems, practices, and calendars only after separate tradition-specific design, content, legal, and pastoral review.

  

User Profile

  

Stores user personalization and preferences.

  

Quest Template

  

Reusable quest content created by BibleQuest or future church/admin users.

  

Quest Instance

  

A user-facing quest generated or selected for a specific day/context.

  

Quest Completion

  

A record that user completed a quest.

  

Verse / Scripture Content

  

Bible structure and verse text/reference.

  

Prayer

  

Private user-created prayer entry.

  

Reflection

  

Private user-created reflection, optionally attached to quest/verse/prayer.

  

Journey Event

  

A timeline event created from meaningful spiritual actions.

  

Growth Event

  

Structured event feeding the Growth Tree.

  

Milestone

  

A meaningful achievement or marker, not a competitive badge.

  

Subscription

  

Tracks Plus/Patron status and feature access.

  
  

5\. Database Schema — First Draft

  

users

  

Managed by Supabase Auth.

  

profiles

  

\- id uuid primary key references auth.users

\- display\_name text

\- avatar\_url text nullable

\- faith\_provider\_id uuid

\- tradition text nullable

\- primary\_goal text nullable

\- calling text nullable

\- daily\_rhythm text nullable

\- onboarding\_completed boolean default false

\- created\_at timestamptz

\- updated\_at timestamptz

  

faith\_providers

  

\- id uuid primary key

\- key text unique

\- name text

\- description text

\- canonical\_text\_label text

\- is\_active boolean

\- created\_at timestamptz

  

bible\_translations

  

\- id uuid primary key

\- faith\_provider\_id uuid

\- key text

\- name text

\- abbreviation text

\- copyright\_status text

\- license\_notes text

\- is\_default boolean

\- is\_active boolean

  

bible\_books

  

\- id uuid primary key

\- translation\_id uuid

\- testament text

\- name text

\- slug text

\- order\_index int

  

bible\_chapters

  

\- id uuid primary key

\- book\_id uuid

\- chapter\_number int

  

bible\_verses

  

\- id uuid primary key

\- chapter\_id uuid

\- verse\_number int

\- text text

\- reference text

  

verse\_bookmarks

  

\- id uuid primary key

\- user\_id uuid references auth.users

\- verse\_id uuid

\- note text nullable

\- created\_at timestamptz

  

verse\_highlights

  

\- id uuid primary key

\- user\_id uuid references auth.users

\- verse\_id uuid

\- color\_key text

\- note text nullable

\- created\_at timestamptz

  

reading\_progress

  

\- id uuid primary key

\- user\_id uuid references auth.users

\- translation\_id uuid

\- book\_id uuid

\- chapter\_id uuid

\- verse\_id uuid nullable

\- updated\_at timestamptz

  

quest\_templates

  

\- id uuid primary key

\- faith\_provider\_id uuid

\- title text

\- slug text unique

\- description text

\- invitation text

\- why\_it\_matters text

\- category text

\- duration\_minutes int

\- difficulty text

\- energy\_level text

\- solo\_or\_social text

\- indoor\_or\_outdoor text

\- scripture\_reference text nullable

\- scripture\_text\_snapshot text nullable

\- reflection\_prompt text

\- prayer\_prompt text nullable

\- growth\_type text

\- tags text\[\]

\- season\_tags text\[\]

\- tradition\_tags text\[\]

\- is\_premium boolean default false

\- is\_active boolean default true

\- created\_at timestamptz

\- updated\_at timestamptz

  

user\_daily\_quests

  

\- id uuid primary key

\- user\_id uuid references auth.users

\- quest\_template\_id uuid references quest\_templates

\- assigned\_date date

\- status text default 'assigned'

\- started\_at timestamptz nullable

\- completed\_at timestamptz nullable

\- created\_at timestamptz

  

quest\_completions

  

\- id uuid primary key

\- user\_id uuid references auth.users

\- quest\_template\_id uuid references quest\_templates

\- user\_daily\_quest\_id uuid nullable

\- reflection\_id uuid nullable

\- completed\_at timestamptz

\- created\_at timestamptz

  

prayers

  

\- id uuid primary key

\- user\_id uuid references auth.users

\- title text nullable

\- body text

\- category text nullable

\- status text default 'active'

\- answered\_at timestamptz nullable

\- answer\_reflection text nullable

\- reminder\_at timestamptz nullable

\- archived\_at timestamptz nullable

\- created\_at timestamptz

\- updated\_at timestamptz

  

reflections

  

\- id uuid primary key

\- user\_id uuid references auth.users

\- prompt text nullable

\- body text

\- mood text nullable

\- related\_quest\_completion\_id uuid nullable

\- related\_verse\_id uuid nullable

\- related\_prayer\_id uuid nullable

\- archived\_at timestamptz nullable

\- created\_at timestamptz

\- updated\_at timestamptz

  

journey\_events

  

\- id uuid primary key

\- user\_id uuid references auth.users

\- event\_type text

\- title text

\- description text nullable

\- related\_entity\_type text nullable

\- related\_entity\_id uuid nullable

\- occurred\_at timestamptz

\- created\_at timestamptz

  

growth\_events

  

\- id uuid primary key

\- user\_id uuid references auth.users

\- growth\_type text

\- amount int default 1

\- source\_type text

\- source\_id uuid nullable

\- occurred\_at timestamptz

\- created\_at timestamptz

  

milestones

  

\- id uuid primary key

\- key text unique

\- title text

\- description text

\- milestone\_type text

\- requirement jsonb

\- icon\_key text nullable

\- is\_active boolean

  

user\_milestones

  

\- id uuid primary key

\- user\_id uuid references auth.users

\- milestone\_id uuid references milestones

\- achieved\_at timestamptz

  

notification\_preferences

  

\- id uuid primary key

\- user\_id uuid references auth.users

\- daily\_verse\_enabled boolean default false

\- daily\_quest\_enabled boolean default false

\- prayer\_reminders\_enabled boolean default false

\- weekly\_recap\_enabled boolean default false

\- preferred\_time text nullable

\- timezone text nullable

\- created\_at timestamptz

\- updated\_at timestamptz

  

subscriptions

  

\- id uuid primary key

\- user\_id uuid references auth.users

\- provider text

\- status text

\- plan\_key text

\- current\_period\_start timestamptz nullable

\- current\_period\_end timestamptz nullable

\- external\_customer\_id text nullable

\- external\_subscription\_id text nullable

\- created\_at timestamptz

\- updated\_at timestamptz

  

feature\_flags

  

\- id uuid primary key

\- key text unique

\- description text

\- enabled boolean default false

\- audience text nullable

\- created\_at timestamptz

  
  

6\. Row Level Security Rules

  

Every user-owned table must enforce RLS.

  

User-owned tables:

  

\- profiles

\- verse\_bookmarks

\- verse\_highlights

\- reading\_progress

\- user\_daily\_quests

\- quest\_completions

\- prayers

\- reflections

\- journey\_events

\- growth\_events

\- user\_milestones

\- notification\_preferences

\- subscriptions

  

Policy principle:

  

Users can select/insert/update/delete only their own records.

  

Content tables are readable:

  

\- faith\_providers

\- bible\_translations

\- bible\_books

\- bible\_chapters

\- bible\_verses

\- quest\_templates where active

\- milestones where active

  

Admin-only writes later:

  

\- quest\_templates

\- bible content

\- milestones

\- feature flags

  

Never expose private prayer/reflection data through public queries.

  
  

7\. Quest Engine

  

The Quest Engine assigns, filters, and completes quests.

  

Core functions:

  

getDailyQuest(userId, date)

  

\- Check if user already has assigned quest for date.

\- If yes, return it.

\- If no, select from active quest templates using preferences.

\- Create user\_daily\_quest.

\- Return quest.

  

selectQuestTemplate(profile, context)

  

Inputs:

  

\- user goal.

\- quest duration preference.

\- category preference.

\- tradition tags.

\- season tags.

\- completion history.

  

Rules:

  

\- Avoid repeating same quest too frequently.

\- Prefer non-premium for free users.

\- Respect user preference where possible.

\- Fall back gracefully.

  

completeQuest(userId, dailyQuestId)

  

\- Mark daily quest complete.

\- Create quest\_completion.

\- Create journey\_event.

\- Create growth\_event.

\- Check milestones.

  

filterQuests(filters)

  

\- Duration.

\- Category.

\- Energy.

\- Solo/social.

\- Indoor/outdoor.

\- Tradition.

\- Season.

  

V1 can keep the algorithm simple, but the structure should be ready for smarter personalization later.

  
  

8\. Verse Engine

  

The Verse Engine handles daily verses, reading progress, bookmarks, and Bible reading state.

  

Core functions:

  

getDailyVerse(userId, date)

  

\- Select from curated daily verse pool.

\- Avoid recent repeats.

\- Consider season tags later.

\- Return verse/reference.

  

getReadingProgress(userId)

  

\- Return last translation/book/chapter/verse.

  

saveReadingProgress(userId, location)

  

\- Upsert progress.

  

bookmarkVerse(userId, verseId)

  

\- Create bookmark.

  

highlightVerse(userId, verseId, colorKey)

  

\- Create/update highlight.

  

V1 may use curated seed verses if full Bible content is not loaded.

  
  

9\. Prayer Engine

  

The Prayer Engine manages private prayer records.

  

Core functions:

  

createPrayer(userId, data)

updatePrayer(userId, prayerId, data)

archivePrayer(userId, prayerId)

markPrayerAnswered(userId, prayerId, reflection)

listPrayers(userId, filters)

  

When prayer is marked answered:

  

\- Update prayer status.

\- Create journey\_event.

\- Create growth\_event with prayer/flower/light type.

\- Optional reflection record.

  

Privacy:

  

No AI or analytics function should read raw prayer text unless the user explicitly invokes such a feature and consents.

  
  

10\. Reflection Engine

  

The Reflection Engine manages private writing and connects it to quests, verses, and prayers.

  

Core functions:

  

createReflection(userId, data)

updateReflection(userId, reflectionId, data)

archiveReflection(userId, reflectionId)

listReflections(userId, filters)

attachReflectionToQuestCompletion(reflectionId, completionId)

  

On reflection creation:

  

\- Create journey\_event.

\- Create growth\_event.

\- Check milestones.

  

Reflection prompts can be selected from:

  

\- Quest template prompt.

\- Verse prompt.

\- Prayer prompt.

\- Daily prompt pool.

  
  

11\. Growth Engine

  

The Growth Engine converts meaningful actions into tree growth.

  

Inputs:

  

\- Quest completion.

\- Prayer creation.

\- Answered prayer.

\- Reflection creation.

\- Bible reading.

\- Gratitude quests.

\- Service quests.

  

Growth types:

  

\- roots

\- branches

\- leaves

\- fruit

\- sunlight

\- flowers

  

Stage calculation:

  

Use aggregate growth points, but present visually, not numerically.

  

Example:

  

Seed: 0–4 actions.

Sprout: 5–14 actions.

Young Tree: 15–39 actions.

Growing Tree: 40–99 actions.

Fruit Bearing Tree: 100–249 actions.

Sheltering Tree: 250+ actions.

  

Rules:

  

\- Never subtract points for absence.

\- Never visually punish users.

\- Return moments should show continuity.

  
  

12\. Seasonal Engine

  

The Seasonal Engine adapts content and atmosphere.

  

V1 scaffold:

  

\- season key.

\- season label.

\- accent tokens.

\- atmosphere description.

\- quest season tags.

  

Supported initial seasons:

  

\- ordinary\_time

\- advent

\- christmas

\- lent

\- holy\_week

\- easter

\- pentecost

  

Functions:

  

getCurrentSeason(date, tradition?)

getSeasonalAccent(seasonKey)

filterSeasonalQuests(seasonKey)

  

V1 can use approximate/static calendar data. Later versions can support liturgical calendars more accurately.

  
  

13\. Subscription Engine

  

The Subscription Engine controls feature access.

  

Plans:

  

\- free

\- plus

\- patron

\- church\_future

  

Functions:

  

getUserPlan(userId)

hasFeature(userId, featureKey)

requirePlus(featureKey)

handleCheckoutWebhook(event)

  

Feature flags:

  

\- ai\_guide

\- personalized\_quests

\- advanced\_reading\_plans

\- premium\_themes

\- voice\_journaling

\- year\_in\_review

\- family\_groups

\- church\_mode

  

V1 should scaffold checks without blocking core free features.

  
  

14\. Notification Engine

  

The Notification Engine manages reminders.

  

V1 scaffold:

  

\- preferences UI.

\- database preferences.

\- notification copy library.

\- future push/email scheduling.

  

Future functions:

  

scheduleDailyVerse(userId)

scheduleDailyQuest(userId)

schedulePrayerReminder(userId, prayerId)

sendWeeklyRecap(userId)

  

Push notifications may require platform setup later. For V1, document limitations and prepare architecture.

  
  

15\. Admin / CMS Future Architecture

  

V1 does not need a full CMS, but content should be structured so a CMS can exist later.

  

Future Admin features:

  

\- Quest template editor.

\- Verse/day planner.

\- Prayer prompt library.

\- Reflection prompt library.

\- Seasonal calendar editor.

\- Milestone editor.

\- Content QA/review state.

\- Church content tools.

  

Admin roles:

  

\- owner

\- editor

\- reviewer

\- church\_admin future

  

V1 should keep seed data in structured files and database tables.

  
  

16\. AI Guide Future Architecture

  

AI Guide should be modular and guarded.

  

AI capabilities later:

  

\- Explain passage.

\- Suggest quest.

\- Draft prayer.

\- Build reading plan.

\- Summarize user reflections, with explicit consent.

\- Answer basic faith questions with humility and citations when possible.

  

AI guardrails:

  

\- Never claim to be God.

\- Never replace clergy.

\- Never provide definitive pastoral judgment.

\- Never make crisis/medical/legal claims.

\- Clearly distinguish Scripture from AI commentary.

\- Respect denominational differences.

\- Do not process private journal/prayer text without explicit user action.

  

Architecture:

  

lib/questos/ai-guide/

  prompts.ts

  guardrails.ts

  passage-helper.ts

  quest-generator.ts

  prayer-drafter.ts

  reflection-insights.ts

  

V1 should include only placeholder/scaffold and copy.

  
  

17\. API and Server Actions

  

Preferred approach:

  

Use Next.js server actions or API routes for secure mutations.

  

Core server actions:

  

\- completeOnboarding

\- updateProfile

\- getHomeData

\- assignDailyQuest

\- completeQuest

\- createReflection

\- createPrayer

\- markPrayerAnswered

\- bookmarkVerse

\- saveReadingProgress

\- updateSettings

  

API routes:

  

\- Stripe webhook.

\- Future cron jobs.

\- Future AI endpoints.

  

Do not expose unsafe client-side writes to private data without RLS.

  
  

18\. Security Requirements

  

Minimum security requirements:

  

\- RLS enabled on all user-owned tables.

\- Auth required for private routes.

\- Server-side validation with Zod.

\- Environment variables not committed.

\- No raw private content in analytics.

\- No public storage of private prayer/reflection assets.

\- Rate limit future AI endpoints.

\- Sanitize user-generated content before rendering.

\- Add security.md.

  

Privacy-sensitive tables require extra care:

  

\- prayers

\- reflections

\- verse notes

  
  

19\. Performance Requirements

  

BibleQuest should feel lightweight.

  

Targets:

  

\- Fast landing page load.

\- Minimal JavaScript for marketing pages.

\- Lazy-load heavy illustrations.

\- Avoid shipping full Bible content to client at once.

\- Cache common content.

\- Optimize fonts.

\- Use image optimization.

\- Keep animations efficient.

  

PWA performance:

  

\- App shell loads quickly.

\- Offline fallback available.

\- Recently accessed content cached.

  
  

20\. Developer Experience Requirements

  

Claude Code should generate:

  

\- Clear README.

\- Setup guide.

\- Env var documentation.

\- Database migration instructions.

\- Seed instructions.

\- Deployment guide.

\- Testing guide.

\- Content editing guide.

  

Commands should include:

  

\- install

\- dev

\- build

\- lint

\- typecheck

\- test if configured

\- db:migrate

\- db:seed

  

Use TypeScript strictly enough to prevent common bugs.

  
  

21\. Launch Architecture Acceptance Criteria

  

The architecture is acceptable when:

  

\- App can run locally.

\- Supabase schema is defined.

\- Seed data is available.

\- RLS policies are documented/implemented.

\- User can complete core daily loop.

\- Private data is protected.

\- Components reflect BibleQuest design language.

\- Future features are scaffolded without broken UI.

\- README explains manual setup.

  
  

22\. Manual Setup Checklist for Founder

  

Before public launch:

  

\- Purchase/confirm BibleQuest.us.

\- Point DNS to Vercel.

\- Create Supabase project.

\- Configure env vars.

\- Run migrations.

\- Run seed scripts.

\- Configure auth redirect URLs.

\- Configure Vercel project.

\- Add PWA icons.

\- Test on iPhone Safari.

\- Add privacy policy.

\- Add terms.

\- Confirm Bible translation licensing.

\- Configure Stripe/RevenueCat when ready.

\- Configure analytics with privacy settings.

\- Configure Sentry.

\- Run QA.

  
  

23\. Architecture Non-Negotiables

  

Do not build BibleQuest as a throwaway prototype.

  

Do not hard-code all content into React components.

  

Do not expose private journal/prayer content.

  

Do not create a generic admin dashboard aesthetic in the user app.

  

Do not tightly couple all logic to Christianity-only names if the QuestOS layer can remain generic.

  

Do not over-engineer so much that V1 never ships.

  

Balance foundation and momentum.

  
  

24\. QuestOS North Star

  

QuestOS exists to turn belief into daily practice.

  

For BibleQuest, that means Scripture, prayer, reflection, and action.

  

Every engine should serve that loop.

  

If an architecture choice does not help users take one meaningful step, simplify it.

  

END OF EXPANSION PASS 4 — VOLUME VI

  
  
  

EXPANSION PASS 5 — VOLUME VIII: THEOLOGY AND CONTENT GUARDRAILS

  

This pass defines the theological, pastoral, editorial, and safety guardrails for BibleQuest. It should guide all quests, prayers, reflections, Bible commentary, AI Guide behavior, seasonal content, notifications, marketing copy, and future Church/Group tools.

  

BibleQuest is a Christian product, but it must be humble, careful, and respectful. The app should help people practice faith without pretending to replace Scripture, church, clergy, pastoral care, therapy, or community.

  

The purpose of this section is not to make BibleQuest academically exhaustive. The purpose is to make BibleQuest spiritually responsible.

  
  

1\. Theology Thesis

  

BibleQuest should be rooted in historic Christian practice while remaining broadly accessible across Christian traditions.

  

The app’s center is not argument.

  

The app’s center is practice:

  

\- Read Scripture.

\- Pray honestly.

\- Reflect humbly.

\- Act with love.

\- Return without shame.

  

BibleQuest should avoid becoming a theology debate platform. It should not attempt to resolve every doctrinal disagreement. It should not flatten meaningful differences either. It should be clear when content is broadly Christian, tradition-specific, devotional, pastoral, or AI-generated.

  

The product should be confident about its mission and humble about its limits.

  
  

2\. Core Spiritual Commitments

  

BibleQuest’s Christian content should encourage:

  

\- Love of God.

\- Love of neighbor.

\- Prayer.

\- Scripture reading.

\- Repentance without despair.

\- Forgiveness.

\- Mercy.

\- Humility.

\- Generosity.

\- Gratitude.

\- Patience.

\- Service.

\- Silence.

\- Self-control.

\- Hope.

\- Community.

  

BibleQuest should discourage:

  

\- Shame-based spirituality.

\- Spiritual comparison.

\- Legalism disguised as productivity.

\- Prosperity promises.

\- Fear-driven religious language.

\- Sectarian hostility.

\- Anti-clergy or anti-church framing.

\- Replacement of human counsel with AI.

\- Public performance of private devotion.

  
  

3\. Product Boundary Statement

  

BibleQuest is:

  

\- A spiritual habit companion.

\- A Bible reading aid.

\- A prayer and reflection journal.

\- A quest-based practice tool.

\- A private place for daily growth.

  

BibleQuest is not:

  

\- A church.

\- A sacramental authority.

\- A pastor, priest, confessor, therapist, doctor, or emergency service.

\- A replacement for community.

\- A final authority on theological disputes.

\- A crisis counseling platform.

\- A place to receive definitive divine commands through AI.

  

This boundary should appear in appropriate places, especially around AI Guide, crisis-sensitive content, and pastoral topics.

  
  

4\. Ecumenical Default

  

The default BibleQuest voice should be ecumenical Christian.

  

Ecumenical means:

  

\- Broadly compatible with Catholic, Orthodox, Protestant, and non-denominational users where possible.

\- Rooted in shared practices like Scripture, prayer, mercy, service, gratitude, forgiveness, and humility.

\- Avoiding unnecessary denominational assumptions.

\- Being clear when a practice or calendar item is tradition-specific.

  

Ecumenical does not mean vague or spiritually empty.

  

BibleQuest should still speak with warmth, conviction, and Christian identity. It simply should not pretend all Christians express every practice the same way.

  
  

5\. Denominational Awareness

  

BibleQuest should allow optional tradition preferences.

  

Initial tradition options:

  

\- Catholic.

\- Protestant.

\- Orthodox.

\- Non-denominational.

\- Exploring Christianity.

\- Prefer not to say.

  

Content can be tagged by compatibility:

  

\- broadly\_christian

\- catholic\_friendly

\- orthodox\_friendly

\- protestant\_friendly

\- non\_denominational\_friendly

\- exploring\_friendly

\- tradition\_specific

  

Tradition-specific content should be labeled clearly.

  

Examples:

  

Catholic-specific or Catholic-forward content may reference:

  

\- Mass.

\- Rosary.

\- Confession/Reconciliation.

\- Eucharistic adoration.

\- Saints, when appropriate.

\- Liturgical seasons.

  

Orthodox-specific or Orthodox-forward content may reference:

  

\- Icons.

\- Divine Liturgy.

\- Jesus Prayer.

\- Fasting seasons.

\- Spiritual father/mother language, when appropriate.

  

Protestant-specific or Protestant-forward content may reference:

  

\- Personal Bible study.

\- Small group.

\- Devotional reading.

\- Worship service.

\- Sermon reflection.

  

Non-denominational content may reference:

  

\- Church community.

\- Prayer group.

\- Bible study.

\- Worship.

\- Service.

  

Exploring-friendly content should explain terms gently and avoid assuming prior knowledge.

  
  

6\. Scripture Use Rules

  

Scripture should be treated with care.

  

Rules:

  

\- Do not use copyrighted translations without proper licensing.

\- Always display translation information clearly.

\- Do not alter Bible text.

\- Do not present paraphrases as direct Scripture.

\- If paraphrasing, label it as a paraphrase or summary.

\- Avoid proof-texting in ways that distort context.

\- Prefer short passages and accurate references for quests.

\- When a verse is used to support a quest, the application should be clear and modest.

  

Good pattern:

  

Verse: “Therefore encourage one another and build each other up...”

Application: “Today, practice encouragement by sending one honest note to someone who may need it.”

  

Bad pattern:

  

Verse: unrelated or out-of-context passage.

Application: “God commands you to text someone right now or you are disobedient.”

  

BibleQuest should never use Scripture to manipulate, shame, or pressure users into app engagement.

  
  

7\. Bible Translation Policy

  

V1 should use public-domain Bible content unless licensing has been secured.

  

The system must support translation metadata:

  

\- Translation name.

\- Abbreviation.

\- Copyright/license status.

\- Publisher/license notes.

\- Display requirements.

  

The app should be designed so licensed translations can be added later.

  

Do not hard-code assumptions that only one translation will ever exist.

  

If using a limited seed set, label it clearly in development and avoid implying the full Bible is available until it is.

  
  

8\. Quest Writing Rules

  

Quests are spiritual invitations to act.

  

Every quest should be:

  

\- Specific.

\- Doable.

\- Kind.

\- Grounded in Scripture or Christian practice.

\- Time-bounded.

\- Non-manipulative.

\- Non-performative.

\- Useful in real life.

  

Every quest should avoid:

  

\- Shame.

\- Fear.

\- Legalistic pressure.

\- Public virtue signaling.

\- Unsafe instructions.

\- Medical/legal/financial advice.

\- Coercive evangelism.

\- Tasks that invade privacy.

\- Tasks that pressure reconciliation in unsafe relationships.

  

Quest structure:

  

\- Title.

\- Invitation.

\- Why it matters.

\- Scripture reference.

\- Suggested action.

\- Reflection prompt.

\- Prayer prompt.

\- Duration.

\- Category.

\- Energy level.

\- Safety/tradition tags where needed.

  

Good quest examples:

  

Title: Encourage One Person

Invitation: Send a simple, honest message to someone who may need kindness today.

Why it matters: Encouragement is one of the quiet ways love becomes visible.

Scripture: 1 Thessalonians 5:11

Reflection: What changed in you when you chose encouragement?

Prayer: Lord, help me notice who needs kindness today.

  

Title: Five Minutes of Silence

Invitation: Sit quietly for five minutes and offer the time to God without trying to perform.

Why it matters: Silence can make room for attention, honesty, and peace.

Scripture: Psalm 46:10

Reflection: What did you notice when you stopped filling the space?

Prayer: God, teach me to be still.

  

Bad quest examples:

  

\- “Tell a stranger they are going to hell.”

\- “Skip your medication and trust God.”

\- “Confront the person who hurt you today.”

\- “Donate money you cannot afford.”

\- “Fast all day even if you are ill.”

\- “Prove your faith by posting publicly.”

  
  

9\. Sensitive Quest Rules

  

Some quest categories require extra care.

  

Forgiveness

  

Forgiveness quests must never pressure users into unsafe contact or reconciliation.

  

Allowed:

  

\- Pray for the grace to release bitterness.

\- Write an unsent letter.

\- Reflect on what forgiveness might mean.

\- Ask God for help with resentment.

  

Not allowed:

  

\- Contact your abuser.

\- Reconcile today.

\- Forget what happened.

\- Trust them again immediately.

  

Fasting / Discipline

  

Fasting quests must include safety language and alternatives.

  

Allowed:

  

\- Fast from social media for one hour.

\- Choose a simple meal if healthy and appropriate.

\- Practice restraint in speech.

\- Give up a small comfort for a set time.

  

Not allowed:

  

\- Extreme fasting.

\- Food restriction prompts for minors, pregnant users, users with eating disorders, or health concerns.

\- Medical claims.

  

Evangelization

  

Evangelization quests should be respectful and non-coercive.

  

Allowed:

  

\- Share what has helped you if the moment is appropriate.

\- Invite someone to church gently.

\- Pray for courage to be loving and truthful.

  

Not allowed:

  

\- Harass strangers.

\- Pressure vulnerable people.

\- Use fear tactics.

  

Money / Generosity

  

Generosity quests must avoid financial pressure.

  

Allowed:

  

\- Give within your means.

\- Offer time, encouragement, or service.

\- Donate a small amount if appropriate.

  

Not allowed:

  

\- Give money you need for essentials.

\- Suggest God will reward donations financially.

\- Manipulate users into giving to BibleQuest.

  

Family / Relationships

  

Relationship quests must avoid unsafe assumptions.

  

Allowed:

  

\- Say thank you.

\- Pray for patience.

\- Listen without interrupting.

\- Do a small act of service.

  

Not allowed:

  

\- Force reconciliation.

\- Encourage staying in abuse.

\- Replace professional help.

  
  

10\. Prayer Writing Rules

  

Prayer prompts should be humble, simple, and emotionally honest.

  

Good prayer prompts:

  

\- “Lord, help me notice who needs kindness today.”

\- “God, teach me to be still.”

\- “Jesus, give me patience where I feel rushed.”

\- “Lord, help me forgive without pretending the hurt did not matter.”

\- “God, give me courage to do one faithful thing today.”

  

Avoid:

  

\- Overly dramatic language.

\- Theological overreach.

\- Prosperity promises.

\- Commands framed as God’s direct speech.

\- Manipulative urgency.

\- Shame.

  

Prayer prompts should not be too long. They should help users begin, not replace their own words.

  
  

11\. Reflection Prompt Rules

  

Reflection prompts should help users notice, not perform.

  

Good reflection prompts:

  

\- What did you notice?

\- Where did you see grace today?

\- What felt difficult?

\- What changed in you?

\- What are you grateful for?

\- What would you like to bring to prayer?

\- What is one small step you can carry forward?

  

Avoid:

  

\- “Why did you fail?”

\- “What did you do wrong?”

\- “How will you prove your faith tomorrow?”

\- “Are you really committed?”

  

Reflection should feel safe, optional, and meaningful.

  
  

12\. Notification Content Rules

  

Notifications must be gentle invitations, not spiritual pressure.

  

Good:

  

\- “Today’s verse is ready.”

\- “A small quest is waiting when you are.”

\- “Take a quiet moment with God.”

\- “Your journey continues.”

\- “A prayer you wrote may be worth revisiting.”

\- “Begin again with one small step.”

  

Bad:

  

\- “You missed God today.”

\- “Your streak is dying.”

\- “Don’t disappoint God.”

\- “You’re falling behind spiritually.”

\- “Open now or lose progress.”

  

Notifications should be opt-in and adjustable.

  
  

13\. AI Guide Guardrails

  

The AI Guide must be clearly framed as a guide, not an authority.

  

Allowed AI Guide roles:

  

\- Study companion.

\- Passage explainer.

\- Prayer drafting helper.

\- Quest suggestion helper.

\- Reflection organizer.

\- Reading plan assistant.

\- Gentle encouragement tool.

  

Not allowed AI Guide roles:

  

\- God’s voice.

\- Confessor.

\- Priest/pastor replacement.

\- Therapist.

\- Crisis counselor.

\- Medical/legal authority.

\- Final judge of theological disputes.

  

Required AI Guide disclaimers:

  

\- AI responses are not Scripture.

\- AI responses may be wrong.

\- For serious pastoral concerns, speak with trusted clergy or mature Christian community.

\- For crisis or danger, contact local emergency resources.

  

AI must not say:

  

\- “God told me…”

\- “God is definitely saying…”

\- “You must…” in disputed or sensitive contexts.

\- “This is the only Christian view…” when traditions differ.

\- “Do not seek help; just pray.”

  

AI should say:

  

\- “Many Christians understand this passage as…”

\- “One way to reflect on this is…”

\- “It may help to speak with a trusted pastor, priest, counselor, or mentor.”

\- “I can help you draft a prayer, but use your own words if they feel more honest.”

  
  

14\. Pastoral Safety Rules

  

BibleQuest may encounter users dealing with grief, anxiety, depression, abuse, addiction, family conflict, loneliness, guilt, or crisis.

  

The product must be careful.

  

General rule:

  

Offer spiritual encouragement, but do not replace professional or pastoral help.

  

Crisis-sensitive content should:

  

\- Encourage reaching out to trusted people.

\- Encourage local emergency services when someone is in immediate danger.

\- Encourage professional care where appropriate.

\- Avoid minimizing pain.

\- Avoid spiritualizing abuse.

\- Avoid implying suffering is always caused by lack of faith.

  

The app should not generate quests that intensify crisis.

  

Do not create quests asking users to confront abusers, isolate themselves, stop treatment, stop medication, or make major life decisions impulsively.

  
  

15\. Mental Health and Medical Boundary

  

BibleQuest can encourage prayer, reflection, rest, community, gratitude, and seeking help.

  

BibleQuest cannot provide diagnosis, treatment, or medical instructions.

  

Allowed:

  

\- “Consider speaking with a trusted professional or clergy member.”

\- “Prayer can be part of support, but you do not have to carry this alone.”

\- “If you are in immediate danger, contact local emergency services.”

  

Not allowed:

  

\- “Stop taking medication.”

\- “You do not need therapy if you have faith.”

\- “This illness is caused by sin.”

\- “Fasting will cure your condition.”

  
  

16\. Abuse and Unsafe Relationship Boundary

  

BibleQuest must never pressure users toward unsafe reconciliation.

  

Rules:

  

\- Forgiveness and reconciliation are not identical in product language.

\- Safety matters.

\- Boundaries can be faithful.

\- Abuse should not be minimized.

\- Users should be encouraged to seek trusted help.

  

Bad content:

  

“Call the person who abused you and forgive them today.”

  

Better content:

  

“If it is safe, reflect on what forgiveness might mean. You do not have to contact anyone. Bring your pain honestly to God and consider speaking with someone you trust.”

  
  

17\. Children, Teens, and Family Content

  

If BibleQuest later supports minors or family accounts, extra care is required.

  

Rules:

  

\- Do not collect unnecessary personal information from minors.

\- Do not encourage private conversations with unknown adults.

\- Do not create quests that put children in unsafe situations.

\- Parent/family tools must respect privacy and safety.

\- Avoid mature topics unless age-appropriate and properly framed.

  

V1 should not market directly to children unless legal and safety requirements are handled.

  
  

18\. Church Mode Content Rules

  

Future Church Mode should help communities practice faith together without becoming performative.

  

Allowed:

  

\- Shared reading plans.

\- Group quests.

\- Prayer circles with privacy controls.

\- Small group reflections.

\- Church announcements.

\- Service opportunities.

  

Not allowed:

  

\- Holiness leaderboards.

\- Public shame for inactivity.

\- Public prayer requests without consent.

\- Comparing members’ spiritual performance.

\- Pastoral surveillance dashboards.

  

Church analytics should be aggregate and consent-aware.

  
  

19\. Seasonal Content Rules

  

Seasonal content should support the Christian calendar respectfully.

  

Ordinary Time:

  

Themes: growth, patience, daily faithfulness, discipleship.

  

Advent:

  

Themes: waiting, hope, preparation, light in darkness.

  

Christmas:

  

Themes: joy, incarnation, generosity, welcome.

  

Lent:

  

Themes: repentance, simplicity, discipline, mercy, reflection.

  

Holy Week:

  

Themes: reverence, sacrifice, silence, love.

  

Easter:

  

Themes: resurrection, renewal, life, joy, hope.

  

Pentecost:

  

Themes: courage, Spirit, mission, unity.

  

Rules:

  

\- Label tradition-specific practices clearly.

\- Do not assume every user observes every season the same way.

\- Offer alternatives for fasting/discipline.

\- Keep tone reverent and gentle.

  
  

20\. Content Taxonomy

  

BibleQuest content should be structured with metadata.

  

Quest metadata:

  

\- category

\- duration

\- difficulty

\- energy

\- solo/social

\- indoor/outdoor

\- scripture reference

\- tradition tags

\- season tags

\- sensitivity tags

\- premium flag

\- review status

  

Sensitivity tags:

  

\- forgiveness\_sensitive

\- fasting\_sensitive

\- grief\_sensitive

\- relationship\_sensitive

\- money\_sensitive

\- mental\_health\_sensitive

\- abuse\_sensitive

\- minors\_sensitive

  

Review status:

  

\- draft

\- ai\_generated

\- human\_review\_needed

\- approved

\- retired

  

No AI-generated sensitive content should ship without review.

  
  

21\. Content Review Process

  

Future content pipeline:

  

1\. Draft created.

2\. Metadata added.

3\. Theology/safety review.

4\. Copy review.

5\. UX review.

6\. Approval.

7\. Publish.

8\. Monitor feedback.

9\. Retire or revise if needed.

  

For V1, Claude can seed content, but the founder should review sensitive quests manually before launch.

  

Content review questions:

  

\- Is the Scripture reference appropriate?

\- Is the action safe?

\- Is the tone invitational?

\- Is there any shame or manipulation?

\- Is it denominationally clear?

\- Could this harm someone in a vulnerable situation?

\- Does this feel like BibleQuest?

  
  

22\. Writing Style Guide

  

BibleQuest writing should be concise but not empty.

  

Good style:

  

\- Short sentences.

\- Warm verbs.

\- Clear actions.

\- Gentle spiritual language.

\- One idea at a time.

  

Avoid:

  

\- Jargon without explanation.

\- Sermonizing.

\- Overly academic theology.

\- Youth-group cringe.

\- Corporate SaaS tone.

\- Fear tactics.

\- Overpromising.

  

Preferred words:

  

\- journey

\- pilgrimage

\- step

\- prayer

\- Scripture

\- reflection

\- quiet

\- kindness

\- mercy

\- grace

\- patience

\- gratitude

\- return

\- begin

\- carry

\- notice

  

Words to avoid or use carefully:

  

\- optimize

\- crush

\- dominate

\- hack

\- streak threat

\- fail

\- shame

\- unlock God

\- spiritual score

\- rank

  
  

23\. Example Content Templates

  

Quest Template

  

Title:

\[Short, concrete action\]

  

Invitation:

\[One gentle sentence telling the user what to do\]

  

Why it matters:

\[One or two sentences connecting the action to Christian practice\]

  

Scripture:

\[Reference and short text if licensed/public domain\]

  

Reflection:

\[One question\]

  

Prayer:

\[One simple prayer prompt\]

  

Safety note, if needed:

\[Brief and non-alarming\]

  

Prayer Prompt Template

  

Lord,

\[one honest request\]

Help me \[practice/notice/receive\] \[virtue/action\] today.

Amen.

  

Reflection Prompt Template

  

What did you notice when you \[action\]?

  

Seasonal Quest Template

  

During \[season\], Christians often remember \[theme\]. Today, take \[small action\] as a way to practice \[virtue\].

  
  

24\. Theology QA Checklist

  

Before content ships, ask:

  

\- Is this broadly Christian or clearly tradition-specific?

\- Is Scripture used accurately and respectfully?

\- Does this avoid shame and manipulation?

\- Could this harm someone in crisis?

\- Could this pressure unsafe reconciliation?

\- Does this avoid medical/legal claims?

\- Does this respect denominational differences?

\- Is the action concrete and doable?

\- Does the prayer sound humble?

\- Does the reflection invite honesty?

\- Would a reasonable pastor/priest/church leader find this responsible?

\- Does this match BibleQuest’s voice?

  

If not, revise or remove.

  
  

25\. Content Non-Negotiables

  

BibleQuest must never:

  

\- Claim AI speaks for God.

\- Present AI commentary as Scripture.

\- Use guilt to drive engagement.

\- Shame users for missing days.

\- Encourage unsafe contact or reconciliation.

\- Tell users to stop medical treatment.

\- Promise financial reward for giving.

\- Publicize private prayers without consent.

\- Build holiness leaderboards.

\- Treat subscription as spiritual superiority.

  

BibleQuest must always:

  

\- Make Scripture central.

\- Invite prayer honestly.

\- Encourage loving action.

\- Protect private content.

\- Respect user vulnerability.

\- Speak with humility.

\- Encourage real community.

\- Let users return with peace.

  
  

26\. Theology and Content North Star

  

Every piece of content should help the user take one faithful step with more love, humility, peace, or courage.

  

If the content does not help the user love God or neighbor more faithfully, it probably does not belong in BibleQuest.

  

END OF EXPANSION PASS 5 — VOLUME VIII

  
  
  

EXPANSION PASS 6 — VOLUME VII: ENGINEERING BIBLE

  

This pass defines the engineering standards for BibleQuest. It converts the product, UX, brand, and QuestOS architecture into practical build instructions for Claude Code Fable 5 Ultracode and future developers.

  

The Engineering Bible exists to make sure BibleQuest ships as a real application, not a pretty prototype.

  

The goal is a launch-ready, mobile-first PWA with a scalable architecture, clean codebase, secure data model, and enough scaffolding to grow into a native app and broader QuestOS platform.

  
  

1\. Engineering Thesis

  

BibleQuest must be engineered like a real product from day one.

  

That means:

  

\- The app should run locally without mystery.

\- The codebase should be understandable to future AI agents and human developers.

\- The architecture should support Supabase, auth, private user data, quests, prayer, reflection, Bible content, journey, growth, and premium scaffolding.

\- The UI should not depend on fragile one-off components.

\- The design system should be encoded into reusable primitives.

\- Private spiritual data should be protected with database-level security.

\- Deployment should be documented.

\- Future features should be scaffolded without creating broken user experiences.

  

Engineering must serve the emotional product. The code should preserve the feeling of BibleQuest rather than fighting it.

  
  

2\. Technical North Star

  

Build a polished, installable, secure, mobile-first PWA at BibleQuest.us that supports the complete daily loop:

  

Open app → receive today’s verse → begin quest → complete quest → reflect → pray → see journey/growth update → return later.

  

Everything else is secondary.

  

If a technical decision does not help launch that loop or protect future scalability, simplify it.

  
  

3\. Recommended Stack

  

Application framework:

  

\- Next.js App Router.

\- TypeScript.

\- React Server Components where useful.

\- Server Actions or API routes for secure mutations.

  

Styling:

  

\- Tailwind CSS.

\- CSS variables for design tokens.

\- Custom BibleQuest design system components.

\- shadcn/ui only as accessible primitive scaffolding, not default visual identity.

  

Animation:

  

\- Framer Motion or Motion.

\- CSS animations for tiny pixel/ambient effects where lighter.

\- Reduced-motion support required.

  

Backend:

  

\- Supabase.

\- Postgres.

\- Supabase Auth.

\- Row Level Security.

\- Supabase Storage later for assets/user uploads if needed.

  

Validation:

  

\- Zod for schemas.

\- React Hook Form for forms.

  

State:

  

\- Server-first data where possible.

\- Zustand or lightweight state only for UI state.

\- Avoid overusing global client stores.

  

Data access:

  

\- Drizzle ORM or Prisma.

\- SQL migrations.

\- Typed query helpers.

  

Payments:

  

\- Stripe web subscription scaffold.

\- RevenueCat native subscription note for future iOS.

  

Analytics:

  

\- Plausible or PostHog with privacy-first event definitions.

  

Monitoring:

  

\- Sentry scaffold.

  

Email:

  

\- Resend scaffold for future lifecycle emails.

  

Deployment:

  

\- Vercel.

  

Native later:

  

\- Capacitor wrapper.

  
  

4\. Repository Setup Requirements

  

Claude Code should begin by inspecting the existing project folder. If no app exists, create one.

  

Preferred project commands:

  

\- pnpm install

\- pnpm dev

\- pnpm build

\- pnpm lint

\- pnpm typecheck

\- pnpm test, if tests are configured

\- pnpm db:generate

\- pnpm db:migrate

\- pnpm db:seed

  

Package manager:

  

Prefer pnpm unless the existing project already uses npm/yarn/bun consistently.

  

TypeScript:

  

\- Strict mode preferred.

\- Avoid any where possible.

\- Use explicit domain types for QuestOS concepts.

  

Environment:

  

\- .env.example must be created.

\- No secrets committed.

\- App should degrade gracefully with mock/local seed mode if Supabase env vars are absent during early development.

  
  

5\. Required Folder Structure

  

The codebase should use a structure similar to this:

  

app/

  layout.tsx

  globals.css

  manifest.ts or manifest.webmanifest

  (marketing)/

    page.tsx

    about/page.tsx

    pricing/page.tsx

    writing/page.tsx

    churches/page.tsx

  (auth)/

    sign-in/page.tsx

    sign-up/page.tsx

    callback/route.ts

  app/

    layout.tsx

    page.tsx

    quests/page.tsx

    quests/\[slug\]/page.tsx

    bible/page.tsx

    bible/\[book\]/page.tsx

    bible/\[book\]/\[chapter\]/page.tsx

    prayer/page.tsx

    reflection/page.tsx

    journey/page.tsx

    settings/page.tsx

    plus/page.tsx

  api/

    webhooks/stripe/route.ts

    health/route.ts

  

components/

  design-system/

  app-shell/

  marketing/

  quests/

  bible/

  prayer/

  reflection/

  journey/

  settings/

  plus/

  

lib/

  supabase/

  db/

  questos/

  auth/

  analytics/

  content/

  validation/

  utils/

  

styles/

  tokens.css

  animations.css

  

docs/

  README.md or project README at root

  SETUP.md

  DEPLOYMENT.md

  ENV.md

  SECURITY.md

  CONTENT\_GUIDE.md

  

supabase/

  migrations/

  seed.sql

  policies.sql

  

public/

  icons/

  pixel/

  illustrations/

  manifest.webmanifest

  

scripts/

  seed.ts

  import-bible.ts scaffold

  

This structure may be adapted to existing conventions, but the intent should remain: clear separation between product areas, domain logic, design system, and infrastructure.

  
  

6\. Route Requirements

  

Marketing routes:

  

/ — Landing page.

/about — Mission and philosophy.

/pricing — Plus/Patron explanation.

/writing — Editorial essays/devotional product thinking scaffold.

/churches — Church Mode future/waitlist scaffold.

/privacy — Privacy policy.

/terms — Terms placeholder.

  

Auth routes:

  

/sign-in

/sign-up

/auth/callback or equivalent Supabase callback route.

  

App routes:

  

/app — Home.

/app/quests — Quest browse.

/app/quests/\[slug\] — Quest detail.

/app/bible — Bible index.

/app/bible/\[book\] — Book overview.

/app/bible/\[book\]/\[chapter\] — Reader.

/app/prayer — Prayer journal.

/app/reflection — Reflection journal.

/app/journey — Journey timeline and growth tree.

/app/settings — Settings.

/app/plus — Plus/Patron.

  

API routes:

  

/api/health — Simple health route.

/api/webhooks/stripe — Stripe scaffold, disabled until configured.

/api/cron/daily-quests — Future scaffold, optional.

  

Rules:

  

\- No broken routes.

\- Future routes should be polished coming-soon pages or hidden.

\- Private app routes should require auth unless guest mode is intentionally supported.

  
  

7\. App Shell Implementation

  

App shell must include:

  

\- Parchment background.

\- Safe-area-aware layout.

\- Bottom navigation on mobile.

\- Desktop navigation adaptation.

\- Offline indicator scaffold.

\- Toast/save feedback.

\- Loading states.

\- Reduced-motion support.

  

AppShell component responsibilities:

  

\- Wrap authenticated app pages.

\- Provide navigation.

\- Provide consistent max-widths and page padding.

\- Provide background atmosphere hooks.

\- Respect mobile viewport/safe area.

  

BottomNav component:

  

Items:

  

\- Home

\- Quests

\- Bible

\- Prayer

\- Journey

  

Rules:

  

\- Use accessible labels.

\- Active state must be subtle.

\- Respect iOS bottom safe area.

\- Do not obscure content.

  
  

8\. Design System Implementation

  

BibleQuest must not look like default shadcn/Tailwind.

  

Create reusable components:

  

PaperCard

  

Props:

  

\- variant: paper | linen | atmospheric | outlined | quiet

\- padding: sm | md | lg

\- interactive: boolean

  

GentleButton

  

Props:

  

\- variant: outline | dark | ghost | text | danger

\- size: sm | md | lg

\- iconRight optional

  

EditorialSection

  

For landing page and major narrative sections.

  

QuestSlip

  

Dedicated quest card component.

  

VerseCard

  

Dedicated verse display component.

  

PrayerPage / PrayerCard

  

Private prayer surfaces.

  

ReflectionPage / ReflectionCard

  

Journal-like reflection surfaces.

  

GrowthTree

  

Visual growth component with staged tree states.

  

PixelIcon

  

Small pixel/glyph icon system.

  

SeasonalAtmosphere

  

Subtle background/seasonal motion and accents.

  

PilgrimageMarker

  

Timeline/milestone marker.

  

Design tokens should live in CSS variables and Tailwind theme extensions.

  

Do not repeat arbitrary colors everywhere.

  
  

9\. CSS and Theming Requirements

  

Create core CSS variables:

  

\--color-parchment

\--color-paper

\--color-linen

\--color-ink

\--color-graphite

\--color-charcoal

\--color-ash

\--color-mist

\--color-twilight

\--color-dusk

\--color-signal-blue

\--color-cerulean

\--color-olive-50 through 700

\--color-gold-50 through 700

\--color-blue-50 through 700

\--color-violet-50 through 700

\--color-rose-50 through 700

  

Typography variables:

  

\--font-display

\--font-sans

  

Radius variables:

  

\--radius-card

\--radius-large

\--radius-button

\--radius-pill

  

Motion variables:

  

\--ease-gentle

\--duration-fast

\--duration-normal

\--duration-slow

  

Theme modes:

  

\- light default.

\- dark/candle mode scaffold.

\- seasonal accent variables.

  

Reduced motion:

  

Use prefers-reduced-motion to disable ambient animation and simplify transitions.

  
  

10\. Database Implementation Requirements

  

Claude Code should implement migrations for the core V1 schema.

  

Minimum V1 tables:

  

\- profiles

\- faith\_providers

\- bible\_translations

\- bible\_books

\- bible\_chapters

\- bible\_verses

\- verse\_bookmarks

\- verse\_highlights

\- reading\_progress

\- quest\_templates

\- user\_daily\_quests

\- quest\_completions

\- prayers

\- reflections

\- journey\_events

\- growth\_events

\- milestones

\- user\_milestones

\- notification\_preferences

\- subscriptions

\- feature\_flags

  

If full Bible content import is too large for V1, the schema should still exist and seed a limited public-domain set.

  

Each table should include:

  

\- id uuid primary key where appropriate.

\- created\_at.

\- updated\_at where mutable.

\- user\_id for user-owned records.

  

Use database constraints where useful:

  

\- unique keys for slugs.

\- foreign keys.

\- indexes on user\_id.

\- indexes on date fields.

\- indexes on quest category/duration where useful.

  
  

11\. Row Level Security Implementation

  

RLS must be implemented for user-owned tables.

  

Policies:

  

profiles:

  

\- Users can select their own profile.

\- Users can update their own profile.

\- Users can insert their own profile.

  

prayers:

  

\- Users can select their own prayers.

\- Users can insert their own prayers.

\- Users can update their own prayers.

\- Users can delete/archive their own prayers.

  

reflections:

  

\- Users can select their own reflections.

\- Users can insert their own reflections.

\- Users can update their own reflections.

\- Users can delete/archive their own reflections.

  

journey\_events / growth\_events:

  

\- Users can select their own events.

\- Server actions can insert events for user actions.

\- Users should not modify generated events directly unless the app explicitly allows delete/export later.

  

Content tables:

  

\- Public read for active content.

\- No public write.

  

Subscription tables:

  

\- Users can read own subscription status.

\- Writes should be server/webhook controlled.

  

RLS acceptance criteria:

  

\- A user cannot query another user’s prayers or reflections.

\- Public users cannot write content templates.

\- Private content never appears in public responses.

  
  

12\. Seed Data Requirements

  

Seed scripts should create:

  

\- Christianity faith provider.

\- Default public-domain Bible translation metadata.

\- Limited Bible content if full import is not configured.

\- 75 starter quest templates.

\- 30 prayer prompts.

\- 30 reflection prompts.

\- 20 milestones.

\- Feature flags.

\- Seasonal calendar placeholder.

  

Seed data should be structured in files under lib/content or scripts/data, then loaded into Supabase.

  

Do not bury important seed content inside UI components.

  
  

13\. Server Actions / Domain Functions

  

Create domain-level functions for core actions.

  

Auth/profile:

  

\- getCurrentUser

\- getProfile

\- createProfile

\- updateProfile

\- completeOnboarding

  

Home:

  

\- getHomeData

\- getTodayDateKey

\- getDailyVerse

\- getOrAssignDailyQuest

  

Quests:

  

\- listQuestTemplates

\- getQuestBySlug

\- getOrCreateDailyQuest

\- startQuest

\- completeQuest

\- attachReflectionToQuest

  

Bible:

  

\- listBibleBooks

\- getBookChapters

\- getChapterVerses

\- saveReadingProgress

\- bookmarkVerse

\- highlightVerse

  

Prayer:

  

\- listPrayers

\- createPrayer

\- updatePrayer

\- archivePrayer

\- markPrayerAnswered

  

Reflection:

  

\- listReflections

\- createReflection

\- updateReflection

\- archiveReflection

  

Journey:

  

\- listJourneyEvents

\- listGrowthEvents

\- calculateGrowthTreeState

\- checkMilestones

  

Settings:

  

\- updateNotificationPreferences

\- updateAppearancePreferences

\- updateQuestPreferences

  

Subscription:

  

\- getSubscriptionStatus

\- hasFeature

\- createCheckoutSession scaffold

  

Rules:

  

\- Validate inputs with Zod.

\- Keep private writes server-side.

\- Keep business logic out of UI components.

  
  

14\. Bible Content Implementation

  

V1 acceptable approaches:

  

Option A: Full public-domain import.

  

Preferred if time allows.

  

Option B: Seeded limited content.

  

Acceptable for first Claude build if clearly documented and schema supports full import.

  

Implementation rules:

  

\- Do not use copyrighted translations without licensing.

\- Store translation metadata.

\- Reference verses by IDs and references.

\- Do not hard-code verse strings across the app except seed/demo constants.

\- Reader should be designed for full Bible scale.

  

Future import script:

  

scripts/import-bible.ts

  

Should document expected source format:

  

\- translation metadata.

\- books.

\- chapters.

\- verses.

  
  

15\. Quest Engine Implementation

  

V1 algorithm can be simple but structured.

  

Daily quest selection:

  

\- Check existing user\_daily\_quest for date.

\- If exists, return it.

\- If not, filter quest\_templates by active, free/premium access, preferences, season/tradition tags.

\- Pick a quest with light randomness.

\- Avoid same quest recently if completion history exists.

\- Store assigned quest.

  

Completion:

  

\- Mark daily quest completed.

\- Create quest\_completion.

\- Create journey\_event.

\- Create growth\_event.

\- Check milestones.

  

Quest detail should work whether quest came from daily assignment or browse.

  
  

16\. Growth Tree Implementation

  

V1 can use a simple staged visual.

  

Growth calculation:

  

\- Query growth\_events by user.

\- Aggregate by growth\_type.

\- Calculate total actions.

\- Determine stage.

\- Return stage + category totals.

  

UI:

  

\- Use SVG, CSS, or lightweight illustrated assets.

\- Animate gently on new growth.

\- Honor reduced motion.

  

No decay logic.

  

No lost streak logic.

  
  

17\. Prayer and Reflection Implementation

  

Prayer and reflection are privacy-critical.

  

Implementation requirements:

  

\- CRUD operations must require auth.

\- RLS must protect records.

\- UI should autosave drafts locally where feasible.

\- Error states should not lose user text.

\- Never send body text to analytics.

  

Draft behavior:

  

\- If save fails, keep text in component/local storage temporarily.

\- Show calm error: “We couldn’t save this yet. Your draft is still here.”

  

Archive instead of hard delete where possible, though hard delete may exist with confirmation.

  
  

18\. Authentication Implementation

  

Supabase Auth requirements:

  

\- Email/password or magic link.

\- Auth callback route.

\- Middleware/session handling.

\- Protected app routes.

\- Profile creation if missing.

  

Auth UX:

  

\- Calm error messages.

\- Redirect back to app after sign-in.

\- Do not block public landing pages.

  

Guest mode:

  

If implemented, guest data should be local-only and upgradeable later. If not implemented, create a clear account-based flow.

  
  

19\. PWA Implementation

  

PWA requirements:

  

\- manifest.webmanifest or Next metadata manifest.

\- App name: BibleQuest.

\- Short name: BibleQuest.

\- Theme color aligned to parchment/light.

\- Background color parchment.

\- Icons: 192x192, 512x512, maskable if possible.

\- Apple touch icon.

\- Mobile viewport.

\- Standalone display.

\- Offline fallback.

\- Service worker or framework equivalent.

  

Install guidance:

  

\- Detect iOS Safari where feasible.

\- Provide gentle “Add to Home Screen” instructions.

\- Do not nag repeatedly.

  
  

20\. Offline and Sync Implementation

  

V1 offline baseline:

  

\- Offline fallback route/page.

\- Cache app shell.

\- Cache recently viewed static content if feasible.

\- Preserve unsaved prayer/reflection drafts locally.

  

Future offline:

  

\- Local-first queue for prayer/reflection/quest completion.

\- Sync when online.

\- Conflict handling.

  

V1 should document limitations honestly.

  
  

21\. Analytics Implementation

  

Analytics should be event-based and privacy-first.

  

Allowed events:

  

\- onboarding\_started

\- onboarding\_completed

\- quest\_viewed

\- quest\_started

\- quest\_completed

\- reflection\_created

\- prayer\_created

\- prayer\_answered

\- bible\_chapter\_opened

\- verse\_bookmarked

\- journey\_viewed

\- plus\_page\_viewed

\- pwa\_install\_prompt\_viewed

\- pwa\_install\_prompt\_clicked

  

Forbidden event properties:

  

\- prayer body.

\- reflection body.

\- private note text.

\- sensitive spiritual disclosure.

  

Analytics wrapper:

  

Create lib/analytics/events.ts with typed event helpers.

  

If analytics env not configured, no-op safely.

  
  

22\. Payments Implementation

  

V1 payments are scaffolded unless credentials are supplied.

  

Stripe scaffold:

  

\- Product/price env placeholders.

\- createCheckoutSession placeholder.

\- webhook route.

\- subscriptions table.

\- getSubscriptionStatus helper.

\- hasFeature helper.

  

Feature gating rules:

  

\- Do not gate Bible reading, prayer, reflection, basic quests, or basic journey.

\- Gate only Plus features such as AI Guide, premium themes, advanced plans, reflection insights, voice journaling, etc.

  

UI:

  

\- Plus page should work even if checkout is not configured.

\- Show “Coming soon” or “Configure Stripe” in dev mode.

  
  

23\. Testing Requirements

  

Minimum test strategy:

  

Typecheck:

  

\- pnpm typecheck must pass.

  

Lint:

  

\- pnpm lint must pass.

  

Build:

  

\- pnpm build must pass.

  

Manual QA flows:

  

\- Sign up/sign in.

\- Complete onboarding.

\- View Home.

\- Complete quest.

\- Write reflection.

\- Create prayer.

\- Mark prayer answered.

\- Read Bible chapter.

\- Bookmark verse.

\- View Journey.

\- Update Settings.

\- View Plus.

\- Install PWA on mobile.

  

Optional automated tests:

  

\- Playwright for core flows.

\- Unit tests for growth calculation.

\- Unit tests for quest selection.

\- RLS policy tests if setup supports it.

  

Claude Code should include a QA checklist in the README even if not all tests are automated.

  
  

24\. Accessibility Engineering

  

Requirements:

  

\- Semantic HTML.

\- Proper headings.

\- Accessible form labels.

\- Keyboard navigability.

\- Visible focus states.

\- ARIA only when necessary.

\- Reduced motion support.

\- Sufficient color contrast.

\- Button tap targets at least 44px where possible.

\- Screen reader labels for icons.

\- No text hidden only in images.

  

Bible reader accessibility:

  

\- Adjustable text size scaffold.

\- Good line height.

\- No tiny verse numbers that break readability.

  

Prayer/reflection accessibility:

  

\- Clear labels.

\- Save status announced visually and programmatically where feasible.

  
  

25\. Security Engineering

  

Security requirements:

  

\- Use environment variables for all secrets.

\- No service role key in client bundle.

\- RLS required.

\- Validate all mutations.

\- Sanitize user-generated text when rendered.

\- Avoid dangerouslySetInnerHTML unless sanitized and necessary.

\- Protect webhooks with signatures.

\- Avoid leaking auth/session data.

\- Add SECURITY.md.

  

Sensitive content:

  

Prayer/reflection data must never be logged in server console or analytics.

  

Error reporting:

  

Sentry should scrub sensitive fields.

  
  

26\. Performance Engineering

  

Landing page:

  

\- Optimize images.

\- Lazy load heavy sections.

\- Avoid shipping app-only JavaScript to marketing pages.

\- Use metadata correctly.

  

App:

  

\- Avoid large client bundles.

\- Keep Bible reader efficient.

\- Do not fetch entire Bible at once.

\- Use pagination/lazy loading where appropriate.

\- Cache stable content.

  

Fonts:

  

\- Use next/font where possible.

\- Avoid excessive font weights.

  

Animation:

  

\- Keep ambient effects lightweight.

\- Avoid janky scroll effects.

  
  

27\. SEO and Metadata Engineering

  

Marketing pages should include:

  

\- Title.

\- Description.

\- Open Graph title/description/image scaffold.

\- Twitter card metadata.

\- Canonical URL.

\- robots settings.

  

Suggested homepage metadata:

  

Title: BibleQuest — One Meaningful Step with God Today

Description: BibleQuest helps Christians build a peaceful daily rhythm of Scripture, prayer, reflection, and real-life quests.

  

App pages can be noindex if private.

  

Writing pages should be SEO-ready for future essays.

  
  

28\. Environment Variables

  

Create .env.example with:

  

NEXT\_PUBLIC\_APP\_URL=

NEXT\_PUBLIC\_SUPABASE\_URL=

NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY=

SUPABASE\_SERVICE\_ROLE\_KEY=

DATABASE\_URL=

NEXT\_PUBLIC\_ANALYTICS\_ENABLED=

NEXT\_PUBLIC\_POSTHOG\_KEY=

NEXT\_PUBLIC\_POSTHOG\_HOST=

SENTRY\_DSN=

STRIPE\_SECRET\_KEY=

STRIPE\_WEBHOOK\_SECRET=

NEXT\_PUBLIC\_STRIPE\_PUBLISHABLE\_KEY=

STRIPE\_PLUS\_PRICE\_ID=

STRIPE\_PATRON\_PRICE\_ID=

RESEND\_API\_KEY=

OPENAI\_API\_KEY= future only

ANTHROPIC\_API\_KEY= future only

  

Document which are required for local V1 and which are optional.

  

Never require AI/payment keys for the core app to run in development.

  
  

29\. Documentation Requirements

  

README.md should include:

  

\- Project overview.

\- Product philosophy summary.

\- Stack.

\- Local setup.

\- Env vars.

\- Supabase setup.

\- Seed data.

\- Running dev server.

\- Build/deploy.

\- Testing.

\- Known limitations.

  

SETUP.md:

  

\- Supabase project setup.

\- Auth configuration.

\- Database migrations.

\- Seed scripts.

  

DEPLOYMENT.md:

  

\- Vercel setup.

\- Domain setup.

\- Environment variables.

\- Post-deploy checks.

  

SECURITY.md:

  

\- RLS overview.

\- Sensitive data rules.

\- Reporting vulnerabilities.

  

CONTENT\_GUIDE.md:

  

\- Quest writing.

\- Prayer prompts.

\- Reflection prompts.

\- Theology guardrails.

  
  

30\. Claude Code Execution Standards

  

When Claude Code builds BibleQuest, it must:

  

1\. Read the Codex.

2\. Produce a short implementation plan.

3\. Build the file structure.

4\. Implement design tokens first.

5\. Implement app shell.

6\. Implement data schema and seed content.

7\. Implement core domain functions.

8\. Implement screens in daily-loop priority.

9\. Implement privacy/security scaffolds.

10\. Run lint/typecheck/build.

11\. Fix errors.

12\. Document what was built.

13\. Document manual setup and known limitations.

  

Build order:

  

Phase 1 — Foundation

  

\- Next.js setup.

\- Tailwind/design tokens.

\- App shell.

\- Marketing shell.

\- Supabase client/server helpers.

\- Schema/migrations/seed scaffold.

  

Phase 2 — Core Loop

  

\- Onboarding.

\- Home.

\- Daily verse.

\- Daily quest.

\- Quest completion.

\- Reflection after quest.

\- Growth event.

\- Journey event.

  

Phase 3 — Core Sections

  

\- Bible reader.

\- Prayer journal.

\- Reflection journal.

\- Journey timeline.

\- Settings.

  

Phase 4 — PWA/Polish

  

\- Manifest.

\- Offline fallback.

\- Loading/empty/error states.

\- Accessibility.

\- Responsive polish.

  

Phase 5 — Monetization/Scaffold

  

\- Plus page.

\- Subscription model.

\- Stripe scaffolds.

\- Feature flags.

  

Phase 6 — QA/Docs

  

\- Lint/typecheck/build.

\- README.

\- Setup/deployment/security docs.

\- Manual QA checklist.

  

Claude must not stop at only generating a plan. It should implement as much as possible in the current repository.

  
  

31\. Anti-Patterns to Avoid

  

Do not:

  

\- Build a generic dashboard.

\- Use default shadcn styling as the final visual system.

\- Hard-code all content in components.

\- Store private user data without RLS.

\- Track prayer/reflection body in analytics.

\- Make PWA setup an afterthought.

\- Create broken placeholder pages.

\- Build AI Guide as an unguarded chatbot.

\- Build leaderboards.

\- Use streak-loss copy.

\- Gate core spiritual features behind Plus.

\- Ignore mobile Safari.

\- Ignore reduced motion.

\- Skip README/setup docs.

  
  

32\. Definition of Done for V1 Build

  

BibleQuest V1 is done when:

  

\- Landing page is polished.

\- PWA app shell works on mobile.

\- User can complete onboarding.

\- User can complete the daily loop.

\- Quest system works with seed content.

\- Bible reader works with seed/public-domain content.

\- Prayer journal works.

\- Reflection journal works.

\- Journey timeline works.

\- Growth tree updates.

\- Settings work.

\- Plus scaffold exists.

\- Auth/session handling works.

\- RLS policies protect private data.

\- PWA manifest/offline fallback exist.

\- Lint/typecheck/build pass.

\- README and setup docs exist.

\- Manual founder setup checklist exists.

\- Visual design feels like BibleQuest, not a template.

  
  

33\. Engineering North Star

  

Engineering is successful when the app is peaceful on the surface and disciplined underneath.

  

The user should feel warmth, simplicity, and spiritual clarity.

  

The codebase should contain structure, security, and room to grow.

  

If BibleQuest feels beautiful but cannot be maintained, engineering failed.

  

If BibleQuest is technically sound but feels generic, engineering also failed.

  

Build both.

  

END OF EXPANSION PASS 6 — VOLUME VII

  
  
  

EXPANSION PASS 7 — VOLUME IX: GROWTH, MARKETING, AND DISTRIBUTION

  

This pass defines how BibleQuest should be introduced to the world, how it should earn trust, how it should grow without becoming manipulative, and how it should eventually support a sustainable business.

  

BibleQuest growth must follow the same Constitution as the product:

  

Peace over productivity.

Invitation over obligation.

Transformation over engagement.

  

The marketing should feel like an extension of the app: warm, editorial, clear, human, and quietly memorable.

  
  

1\. Growth Thesis

  

BibleQuest should not grow by guilt, controversy, fear, outrage, or spiritual pressure.

  

BibleQuest should grow because people feel invited into something beautiful, useful, and spiritually grounding.

  

The product should be marketed less like software and more like a daily rhythm.

  

The core growth message:

  

One meaningful step with God today.

  

The marketing should make people think:

  

\- “That feels peaceful.”

\- “I could actually do that.”

\- “This does not feel like another habit app.”

\- “This could help me pray/read Scripture again.”

\- “This feels beautiful enough to keep.”

  

BibleQuest should earn trust before it asks for money.

  
  

2\. Brand Positioning

  

Category:

  

Christian spiritual companion.

  

Not:

  

\- Generic Bible app.

\- Productivity tracker.

\- Social prayer network.

\- AI preacher.

\- Meditation app with Christian labels.

  

Positioning statement:

  

BibleQuest helps Christians grow closer to God through a peaceful daily rhythm of Scripture, prayer, reflection, and real-life quests.

  

Short version:

  

A daily spiritual companion for Scripture, prayer, reflection, and small acts of faith.

  

Emotional version:

  

A living devotional journal that gives you one meaningful step with God each day.

  

Product version:

  

BibleQuest is an installable PWA that combines Bible reading, prayer journaling, reflection, daily quests, and gentle pilgrimage growth.

  

Founder/investor version:

  

BibleQuest is the first product built on QuestOS, a modular platform for turning belief into daily practice through faith-specific content, quests, reflection, prayer, and growth systems.

  
  

3\. Core Messaging Pillars

  

Pillar 1 — One Meaningful Step

  

Message:

  

You do not need to fix your whole spiritual life today. Begin with one step.

  

Supporting lines:

  

\- One verse.

\- One prayer.

\- One quest.

\- One day at a time.

\- Small steps still count.

  

Pillar 2 — Faith Becomes Practice

  

Message:

  

BibleQuest helps you live what you read.

  

Supporting lines:

  

\- Turn Scripture into action.

\- Practice kindness, patience, service, and prayer.

\- Carry the verse with you into real life.

  

Pillar 3 — Pilgrimage, Not Streaks

  

Message:

  

This is not a shame-based streak app. Your journey continues when you return.

  

Supporting lines:

  

\- No guilt when you miss a day.

\- Begin again with peace.

\- Growth does not disappear because you were gone.

  

Pillar 4 — A Journal That Grows With You

  

Message:

  

Your prayers, reflections, and quests become a record of your spiritual life.

  

Supporting lines:

  

\- Save prayers privately.

\- Reflect on what God is teaching you.

\- Watch your journey take shape over time.

  

Pillar 5 — Beautiful, Calm, and Built to Keep

  

Message:

  

BibleQuest should feel like something worth returning to for years.

  

Supporting lines:

  

\- Warm paper design.

\- Gentle pixel art.

\- Quiet motion.

\- A living tree of growth.

  
  

4\. One-Liners and Taglines

  

Primary tagline:

  

One meaningful step with God today.

  

Alternative taglines:

  

\- Scripture, prayer, reflection, and small acts of faith.

\- A living devotional journal for your daily walk with God.

\- Turn Scripture into daily practice.

\- Your journey with God, one quest at a time.

\- A peaceful way to read, pray, reflect, and grow.

\- Not a streak. A pilgrimage.

\- Begin again with one small step.

  

CTA lines:

  

\- Begin your journey.

\- Start today’s quest.

\- Open BibleQuest.

\- Take one quiet step.

\- Join the early journey.

\- Get BibleQuest.

  

Do not use:

  

\- Level up your faith.

\- Optimize your relationship with God.

\- Crush your Bible goals.

\- Never miss God again.

\- Unlock a better faith life.

  
  

5\. Audience Segments

  

Segment A — The Inconsistent Christian

  

Pain:

  

“I want to pray/read Scripture more, but I fall off.”

  

Message:

  

Begin again without shame.

  

Best channels:

  

\- Instagram Reels.

\- TikTok.

\- SEO essays.

\- Church/community shares.

  

Segment B — The Spiritually Overwhelmed

  

Pain:

  

“I do not know where to start.”

  

Message:

  

One verse, one prayer, one quest.

  

Best channels:

  

\- Landing page.

\- Short video explainers.

\- Search content.

\- Email onboarding.

  

Segment C — The Devotional App User

  

Pain:

  

“I already use Bible/devotional apps, but they do not help me act.”

  

Message:

  

BibleQuest turns Scripture into practice.

  

Best channels:

  

\- App comparison content.

\- Long-form writing.

\- Creator demos.

  

Segment D — The Returning Christian

  

Pain:

  

“I have been away for a while and feel awkward coming back.”

  

Message:

  

Your journey can continue today.

  

Best channels:

  

\- Gentle social content.

\- Personal founder story.

\- SEO: returning to prayer, how to start reading the Bible again.

  

Segment E — Churches and Small Groups

  

Pain:

  

“We want people to practice faith during the week, not just attend on Sunday.”

  

Message:

  

BibleQuest helps faith become a daily rhythm.

  

Best channels:

  

\- Direct outreach.

\- Church demos.

\- Pastors/ministry leaders.

\- Beta cohorts.

  

Segment F — Families

  

Pain:

  

“We want a simple way to pray/read/act together.”

  

Message:

  

Small shared quests for families and faith at home.

  

Best channels:

  

\- Parent creators.

\- Church newsletters.

\- Family ministry outreach.

  
  

6\. Landing Page Funnel

  

The landing page should be a narrative funnel.

  

Top of page goal:

  

Create emotional clarity.

  

Middle of page goal:

  

Show how the app works.

  

Bottom of page goal:

  

Convert to install, signup, or waitlist.

  

Recommended page structure:

  

1\. Hero

  

Headline:

  

What if growing closer to God felt less overwhelming?

  

Subheadline:

  

BibleQuest gives you one verse, one prayer, one reflection, and one small quest each day.

  

CTA:

  

Begin your journey.

  

Secondary:

  

See how it works.

  

2\. Problem Section

  

Copy direction:

  

Most people do not lack access to Scripture. They lack a gentle rhythm for living it.

  

3\. The Daily Rhythm

  

Show four cards:

  

\- Read.

\- Pray.

\- Reflect.

\- Act.

  

4\. Product Demo

  

Show simulated app moments:

  

\- Today’s verse.

\- Quest slip.

\- Prayer page.

\- Growth tree.

  

5\. Pilgrimage, Not Streaks

  

Explain why BibleQuest avoids shame-based habit tracking.

  

6\. Your Living Journal

  

Show prayers, reflections, answered prayers, and journey timeline.

  

7\. Growth Tree

  

Explain symbolic growth.

  

8\. Free Promise

  

Core spiritual tools are free.

  

9\. Plus / Patron

  

Deeper guidance and support for the mission.

  

10\. Churches / Families

  

Future/community direction.

  

11\. FAQ

  

Answer trust questions.

  

12\. Final CTA

  

Begin with one step.

  
  

7\. Landing Page FAQ

  

Suggested questions:

  

What is BibleQuest?

  

BibleQuest is a daily spiritual companion that helps Christians read Scripture, pray, reflect, and complete small real-life quests of faith.

  

Is BibleQuest free?

  

The core experience should be free: Bible reading, daily quests, prayer, reflection, and basic journey growth. Plus features may deepen the experience later.

  

Is this replacing church?

  

No. BibleQuest is meant to support your walk with God, not replace church, clergy, community, or pastoral care.

  

What are quests?

  

Quests are small spiritual actions inspired by Scripture and Christian practice, such as encouraging someone, praying for a person, practicing gratitude, reading a passage, or serving quietly.

  

Is this a streak app?

  

No. BibleQuest uses pilgrimage language rather than shame-based streaks. If you miss time, your journey continues when you return.

  

Will my prayers and reflections be private?

  

Prayer and reflection content should be private by default. BibleQuest should never sell personal data or use private journal text for analytics.

  

Will BibleQuest use AI?

  

BibleQuest may include an AI Guide later as a study and reflection companion. AI responses are not Scripture and should not replace trusted clergy, pastors, priests, spiritual directors, therapists, or community.

  
  

8\. SEO Strategy

  

BibleQuest SEO should be built around helpful, evergreen spiritual questions.

  

SEO categories:

  

Bible habit content:

  

\- How to start reading the Bible again.

\- Where to start reading the Bible.

\- How to build a Bible reading habit.

\- Short Bible reading plans for busy people.

  

Prayer habit content:

  

\- How to start praying again.

\- Simple prayers for morning.

\- How to pray when you feel distracted.

\- What to write in a prayer journal.

  

Faith practice content:

  

\- Small acts of kindness for Christians.

\- How to practice gratitude as a Christian.

\- How to live out Scripture daily.

\- Christian habits that fit a busy life.

  

Returning to faith content:

  

\- How to return to prayer after a long time.

\- How to come back to God without shame.

\- Starting over spiritually.

  

Product-led SEO:

  

\- Bible app without streaks.

\- Christian prayer journal app.

\- Christian habit app.

\- Daily devotional quest app.

\- Bible reading and prayer app.

  

SEO style rules:

  

\- Helpful first.

\- No keyword stuffing.

\- No exploitative fear content.

\- No fake theological authority.

\- Write with humility.

  

Writing page strategy:

  

BibleQuest should include a /writing section with essays that build trust and brand authority.

  

Potential essays:

  

\- Why BibleQuest does not use shame streaks.

\- Faith is not a productivity system.

\- One meaningful step is enough for today.

\- What makes a spiritual app feel peaceful?

\- How to build a prayer habit without guilt.

\- Why quests are small acts of faith, not religious chores.

  
  

9\. Social Strategy

  

BibleQuest social should feel calm, beautiful, and shareable.

  

Primary channels:

  

\- Instagram Reels.

\- TikTok.

\- YouTube Shorts.

\- Threads/X optional.

\- Pinterest optional for quote/verse visuals.

  

Social content pillars:

  

1\. One Small Quest

  

Short videos showing a daily quest.

  

Example:

  

“Today’s BibleQuest: encourage one person who may need kindness.”

  

2\. Gentle Return

  

Content for people who have missed prayer/Bible reading.

  

Example:

  

“You are not behind. Begin again with one verse.”

  

3\. App Atmosphere

  

Beautiful UI clips showing the app experience.

  

Example:

  

Paper card animation, pixel candle, growth tree.

  

4\. Founder Build Journey

  

Show the process of building BibleQuest.

  

Example:

  

“I’m building a Christian app that refuses to shame people with streaks.”

  

5\. Scripture Into Action

  

Connect a verse to a small action.

  

Example:

  

“1 Thessalonians 5:11 → text someone encouragement today.”

  

6\. Product Philosophy

  

Explain why BibleQuest is different.

  

Example:

  

“Most apps want more screen time. BibleQuest wants you to close the app and do something faithful.”

  
  

10\. Short-Form Video Concepts

  

Video 1 — The Problem

  

Hook:

  

“Most Bible apps give you content. I wanted one that gave me direction.”

  

Beats:

  

\- Show noisy phone/app grid.

\- Show BibleQuest opening.

\- Show one verse, one quest, one prayer.

\- End with app name.

  

Video 2 — Not a Streak

  

Hook:

  

“I’m building a Christian app with no shame streaks.”

  

Beats:

  

\- Show typical streak language blurred/abstract.

\- Show BibleQuest: “Welcome back. Your journey continues.”

\- Show growth tree.

\- CTA: “Begin again.”

  

Video 3 — One Quest Today

  

Hook:

  

“Here’s your tiny Christian quest for today.”

  

Quest:

  

Text someone: “I’m grateful for you.”

  

Close:

  

“Small acts still count.”

  

Video 4 — Living Journal

  

Hook:

  

“What if your prayer journal grew with you?”

  

Beats:

  

\- Prayer card.

\- Reflection card.

\- Journey timeline.

\- Tree update.

  

Video 5 — Founder Story

  

Hook:

  

“I’m tired of apps that make faith feel like homework.”

  

Beats:

  

\- Founder problem.

\- Product vision.

\- BibleQuest UI.

\- Invite beta users.

  

Video 6 — Sunday Return

  

Hook:

  

“If you haven’t prayed all week, this is not a guilt trip.”

  

Beats:

  

\- Gentle Sunday copy.

\- One verse.

\- One prayer.

\- One step.

  

Video 7 — Design Differentiator

  

Hook:

  

“Christian apps do not have to look generic.”

  

Beats:

  

\- Show Living Editorial style.

\- Paper/pixel/prayer language.

\- Tiny candle/tree motion.

  
  

11\. Founder-Led Marketing

  

BibleQuest should use founder-led marketing early.

  

Why:

  

\- People trust a person before they trust a new faith app.

\- The product has a clear philosophy.

\- The build journey is interesting.

\- The founder can explain why the app rejects shame-based growth.

  

Founder content themes:

  

\- Why I’m building BibleQuest.

\- Why faith should not feel like homework.

\- Building in public.

\- Design decisions.

\- Quest examples.

\- Theology/safety humility.

\- What I’m learning.

\- Beta user invitations.

  

Tone:

  

\- Honest.

\- Humble.

\- Warm.

\- Not preachy.

\- Not pretending to be a theologian.

  

Example founder post:

  

I’m building BibleQuest because I wanted a Christian app that did not make faith feel like a streak, scoreboard, or content feed.

  

The idea is simple:

  

one verse,

one prayer,

one reflection,

one small quest,

one step with God today.

  

If you miss time, you are not punished.

  

Your journey continues.

  
  

12\. Email Strategy

  

Email should support onboarding, retention, and trust without spam.

  

Email types:

  

\- Welcome email.

\- First quest email.

\- Gentle return email.

\- Weekly recap.

\- Product updates.

\- Seasonal pilgrimage emails.

\- Founder letters.

\- Plus/Patron explanation.

  

Welcome email structure:

  

Subject ideas:

  

\- Welcome to BibleQuest

\- Begin with one small step

\- Your journey starts here

  

Body:

  

\- Welcome.

\- Explain one verse/prayer/quest.

\- Reassure no shame/streak pressure.

\- CTA to open app.

  

Gentle return email:

  

Subject:

  

Your journey continues

  

Body:

  

\- No guilt.

\- One verse.

\- One small invitation.

\- CTA.

  

Weekly recap:

  

Include counts but frame gently:

  

\- Quests completed.

\- Prayers written.

\- Reflections saved.

\- Verses read.

\- One line of encouragement.

  

Do not include private prayer/reflection text unless explicitly user-enabled.

  
  

13\. Waitlist and Prelaunch Strategy

  

If BibleQuest launches with a waitlist first:

  

Waitlist promise:

  

Join the early journey and help shape a peaceful Christian app for Scripture, prayer, reflection, and daily quests.

  

Waitlist fields:

  

\- Email.

\- First name optional.

\- Tradition optional.

\- What brings you here? optional.

\- Church/family interest optional.

  

Waitlist segments:

  

\- Individual user.

\- Church/ministry leader.

\- Parent/family.

\- Creator/partner.

  

Prelaunch milestones:

  

\- Landing page live.

\- Waitlist opens.

\- First product demo video.

\- Founder letter.

\- Beta group selected.

\- Beta feedback cycle.

\- Public V1 launch.

  

Prelaunch content:

  

\- Demo clips.

\- Design philosophy.

\- Quest examples.

\- Founder posts.

\- Behind-the-scenes build.

\- Beta invitation.

  
  

14\. Beta Strategy

  

Beta should be small and focused.

  

Ideal beta group:

  

\- 25–100 early users.

\- Mix of traditions.

\- Mix of daily/returning/exploring users.

\- A few church/ministry leaders.

  

Beta goals:

  

\- Does the daily loop make sense?

\- Do quests feel helpful?

\- Does the app feel peaceful?

\- Does the no-shame approach resonate?

\- Do users return?

\- Are prayers/reflections trusted?

\- Does the design feel premium?

\- What feels confusing?

  

Beta feedback questions:

  

\- What did you think BibleQuest was for before using it?

\- What did you actually do in your first session?

\- Did anything feel guilt-based or weird?

\- Did any quest feel unsafe, awkward, or too vague?

\- Would you return tomorrow?

\- What would make this worth keeping?

\- Would you recommend this to someone?

  

Beta success criteria:

  

\- Users understand the product promise.

\- Users complete quests.

\- Users create prayers/reflections.

\- Users describe the app as peaceful/useful.

\- No major trust issues.

  
  

15\. Church Outreach Strategy

  

Church outreach should be humble and practical.

  

Position BibleQuest as:

  

A personal daily companion that can later support churches and small groups.

  

Do not position it as:

  

A replacement for church apps, pastoral care, Bible study, or discipleship programs.

  

Outreach targets:

  

\- Local churches.

\- Small group leaders.

\- Youth/young adult leaders.

\- Catholic parish ministry leaders.

\- Non-denominational pastors.

\- Campus ministry leaders.

\- Christian school/college groups.

  

Outreach message:

  

Hi \[Name\],

  

I’m building BibleQuest, a peaceful Christian app that helps people turn Scripture into daily practice through one verse, one prayer, one reflection, and one small quest each day.

  

It is not meant to replace church. The goal is to help people carry faith into the week with small, doable acts of prayer, kindness, service, and Scripture.

  

I’d love to show you the early version and hear what would make something like this actually useful for your community.

  

No pressure — I’m mostly looking for honest feedback from people who care about discipleship.

  

Best,

Brendan

  

Church demo should show:

  

\- Daily quest.

\- Prayer/reflection privacy.

\- Growth tree.

\- Future group/church tools.

\- No leaderboards/no shame approach.

  
  

16\. Creator and Partner Strategy

  

Potential partners:

  

\- Christian creators.

\- Pastors/priests with online presence.

\- Prayer/Bible study creators.

\- Faith-based designers/builders.

\- Christian mental health/wellness voices, with boundaries.

\- Church content teams.

  

Partner formats:

  

\- Quest of the day collaboration.

\- Founder interview.

\- Beta invitation.

\- Sponsored devotional series later.

\- Seasonal pilgrimage collaboration.

  

Partner rules:

  

\- Avoid polarizing rage-bait figures.

\- Avoid prosperity/guilt-heavy content creators.

\- Avoid theology-war accounts as core growth channel.

\- Prioritize trustworthy, warm, spiritually mature voices.

  

Creator brief:

  

BibleQuest is a peaceful Christian app built around one verse, one prayer, one reflection, and one small quest each day. The tone is gentle and no-shame. The product is not a replacement for church; it helps people practice faith during the week.

  
  

17\. App Store / PWA Distribution

  

V1 distribution:

  

\- Web app at BibleQuest.us.

\- PWA install instructions.

\- Mobile Safari optimization.

\- Add to Home Screen guidance.

  

Later distribution:

  

\- iOS wrapper via Capacitor.

\- Android wrapper if useful.

\- App Store listing.

\- Play Store listing.

  

PWA install education:

  

Use gentle UI:

  

“Want BibleQuest on your home screen?”

  

Explain:

  

\- Open share menu.

\- Tap Add to Home Screen.

\- BibleQuest will open like an app.

  

Do not nag repeatedly.

  

App Store visual direction:

  

Screenshots:

  

1\. One Meaningful Step Today.

2\. Turn Scripture Into Action.

3\. Pray and Reflect Privately.

4\. Your Journey Continues.

5\. Watch Your Growth Take Shape.

  

App Store description first paragraph:

  

BibleQuest helps Christians build a peaceful daily rhythm of Scripture, prayer, reflection, and small acts of faith. Each day, receive one verse, one prayer prompt, one reflection, and one practical quest to carry into real life.

  
  

18\. Referral Strategy

  

BibleQuest referrals should feel like invitation, not growth hacking.

  

Referral copy:

  

\- Invite someone to begin one small step with God.

\- Share today’s quest.

\- Send this verse to someone who may need encouragement.

  

Referral mechanics:

  

V1:

  

\- Share verse card.

\- Share quest card.

\- Share landing page.

  

Later:

  

\- Invite family/group.

\- Shared pilgrimage.

\- Church invite code.

  

Do not:

  

\- Offer spiritual rewards for referrals.

\- Gamify invites aggressively.

\- Create pressure to evangelize through app sharing.

  
  

19\. Share Card Strategy

  

Share cards should be beautiful and restrained.

  

Card types:

  

\- Verse card.

\- Quest card.

\- Reflection prompt card.

\- Prayer prompt card.

\- Founder quote card.

\- Seasonal card.

  

Visual style:

  

\- Parchment background.

\- Serif headline.

\- Tiny pixel glyph.

\- BibleQuest wordmark.

\- Optional subtle border.

  

Share card examples:

  

Verse card:

  

“Encourage one another and build each other up.”

1 Thessalonians 5:11

BibleQuest

  

Quest card:

  

Today’s Quest

Encourage one person who may need kindness.

BibleQuest

  

Return card:

  

You are not behind.

Begin again with one small step.

BibleQuest

  
  

20\. Pricing and Monetization Messaging

  

BibleQuest monetization must be careful.

  

Free promise:

  

The essentials are free: Scripture, prayer, reflection, daily quests, and basic journey growth.

  

Plus positioning:

  

Plus helps users go deeper with advanced guidance, personalization, premium themes, insights, and future AI tools.

  

Patron positioning:

  

Patron supports the mission and helps keep BibleQuest accessible.

  

Good pricing language:

  

\- “Free for the essentials.”

\- “Go deeper with Plus.”

\- “Support the mission as a Patron.”

\- “Your relationship with God is not paywalled.”

  

Bad pricing language:

  

\- “Unlock deeper access to God.”

\- “Premium believers get more.”

\- “Your spiritual growth is limited.”

\- “Pay to complete your journey.”

  

Pricing page should include:

  

\- Free tier.

\- Plus tier.

\- Patron tier.

\- Church Mode future interest.

\- FAQ.

\- Free promise statement.

  
  

21\. Launch Plan

  

Phase 0 — Foundation

  

\- Domain secured.

\- Codex created.

\- Product architecture defined.

\- Design direction defined.

\- Claude Code prompt prepared.

  

Phase 1 — Build MVP

  

\- Landing page.

\- PWA core loop.

\- Quest system.

\- Prayer/reflection.

\- Journey/growth.

\- Auth.

\- Seed content.

  

Phase 2 — Private Alpha

  

\- Founder-only testing.

\- Mobile Safari test.

\- PWA install test.

\- Fix obvious UX bugs.

\- Review content safety.

  

Phase 3 — Closed Beta

  

\- 25–100 early users.

\- Feedback form.

\- Weekly iteration.

\- Track activation and quest completion.

  

Phase 4 — Public Beta

  

\- Launch landing page publicly.

\- Social content begins.

\- Founder-led videos.

\- Waitlist/beta invites.

\- Church feedback outreach.

  

Phase 5 — V1 Launch

  

\- Product live.

\- Announcement post.

\- Founder letter.

\- Demo video.

\- Email launch.

\- Creator outreach.

\- SEO writing begins.

  

Phase 6 — Post-Launch

  

\- Fix onboarding friction.

\- Improve quest content.

\- Add share cards.

\- Improve install prompts.

\- Add weekly recap.

\- Prepare Plus features.

  
  

22\. Launch Assets Checklist

  

Before launch, create:

  

\- Logo/wordmark.

\- App icon.

\- PWA icons.

\- Social avatar.

\- Social banner.

\- 5–10 share cards.

\- 5 app screenshots.

\- 1 product demo video.

\- Founder launch letter.

\- FAQ.

\- Privacy policy.

\- Terms.

\- Press blurb.

\- Beta invite message.

\- Church outreach message.

\- Creator brief.

\- Email welcome sequence.

  
  

23\. Press and Public Narrative

  

BibleQuest public narrative:

  

A founder-built Christian app rejecting shame-based habit tracking and helping people turn Scripture into daily practice.

  

Press one-liner:

  

BibleQuest is a peaceful Christian app that combines Scripture, prayer, reflection, and real-life quests to help users take one meaningful step with God each day.

  

Founder story angle:

  

“I wanted a faith app that did not make spiritual growth feel like homework, a scoreboard, or a content feed.”

  

Design angle:

  

“BibleQuest uses a warm Living Editorial design language — paper, pixel art, and prayer — to make digital spiritual practice feel human and calm.”

  

Product angle:

  

“Instead of maximizing screen time, BibleQuest encourages users to complete one small act of faith and carry it into real life.”

  
  

24\. Growth Metrics

  

Track metrics that reflect meaningful use, not just attention.

  

Acquisition:

  

\- Landing page visits.

\- CTA clicks.

\- Signup conversion.

\- PWA install intent.

\- Referral/share clicks.

  

Activation:

  

\- Onboarding completion.

\- First quest viewed.

\- First quest completed.

\- First prayer created.

\- First reflection created.

\- First Bible reading session.

  

Engagement:

  

\- Weekly meaningful action rate.

\- Quest completion rate.

\- Prayer/reflection creation rate.

\- Return-after-absence rate.

\- Bible reading sessions.

  

Retention:

  

\- Day 1 return.

\- Day 7 return.

\- Day 30 return.

\- Return after missed days.

  

Revenue:

  

\- Plus page views.

\- Plus conversion.

\- Patron conversion.

\- Churn.

  

Qualitative:

  

\- “Peaceful” mentions.

\- “Helpful” mentions.

\- App worth keeping.

\- Trust concerns.

\- Quest usefulness.

  

Do not optimize for:

  

\- Endless screen time.

\- Addictive loops.

\- Shame-driven streak return.

\- Viral outrage.

  
  

25\. Ethical Growth Rules

  

BibleQuest must not use:

  

\- Shame notifications.

\- Fear-based conversion.

\- Spiritual guilt for premium.

\- Dark patterns.

\- Fake scarcity.

\- Manipulative testimonials.

\- Public spiritual comparison.

\- Prayer data for ad targeting.

\- Sensitive journal text for marketing.

  

BibleQuest may use:

  

\- Honest founder story.

\- Beautiful product demos.

\- Helpful writing.

\- Gentle reminders.

\- Clear free/premium distinction.

\- Opt-in emails.

\- Privacy-respecting analytics.

\- Transparent support/patron messaging.

  
  

26\. Content Calendar — First 30 Days

  

Week 1 — Introduction

  

Day 1: Founder post — why BibleQuest exists.

Day 2: Product clip — one verse, one prayer, one quest.

Day 3: Essay — Faith should not feel like homework.

Day 4: Quest of the day video.

Day 5: UI/design clip.

Day 6: Gentle return post.

Day 7: Sunday reflection post.

  

Week 2 — Differentiation

  

Day 8: No shame streaks video.

Day 9: Growth tree preview.

Day 10: Prayer journal privacy post.

Day 11: Quest example carousel.

Day 12: Bible reader preview.

Day 13: Founder build update.

Day 14: Beta invite.

  

Week 3 — Trust

  

Day 15: Theology guardrails post.

Day 16: Privacy promise post.

Day 17: Church Mode future post.

Day 18: App walkthrough video.

Day 19: One-minute prayer prompt.

Day 20: Reflection prompt post.

Day 21: Sunday return post.

  

Week 4 — Beta / Launch

  

Day 22: Beta applications open.

Day 23: Early user feedback, if available.

Day 24: Quest examples video.

Day 25: Why PWA first.

Day 26: Plus/patron philosophy.

Day 27: Founder letter excerpt.

Day 28: Launch countdown.

Day 29: Launch/demo.

Day 30: Thank-you and next steps.

  
  

27\. First 10 Essay Ideas

  

1\. Why Faith Should Not Feel Like Homework

2\. Why BibleQuest Does Not Use Shame Streaks

3\. One Meaningful Step Is Enough for Today

4\. How to Start Praying Again Without Feeling Fake

5\. How to Start Reading the Bible When You Feel Overwhelmed

6\. Turning Scripture Into Small Acts of Faith

7\. A Christian App Can Be Beautiful, Calm, and Useful

8\. Pilgrimage, Not Productivity

9\. What Makes a Prayer Journal Worth Keeping?

10\. Building BibleQuest: Paper, Pixel, and Prayer

  

Essay style:

  

\- 800–1,500 words.

\- Warm, clear, founder-led.

\- Helpful, not preachy.

\- Product philosophy woven naturally.

\- CTA at end.

  
  

28\. Community Strategy

  

BibleQuest community should grow slowly and safely.

  

V1:

  

\- No public feed.

\- No comments.

\- No user-generated public content.

  

Early community channels:

  

\- Email list.

\- Private beta feedback form.

\- Optional Discord/Slack only if moderation is realistic.

\- Church feedback calls.

  

Community principles:

  

\- Encourage, do not compare.

\- Protect privacy.

\- Avoid theology-war culture.

\- Keep moderation clear.

  

Future community features should be heavily designed before release.

  
  

29\. Growth Experiments Backlog

  

Low-risk experiments:

  

\- Waitlist landing page A/B headline.

\- Quest of the day share cards.

\- Founder build-in-public posts.

\- Beta church cohort.

\- Weekly founder email.

\- PWA install prompt timing.

\- Short video demo variants.

\- SEO essays.

\- Church outreach script variants.

\- Creator micro-collabs.

  

Avoid experiments that:

  

\- Use guilt.

\- Expose private data.

\- Increase anxiety.

\- Make the app feel addictive.

\- Encourage comparison.

  
  

30\. Growth North Star

  

BibleQuest growth is successful when more people are taking small, faithful, real-life steps with God because the product exists.

  

Growth should not be measured only by scale.

  

It should be measured by trust, usefulness, peace, and return without shame.

  

If marketing gets attention but damages trust, it failed.

  

If growth is slower but builds a product people keep for years, it is on the right path.

  

END OF EXPANSION PASS 7 — VOLUME IX

  
  
  

EXPANSION PASS 8 — VOLUME X: CLAUDE CODE FABLE 5 ULTRACODE MASTER PROMPT

  

This pass creates the implementation prompt for Claude Code Fable 5 Ultracode. It is designed to be pasted directly into Claude Code after the developer gives Claude access to the BibleQuest repository and either attaches/exports this Codex or places it in the project documentation.

  

This prompt assumes Claude Code can read the repository. If Claude cannot read the Google Doc directly, export this Codex as Markdown or paste the full Codex into the project as docs/BIBLEQUEST\_CODEX.md before running the prompt.

  

The goal of this prompt is not to inspire Claude.

  

The goal is to make Claude build.

  
  

MASTER PROMPT — BUILD BIBLEQUEST / QUESTOS V1

  

You are Claude Code Fable 5 Ultracode acting as the founding product engineering team for BibleQuest.

  

You are not a generic code assistant.

  

You are acting as:

  

\- Senior product architect.

\- Principal frontend engineer.

\- Principal backend engineer.

\- Mobile-first PWA engineer.

\- Supabase/Postgres engineer.

\- Design systems engineer.

\- UX engineer.

\- Security engineer.

\- Accessibility engineer.

\- Growth/product strategist.

\- Technical writer.

\- QA lead.

  

Your task is to build BibleQuest V1 as a real, launch-ready, mobile-first Progressive Web App based on the BibleQuest Codex.

  

The Codex is the source of truth. Read it carefully before implementing.

  

BibleQuest is a peaceful Christian spiritual companion that helps users grow closer to God through Scripture, prayer, reflection, and small daily quests of faith.

  

The product should feel like a living devotional journal:

  

Paper + Pixel + Prayer.

  

Living Editorial.

  

Warm, calm, spiritual, beautiful, modern, mobile-first, and built to keep.

  

This is not a generic Bible app.

  

This is not a streak tracker.

  

This is not a productivity dashboard.

  

This is not an AI preacher.

  

This is a launch-ready PWA and the first product built on QuestOS.

  
  

0\. SOURCE MATERIAL

  

Before you write code, read and internalize:

  

\- The entire BibleQuest Codex.

\- All existing project files.

\- Any existing README or setup notes.

\- Any existing design files or screenshots included in the repository.

  

If docs/BIBLEQUEST\_CODEX.md exists, use it as the canonical source.

  

If the repository is empty or incomplete, create the app from scratch.

  

If the repository already exists, preserve useful work but refactor ruthlessly toward the Codex.

  

Do not blindly overwrite valuable existing configuration.

  

Do not ask for permission after every small decision. Make senior-level implementation choices that follow the Codex, document them, and continue.

  
  

1\. PRODUCT NORTH STAR

  

Build the complete V1 daily loop:

  

Open app → receive today’s verse → receive today’s quest → begin quest → complete quest → reflect → pray → see journey/growth update → return later.

  

This loop matters more than every other feature.

  

A user should be able to:

  

\- Land on BibleQuest.us and understand the product.

\- Sign up or sign in.

\- Complete onboarding.

\- See a daily verse.

\- See a daily quest.

\- Complete the quest.

\- Write a reflection.

\- Create a prayer.

\- Read Bible content.

\- Bookmark a verse.

\- See their Journey timeline.

\- See their Growth Tree update.

\- Update settings.

\- Install the app as a PWA.

  

If time or complexity forces tradeoffs, preserve the core loop first.

  
  

2\. DESIGN NORTH STAR

  

The app must not look like default Tailwind, default shadcn, a generic dashboard, or a cheap devotional template.

  

The visual system must express:

  

\- Warm parchment.

\- White paper cards.

\- Hairline green-gray borders.

\- Literary serif headings.

\- Clean sans UI text.

\- Generous whitespace.

\- Gentle pixel accents.

\- Soft seasonal atmosphere.

\- Calm motion.

\- Mobile-native polish.

  

Core design language:

  

\- Living Editorial.

\- Paper + Pixel + Prayer.

\- Spiritual journal, not SaaS dashboard.

  

Use the design tokens and principles defined in the Codex.

  

Build custom BibleQuest components. You may use shadcn/ui as accessible primitives, but you must heavily restyle everything into the BibleQuest identity.

  

Do not ship generic UI.

  
  

3\. THEOLOGY AND SAFETY NORTH STAR

  

BibleQuest must be Christian, humble, and safe.

  

It must:

  

\- Make Scripture central.

\- Encourage prayer, reflection, kindness, service, gratitude, and humility.

\- Avoid shame and guilt-based engagement.

\- Respect denominational differences.

\- Avoid pretending to replace church, clergy, therapists, doctors, or emergency help.

\- Protect prayer/reflection privacy.

\- Avoid unsafe quests around abuse, fasting, medication, reconciliation, money, or crisis.

  

AI Guide is not a production feature in V1 unless specifically requested and properly guarded. Scaffold it only.

  

Do not build an unguarded chatbot that acts like spiritual authority.

  
  

4\. BUILD TARGET

  

Build a polished V1 application with:

  

Marketing / public:

  

\- Landing page at /

\- About page

\- Pricing/Plus page

\- Writing scaffold

\- Churches/future Church Mode page

\- Privacy page placeholder

\- Terms page placeholder

  

App / private:

  

\- /app Home

\- /app/quests

\- /app/quests/\[slug\]

\- /app/bible

\- /app/bible/\[book\]

\- /app/bible/\[book\]/\[chapter\]

\- /app/prayer

\- /app/reflection

\- /app/journey

\- /app/settings

\- /app/plus

  

Core systems:

  

\- Auth scaffold with Supabase.

\- Profile/onboarding.

\- Quest system.

\- Verse/Bible system.

\- Prayer journal.

\- Reflection journal.

\- Journey timeline.

\- Growth Tree.

\- PWA manifest/offline fallback.

\- Seed data.

\- Supabase schema/migrations.

\- RLS policies.

\- Plus/subscription scaffold.

\- Analytics scaffold without sensitive data.

\- Documentation.

  
  

5\. STACK REQUIREMENTS

  

Use the best stack for a modern V1 PWA:

  

\- Next.js App Router.

\- TypeScript.

\- Tailwind CSS.

\- Custom design system.

\- shadcn/ui only if helpful as accessible primitives.

\- Supabase for auth/database.

\- Postgres with RLS.

\- Zod for validation.

\- React Hook Form for forms where useful.

\- Framer Motion or Motion for gentle animations.

\- next/font for fonts where possible.

\- Vercel deployment readiness.

  

Recommended optional choices:

  

\- Drizzle ORM or Prisma for schema/types if useful.

\- Zustand only for lightweight UI state.

\- Sentry scaffold.

\- Plausible/PostHog scaffold.

\- Stripe scaffold.

  

Do not add unnecessary complexity that blocks V1.

  
  

6\. REPOSITORY RULES

  

If creating from scratch, use this structure or a close equivalent:

  

app/

  layout.tsx

  globals.css

  (marketing)/

    page.tsx

    about/page.tsx

    pricing/page.tsx

    writing/page.tsx

    churches/page.tsx

    privacy/page.tsx

    terms/page.tsx

  (auth)/

    sign-in/page.tsx

    sign-up/page.tsx

    callback/route.ts

  app/

    layout.tsx

    page.tsx

    quests/page.tsx

    quests/\[slug\]/page.tsx

    bible/page.tsx

    bible/\[book\]/page.tsx

    bible/\[book\]/\[chapter\]/page.tsx

    prayer/page.tsx

    reflection/page.tsx

    journey/page.tsx

    settings/page.tsx

    plus/page.tsx

  api/

    health/route.ts

    webhooks/stripe/route.ts

  

components/

  design-system/

  app-shell/

  marketing/

  quests/

  bible/

  prayer/

  reflection/

  journey/

  settings/

  plus/

  

lib/

  supabase/

  db/

  questos/

  auth/

  analytics/

  content/

  validation/

  utils/

  

styles/

  tokens.css

  animations.css

  

docs/

  SETUP.md

  DEPLOYMENT.md

  ENV.md

  SECURITY.md

  CONTENT\_GUIDE.md

  QA.md

  

supabase/

  migrations/

  seed.sql

  policies.sql

  

public/

  icons/

  pixel/

  illustrations/

  manifest.webmanifest

  

scripts/

  seed.ts

  import-bible.ts

  

If the existing project already has a good structure, adapt this without unnecessary churn.

  
  

7\. DESIGN SYSTEM IMPLEMENTATION

  

Create reusable components:

  

\- PaperCard

\- GentleButton

\- EditorialSection

\- QuestSlip

\- VerseCard

\- PrayerPage

\- PrayerCard

\- ReflectionPage

\- ReflectionCard

\- GrowthTree

\- PixelIcon

\- PixelCandle

\- PixelLeaf

\- PixelStar

\- SeasonalAtmosphere

\- PilgrimageMarker

\- AppShell

\- BottomNav

\- TopGreeting

  

Implement tokens:

  

Colors:

  

\- Parchment Canvas: \#fefffc

\- Paper Card: \#ffffff

\- Linen Wash: \#f9faf7

\- Ink Black: \#171717

\- Graphite: \#2c2c2c

\- Charcoal: \#444141

\- Ash: \#646464

\- Mist Border: \#dee2de

\- Twilight: \#282834

\- Dusk: \#1f1f29

\- Signal Blue: \#41a1cf

\- Cerulean: \#0081c0

  

Add extended BibleQuest colors:

  

\- Olive Grove.

\- Candle Gold.

\- Marian/Advent Blue.

\- Lenten Violet.

\- Rose Joy.

  

Typography:

  

\- Literary serif for display headings.

\- Clean sans for UI/body.

\- Use next/font where possible.

  

Motion:

  

\- Gentle.

\- Slow.

\- Meaningful.

\- Reduced-motion aware.

  

No confetti explosions.

No aggressive bounce.

No casino-like reward language.

  
  

8\. REQUIRED DATA MODEL

  

Implement or scaffold these tables:

  

\- profiles

\- faith\_providers

\- bible\_translations

\- bible\_books

\- bible\_chapters

\- bible\_verses

\- verse\_bookmarks

\- verse\_highlights

\- reading\_progress

\- quest\_templates

\- user\_daily\_quests

\- quest\_completions

\- prayers

\- reflections

\- journey\_events

\- growth\_events

\- milestones

\- user\_milestones

\- notification\_preferences

\- subscriptions

\- feature\_flags

  

Every user-owned table must include user\_id and RLS.

  

Private tables:

  

\- prayers

\- reflections

\- verse notes/highlights

\- journey\_events

\- growth\_events

\- notification\_preferences

  

Must be protected.

  

Do not track or expose raw prayer/reflection text in analytics.

  
  

9\. ROW LEVEL SECURITY

  

Implement RLS policies so users can only access their own private data.

  

Required user-owned policies:

  

\- select own records.

\- insert own records.

\- update own records.

\- delete/archive own records where appropriate.

  

Content tables can be public read, admin write later.

  

Do not skip RLS.

  

If complete RLS implementation cannot be fully automated, create supabase/policies.sql and docs/SECURITY.md with exact SQL and setup instructions.

  
  

10\. SEED CONTENT REQUIREMENTS

  

Seed the app with enough content to feel alive.

  

Minimum seed data:

  

\- Christianity faith provider.

\- Translation metadata for public-domain Bible content.

\- Limited Bible seed content if full Bible import is not included.

\- At least 75 starter quests.

\- At least 30 prayer prompts.

\- At least 30 reflection prompts.

\- At least 20 milestones.

\- Feature flags.

\- Seasonal placeholder data.

  

Quest categories:

  

\- Prayer.

\- Scripture.

\- Service.

\- Kindness.

\- Forgiveness.

\- Generosity.

\- Discipline.

\- Gratitude.

\- Silence.

\- Worship.

\- Family.

\- Community.

\- Reflection.

\- Patience.

  

Sensitive quests must follow the Theology and Content Guardrails.

  

Do not include unsafe fasting, abuse, medication, crisis, or coercive reconciliation prompts.

  
  

11\. CORE DOMAIN FUNCTIONS

  

Implement domain logic in lib/questos, not scattered in components.

  

Required modules:

  

lib/questos/quest-engine.ts

  

\- getOrAssignDailyQuest

\- listQuests

\- getQuestBySlug

\- startQuest

\- completeQuest

\- selectQuestTemplate

  

lib/questos/verse-engine.ts

  

\- getDailyVerse

\- listBibleBooks

\- getChapterVerses

\- saveReadingProgress

\- bookmarkVerse

\- highlightVerse

  

lib/questos/prayer-engine.ts

  

\- listPrayers

\- createPrayer

\- updatePrayer

\- archivePrayer

\- markPrayerAnswered

  

lib/questos/reflection-engine.ts

  

\- listReflections

\- createReflection

\- updateReflection

\- archiveReflection

\- attachReflectionToQuest

  

lib/questos/growth-engine.ts

  

\- createGrowthEvent

\- calculateGrowthTreeState

\- getGrowthSummary

\- checkMilestones

  

lib/questos/seasonal-engine.ts

  

\- getCurrentSeason

\- getSeasonalAccent

\- filterSeasonalQuests

  

lib/questos/subscription-engine.ts

  

\- getSubscriptionStatus

\- hasFeature

\- createCheckoutSession scaffold

  
  

12\. SCREEN REQUIREMENTS

  

Landing page:

  

Build a beautiful scrollytelling landing page with:

  

\- Floating nav.

\- Editorial hero.

\- Strong thesis.

\- Product demo cards.

\- Quest examples.

\- Growth tree section.

\- Prayer/reflection section.

\- Free promise.

\- Plus/Patron section.

\- Church/family future.

\- FAQ.

\- Final CTA.

  

Home:

  

Must include:

  

\- Greeting.

\- Today’s verse.

\- Today’s quest.

\- Quick prayer.

\- Reflection prompt.

\- Growth tree preview.

\- Continue reading.

\- Recent journey activity.

  

Quests:

  

Must include:

  

\- Quest browse.

\- Filters.

\- Daily quest.

\- Quest detail.

\- Begin quest.

\- Mark complete.

\- Reflection prompt after completion.

  

Bible:

  

Must include:

  

\- Book list.

\- Chapter list.

\- Reader.

\- Bookmark/highlight scaffold.

\- Continue reading.

\- Daily verse.

  

Prayer:

  

Must include:

  

\- Prayer list.

\- Create prayer.

\- Edit/archive prayer.

\- Mark answered.

\- Answer reflection.

  

Reflection:

  

Must include:

  

\- Reflection list.

\- Create reflection.

\- Edit/archive reflection.

\- Attach to quest where relevant.

  

Journey:

  

Must include:

  

\- Timeline.

\- Growth tree.

\- Milestones.

\- Recent actions.

  

Settings:

  

Must include:

  

\- Profile.

\- Preferences.

\- Tradition/calling.

\- Notifications scaffold.

\- Appearance.

\- Privacy/data.

\- Subscription.

\- Legal/support links.

  

Plus:

  

Must include:

  

\- Free promise.

\- Plus benefits.

\- Patron support.

\- Pricing cards/scaffold.

\- FAQ.

  
  

13\. UX COPY RULES

  

Use BibleQuest language.

  

Good copy:

  

\- “Your journey continues.”

\- “Begin with one small step.”

\- “A small quest is waiting.”

\- “Take a quiet moment.”

\- “Welcome back.”

\- “Small steps still count.”

\- “This became part of your journey.”

  

Never use:

  

\- “You failed.”

\- “Don’t lose your streak.”

\- “God is disappointed.”

\- “Crush your spiritual goals.”

\- “Level up your holiness.”

  

No shame.

No guilt-based engagement.

No productivity bro language.

  
  

14\. PWA REQUIREMENTS

  

BibleQuest must be installable.

  

Implement:

  

\- Web app manifest.

\- App icons placeholders if final assets not available.

\- Apple touch icon.

\- Theme/background colors.

\- Standalone display.

\- Safe-area support.

\- Offline fallback.

\- Add-to-home-screen guidance for iOS.

  

Document PWA testing steps.

  
  

15\. AUTH REQUIREMENTS

  

Use Supabase Auth.

  

Implement:

  

\- Sign up.

\- Sign in.

\- Sign out.

\- Session handling.

\- Auth callback route.

\- Protected app routes.

\- Profile creation if missing.

\- Onboarding completion state.

  

If auth env vars are missing in dev, provide clear setup messages or mock mode. Do not crash mysteriously.

  
  

16\. PRIVACY REQUIREMENTS

  

Prayer and reflection data are sensitive.

  

Implement:

  

\- RLS.

\- No private text in analytics.

\- Calm privacy copy.

\- Privacy section in settings.

\- Privacy policy placeholder.

\- Delete/export account scaffold.

  

Analytics event wrappers must not accept prayer/reflection body.

  

Sentry/error logs must scrub sensitive fields if configured.

  
  

17\. ANALYTICS REQUIREMENTS

  

Create typed analytics events.

  

Allowed events:

  

\- onboarding\_started

\- onboarding\_completed

\- quest\_viewed

\- quest\_started

\- quest\_completed

\- reflection\_created

\- prayer\_created

\- prayer\_answered

\- bible\_chapter\_opened

\- verse\_bookmarked

\- journey\_viewed

\- plus\_page\_viewed

\- pwa\_install\_prompt\_viewed

  

Do not track private text.

  

If analytics is not configured, no-op safely.

  
  

18\. PAYMENTS / PLUS REQUIREMENTS

  

Scaffold only unless real credentials exist.

  

Implement:

  

\- subscriptions table/model.

\- Plus page.

\- Feature flags.

\- hasFeature helper.

\- Stripe env placeholders.

\- Stripe webhook scaffold.

  

Do not gate:

  

\- Bible reading.

\- Daily quests.

\- Prayer journal.

\- Reflection journal.

\- Journey basics.

  

Premium can gate future:

  

\- AI Guide.

\- Personalized quest generation.

\- Advanced reading plans.

\- Premium themes.

\- Voice journaling.

\- Reflection insights.

\- Year in Review.

  
  

19\. ACCESSIBILITY REQUIREMENTS

  

Implement:

  

\- Semantic HTML.

\- Proper headings.

\- Accessible labels.

\- Keyboard navigability.

\- Visible focus states.

\- Reduced motion.

\- Sufficient color contrast.

\- 44px tap targets where possible.

\- Screen reader labels for icons.

  

Bible reader must be readable.

Prayer/reflection forms must not lose text.

  
  

20\. PERFORMANCE REQUIREMENTS

  

Optimize:

  

\- Landing page load.

\- Font loading.

\- Images/illustrations.

\- Client bundle size.

\- Bible reader data loading.

\- Mobile performance.

  

Do not fetch the entire Bible into the client.

  

Lazy-load heavy art.

  

Keep animations lightweight.

  
  

21\. DOCUMENTATION REQUIREMENTS

  

Create/update:

  

README.md

  

Include:

  

\- Project overview.

\- Product philosophy summary.

\- Stack.

\- Local setup.

\- Env vars.

\- Supabase setup.

\- Seed data.

\- Running dev server.

\- Build/deploy.

\- Testing.

\- Known limitations.

  

Create docs:

  

\- docs/SETUP.md

\- docs/DEPLOYMENT.md

\- docs/ENV.md

\- docs/SECURITY.md

\- docs/CONTENT\_GUIDE.md

\- docs/QA.md

  

Document every required manual setup step.

  
  

22\. BUILD PHASES

  

Execute in this order:

  

Phase 1 — Repository and Foundation

  

\- Inspect existing repo.

\- Decide whether to create or refactor.

\- Install dependencies.

\- Configure TypeScript/Tailwind.

\- Create design tokens.

\- Create base layout.

\- Create app shell.

  

Phase 2 — Data and Supabase

  

\- Create schema/migrations.

\- Create RLS policies.

\- Create Supabase helpers.

\- Create seed data.

\- Create domain types.

  

Phase 3 — Core Product Loop

  

\- Onboarding.

\- Home.

\- Daily verse.

\- Daily quest.

\- Quest completion.

\- Reflection after quest.

\- Growth tree update.

\- Journey event.

  

Phase 4 — Core Sections

  

\- Quests browse/detail.

\- Bible reader.

\- Prayer journal.

\- Reflection journal.

\- Journey timeline.

\- Settings.

  

Phase 5 — Marketing and PWA

  

\- Landing page.

\- About/pricing/writing/churches pages.

\- PWA manifest.

\- Offline fallback.

\- Install guidance.

  

Phase 6 — Plus and Scaffolds

  

\- Plus page.

\- Subscription scaffolding.

\- Analytics scaffolding.

\- AI Guide placeholder guarded by theology rules.

  

Phase 7 — QA and Documentation

  

\- Lint.

\- Typecheck.

\- Build.

\- Fix errors.

\- Manual QA checklist.

\- Docs.

\- Final summary.

  
  

23\. TESTING AND QA

  

Run:

  

\- pnpm lint

\- pnpm typecheck

\- pnpm build

  

If commands differ, document the correct commands.

  

Manually verify:

  

\- Landing page loads.

\- Sign up/sign in works or setup documented.

\- Onboarding completes.

\- Home renders.

\- Daily quest appears.

\- Quest can be completed.

\- Reflection can be saved.

\- Prayer can be created.

\- Prayer can be marked answered.

\- Bible content can be read.

\- Verse can be bookmarked.

\- Journey updates.

\- Growth tree updates.

\- Settings save.

\- Plus page works.

\- PWA manifest exists.

\- Mobile layout works.

\- No private text appears in analytics.

  

If something cannot be completed due to missing credentials, document it clearly and build the scaffold.

  
  

24\. DEFINITION OF DONE

  

BibleQuest V1 build is acceptable when:

  

\- It visually matches the Codex.

\- It has a complete daily loop.

\- It has seed content.

\- It has Supabase schema/RLS.

\- It protects private prayer/reflection data.

\- It has a working mobile-first app shell.

\- It has a polished landing page.

\- It has PWA setup.

\- It has Plus scaffold.

\- It has documentation.

\- It passes lint/typecheck/build or documents any unavoidable blocker.

\- It does not contain generic placeholder garbage.

\- It does not use shame-based copy.

\- It does not impersonate spiritual authority.

  
  

25\. FINAL RESPONSE REQUIRED FROM CLAUDE CODE

  

When finished, provide:

  

1\. What was built.

2\. Major files created/changed.

3\. How to run locally.

4\. Required environment variables.

5\. Supabase setup steps.

6\. Seed instructions.

7\. Deployment steps.

8\. What works now.

9\. Known limitations.

10\. Recommended next sprint.

11\. Any risks or manual review needed, especially content/theology/privacy.

  

Be honest.

  

Do not claim production readiness if payments, Bible licensing, auth, or deployment require manual setup.

  
  

26\. ABSOLUTE NON-NEGOTIABLES

  

Do not build a generic dashboard.

  

Do not ship default shadcn styling.

  

Do not use guilt or shame copy.

  

Do not create leaderboards.

  

Do not create an unguarded AI preacher.

  

Do not expose private prayers or reflections.

  

Do not track prayer/reflection body text.

  

Do not use copyrighted Bible translations without licensing.

  

Do not gate core spiritual features behind Plus.

  

Do not skip RLS.

  

Do not skip documentation.

  

Do not stop after a plan.

  

Build the app.

  
  

27\. CLOSING DIRECTIVE

  

BibleQuest should be peaceful on the surface and disciplined underneath.

  

The product should feel like a living devotional journal.

  

The code should feel like a real foundation.

  

The user should leave with one meaningful step, not more noise.

  

Build BibleQuest V1 now.

  

END MASTER PROMPT

  
  

SUPPLEMENTAL PROMPT — IF CLAUDE CODE NEEDS A SMALLER FIRST SPRINT

  

If the full build is too large for one execution, complete this exact first sprint without asking for a new scope:

  

Sprint 1 Goal:

  

Build the BibleQuest V1 foundation and the complete daily loop.

  

Must include:

  

\- Next.js app setup or refactor.

\- Tailwind and BibleQuest design tokens.

\- App shell with mobile bottom nav.

\- Marketing landing page first pass.

\- Supabase schema/migration scaffold.

\- Seed data scaffold.

\- Onboarding.

\- Home.

\- Daily verse.

\- Daily quest.

\- Quest completion.

\- Reflection after quest.

\- Prayer creation.

\- Journey timeline first pass.

\- Growth tree first pass.

\- PWA manifest first pass.

\- README/SETUP docs.

  

Defer but scaffold:

  

\- Full Bible reader.

\- Full payment integration.

\- AI Guide.

\- Church Mode.

\- Advanced analytics.

\- Native iOS wrapper.

  

Still obey:

  

\- Design system.

\- Privacy.

\- RLS.

\- Theology guardrails.

\- No shame language.

  

End Sprint 1 by running lint/typecheck/build and documenting next steps.

  
  

SUPPLEMENTAL PROMPT — CONTENT SEEDING

  

If asked to generate starter content, create high-quality BibleQuest seed content using this format:

  

Quest fields:

  

\- title

\- slug

\- category

\- duration\_minutes

\- difficulty

\- energy\_level

\- solo\_or\_social

\- indoor\_or\_outdoor

\- invitation

\- why\_it\_matters

\- scripture\_reference

\- reflection\_prompt

\- prayer\_prompt

\- growth\_type

\- tags

\- season\_tags

\- tradition\_tags

\- sensitivity\_tags

\- is\_premium

  

Rules:

  

\- Create at least 75 quests.

\- Cover all major categories.

\- Avoid unsafe sensitive prompts.

\- Use gentle, practical language.

\- Include short durations heavily.

\- Ensure quests are doable in real life.

\- Use Scripture references responsibly.

  

Prayer prompts:

  

\- Create at least 30.

\- Short, humble, direct.

\- No prosperity claims.

\- No guilt.

  

Reflection prompts:

  

\- Create at least 30.

\- Open-ended.

\- Gentle.

\- Useful after quests/prayer/Scripture.

  

Milestones:

  

\- Create at least 20.

\- Use pilgrimage language.

\- Avoid competitive/performative language.

  
  

SUPPLEMENTAL PROMPT — DESIGN REVIEW AFTER BUILD

  

After implementation, review the app against this checklist:

  

\- Does it feel like Paper + Pixel + Prayer?

\- Does it look like Living Editorial?

\- Does it avoid generic dashboard UI?

\- Is the daily loop obvious?

\- Is the mobile PWA experience polished?

\- Are cards warm and paper-like?

\- Is typography calm and literary?

\- Are motion effects subtle and meaningful?

\- Is color restrained?

\- Does the Growth Tree feel emotional rather than statistical?

\- Does prayer/reflection feel private and sacred?

\- Are empty states gentle?

\- Are errors calm?

\- Is there any shame language?

\- Are Plus features framed ethically?

\- Is the landing page emotionally clear?

  

If anything fails, revise before calling the build complete.

  
  

END OF EXPANSION PASS 8 — VOLUME X

  
  
  

FINAL SECOND PASS REVIEW — v1.1 CLAUDE HANDOFF CHECK

  

This section records the final review decisions made before handing BibleQuest to Claude Code Fable 5 Ultracode.

  

The purpose of this review is to make the Codex more actionable, safer, more focused, and less ambiguous for implementation.

  
  

1\. Review Summary

  

The Codex is strong enough to hand off to Claude Code. It now contains the necessary product vision, design system, UX flows, product requirements, engineering architecture, theology guardrails, growth plan, and master implementation prompt.

  

The second pass made these key improvements:

  

\- Renamed the document from v1.0 Product Bible to v1.1 Reviewed Claude Handoff.

\- Added a “Read This First” priority section near the top of the document.

\- Clarified that BibleQuest V1 is a focused Christian PWA, not a multi-faith platform launch.

\- Reframed future QuestOS expansion as optional and requiring separate research, advisors, legal review, and content governance.

\- Tightened AI Guide scope so it is scaffold-only for V1 unless separately enabled with guardrails.

\- Clarified Bible translation licensing requirements.

\- Clarified that Supabase service role keys are server/admin-only and must never reach the client.

\- Reinforced that prayer, reflection, notes, and private spiritual writing are sensitive data.

\- Reinforced that Plus/Premium must never imply paid users are spiritually superior or closer to God.

\- Clarified that the complete daily loop matters more than feature sprawl.

\- Added final risk register and handoff checklist.

  
  

2\. Canonical Reading Order for Claude

  

Claude Code should not read the document as a loose brainstorm. It should follow this priority order:

  

1\. Second Pass Review — Read This First.

2\. Final Second Pass Review — v1.1 Claude Handoff Check.

3\. Volume X — Claude Code Fable 5 Ultracode Master Prompt.

4\. Volume VII — Engineering Bible.

5\. Volume V — Product Requirements Document.

6\. Volume VI — QuestOS Architecture.

7\. Volume IV — UX Bible.

8\. Volume III — Brand and Design Bible.

9\. Volume VIII — Theology and Content Guardrails.

10\. Volume IX — Growth, Marketing, and Distribution.

11\. Volume I/II original vision and design constitution.

  

Where sections overlap, the more specific later section wins.

  

Where the v1.1 review contradicts older text, the v1.1 review wins.

  
  

3\. MVP Scope Lock

  

BibleQuest V1 should ship the smallest beautiful version of the full daily loop.

  

The MVP must include:

  

\- Landing page.

\- PWA app shell.

\- Onboarding.

\- Home.

\- Daily verse.

\- Daily quest.

\- Quest detail.

\- Quest completion.

\- Reflection after quest.

\- Prayer journal.

\- Journey timeline.

\- Growth tree.

\- Bible reader scaffold or limited public-domain seed reader.

\- Settings.

\- Plus page scaffold.

\- Supabase schema.

\- RLS policies.

\- Seed content.

\- PWA manifest/offline fallback.

\- README/setup/deployment/security docs.

  

The MVP should not overbuild:

  

\- Full AI Guide.

\- Full Church Mode.

\- Full social/community system.

\- Native iOS app.

\- Public prayer feed.

\- Leaderboards.

\- Complex CMS.

\- Advanced analytics dashboard.

\- Production payments unless credentials and pricing are ready.

  

The first build should feel complete, not massive.

  
  

4\. Design Readiness Check

  

The design direction is ready for implementation.

  

Non-negotiable design language:

  

Living Editorial.

Paper + Pixel + Prayer.

  

Claude should build:

  

\- Parchment canvas.

\- White paper cards.

\- Mist hairline borders.

\- Editorial serif headings.

\- Clean sans UI text.

\- Soft spacing.

\- Gentle pixel glyphs.

\- Living growth tree.

\- Warm devotional surfaces.

\- Calm mobile bottom nav.

\- Meaningful subtle motion.

  

Claude should not build:

  

\- Generic SaaS UI.

\- Default shadcn visuals.

\- Loud neon colors.

\- Casino-style rewards.

\- Candy Crush-style gamification.

\- Dashboard-heavy layouts.

\- Cheap religious clipart.

\- Overly dark AI-lab aesthetic.

  

If Claude’s first pass visually resembles a generic Tailwind app, it should revise before calling the build complete.

  
  

5\. Theology and Content Readiness Check

  

The theology/content guardrails are ready for V1 seed content and AI scaffolding.

  

Claude can generate:

  

\- Starter quests.

\- Prayer prompts.

\- Reflection prompts.

\- Milestones.

\- Empty states.

\- Notifications.

\- Marketing copy.

  

But Claude must obey these rules:

  

\- No shame-based copy.

\- No “God is disappointed” language.

\- No unsafe fasting instructions.

\- No medication/medical advice.

\- No forced reconciliation with abusers.

\- No prosperity promises.

\- No public spiritual comparison.

\- No AI acting as God, priest, pastor, therapist, or crisis counselor.

\- No copyrighted Bible translation use without licensing.

  

Sensitive content should be treated as human-review-needed.

  
  

6\. Engineering Readiness Check

  

The engineering plan is ready for Claude handoff.

  

Claude should implement:

  

\- Next.js App Router.

\- TypeScript.

\- Tailwind with custom tokens.

\- Supabase Auth and Postgres.

\- RLS policies.

\- Seed data.

\- Domain functions in lib/questos.

\- App shell.

\- PWA manifest.

\- Offline fallback.

\- Documentation.

  

Claude should keep business logic out of UI components.

  

Claude should centralize:

  

\- Quest selection.

\- Verse selection.

\- Prayer CRUD.

\- Reflection CRUD.

\- Growth calculation.

\- Subscription checks.

\- Analytics events.

  

Claude should make all missing credentials obvious in documentation rather than failing silently.

  
  

7\. Privacy and Security Readiness Check

  

BibleQuest handles spiritually sensitive user data. Claude must treat privacy as a core feature, not a later addition.

  

Private/sensitive data:

  

\- Prayers.

\- Reflections.

\- Prayer answer notes.

\- Verse notes.

\- Highlight notes.

\- Journey events derived from private actions.

  

Required protections:

  

\- RLS on all user-owned tables.

\- Server-side validation.

\- No service role key in client code.

\- No prayer/reflection body in analytics.

\- No prayer/reflection body in logs.

\- Privacy copy in settings.

\- Clear export/delete scaffold.

\- Sanitized user-generated text rendering.

  

Claude should create SECURITY.md and explain what still requires manual review.

  
  

8\. Bible Translation and Legal Readiness Check

  

BibleQuest cannot assume it has rights to every Bible translation.

  

Claude should:

  

\- Build translation metadata into the schema.

\- Use public-domain or seed/demo content only unless a licensed translation is supplied.

\- Clearly label demo/seed content if full Bible import is not implemented.

\- Document translation licensing as a manual founder task before production launch.

\- Avoid hard-coding one translation permanently.

  

Before public launch, Brendan should verify:

  

\- Bible translation rights.

\- Privacy policy.

\- Terms of service.

\- App Store/PWA claims.

\- AI disclaimers if AI is enabled.

\- Church/group privacy if group features are later added.

  
  

9\. Claude Handoff Preparation Steps

  

Before opening Claude Code, do this:

  

1\. Export this Google Doc as Markdown, or copy it into the repository as:

  

docs/BIBLEQUEST\_CODEX.md

  

2\. Create or confirm the project repository/folder.

  

Suggested local folder name:

  

BibleQuestOS

  

3\. Add any existing design files, screenshots, or reference assets into:

  

docs/references/

  

4\. Add a short README note telling Claude:

  

“The Codex is the source of truth. Read docs/BIBLEQUEST\_CODEX.md first.”

  

5\. Then paste the Volume X Master Prompt into Claude Code.

  

6\. If Claude says the full build is too large, use the Sprint 1 supplemental prompt already included in Volume X.

  
  

10\. Recommended Claude Code Opening Message

  

Use this exact opening message after the Codex is in the repository:

  

“Read docs/BIBLEQUEST\_CODEX.md in full before making changes. Treat the v1.1 Second Pass Review sections as highest priority. Then follow Volume X — Claude Code Fable 5 Ultracode Master Prompt. Build BibleQuest V1 as a launch-ready mobile-first PWA. Preserve the Living Editorial / Paper + Pixel + Prayer design language. Prioritize the complete daily loop over feature sprawl. Implement secure Supabase/RLS scaffolding, seed content, PWA support, and documentation. Do not stop after a plan — implement, test, fix, and summarize.”

  
  

11\. Risk Register

  

Risk 1 — Scope creep

  

Problem:

The Codex is ambitious and could cause Claude to overbuild.

  

Mitigation:

Use the MVP Scope Lock. Preserve the daily loop first. Scaffold future features instead of fully building them.

  

Risk 2 — Generic UI output

  

Problem:

Claude may default to generic Tailwind/shadcn visuals.

  

Mitigation:

Force design tokens and custom BibleQuest components before screens. Review against Living Editorial checklist.

  

Risk 3 — Bible licensing

  

Problem:

Using copyrighted Bible translations without permission creates legal risk.

  

Mitigation:

Use public-domain/seed content only until licensing is verified. Keep translation metadata.

  

Risk 4 — AI spiritual authority

  

Problem:

AI Guide could accidentally behave like clergy or divine authority.

  

Mitigation:

Scaffold only for V1. Add guardrails and disclaimers. Do not ship unreviewed AI Guide.

  

Risk 5 — Private data exposure

  

Problem:

Prayer/reflection content is sensitive.

  

Mitigation:

RLS, server validation, analytics restrictions, log scrubbing, privacy copy, no public feed.

  

Risk 6 — Over-gamification

  

Problem:

Quests/growth tree could become childish, addictive, or spiritually shallow.

  

Mitigation:

Use pilgrimage and growth language. No leaderboards. No streak threats. No confetti/casino rewards.

  

Risk 7 — Denominational awkwardness

  

Problem:

Broad Christian content can accidentally alienate Catholic, Orthodox, Protestant, non-denominational, or exploring users.

  

Mitigation:

Use ecumenical defaults and optional tradition tags. Label tradition-specific content clearly.

  

Risk 8 — V1 feels incomplete

  

Problem:

A scaffold-heavy build could feel unfinished.

  

Mitigation:

Make the daily loop emotionally complete even if some advanced systems are scaffolded.

  
  

12\. Final Pre-Handoff Checklist

  

Before handing to Claude, confirm:

  

\- The Codex is exported or copied into the repo.

\- Claude can read the Codex file.

\- The repository has a clear project name.

\- BibleQuest.us domain plan is known.

\- Supabase will be used or mocked clearly.

\- No private API keys are pasted into Claude chat.

\- Bible translation licensing is treated as manual review.

\- AI Guide remains scaffold-only unless separately approved.

\- The MVP daily loop is the first priority.

  
  

13\. Final Handoff Verdict

  

BibleQuest Codex v1.2 is ready to hand off to Claude Code Fable 5 Ultracode using the canonical GitHub repository bkeigh/BibleQuest.

  

The document is now specific enough to guide product, design, engineering, content, safety, marketing, and implementation.

  

The strongest path forward is:

  

1\. Export/copy this Codex into the repo.

2\. Run the Volume X Master Prompt.

3\. Force Claude to build the MVP daily loop first.

4\. Review the resulting app visually and technically against this Codex.

5\. Iterate with a focused second sprint.

  

BibleQuest should now move from planning into implementation.

  

END OF FINAL SECOND PASS REVIEW — v1.1 CLAUDE HANDOFF CHECK

  
