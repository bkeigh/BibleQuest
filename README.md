# BibleQuest

**One meaningful step with God today.**

BibleQuest is a mobile-first, installable Progressive Web App — a peaceful daily
rhythm of Scripture, prayer, reflection, and small real-life quests of faith.
Not a streak. A pilgrimage.

It is the first product built on **QuestOS**, a modular platform for turning
belief into daily practice. The canonical product/design/engineering spec lives
at [`docs/BIBLEQUEST_CODEX.md`](docs/BIBLEQUEST_CODEX.md) — read it first.

---

## Product philosophy

- **Peace over productivity.** The interface breathes. It never provokes urgency
  or fear of falling behind.
- **Invitation over obligation.** No shame, no guilt, no streak threats. Miss a
  week and nothing is lost — your journey continues when you return.
- **Transformation over engagement.** The best session is short and ends with
  you closing the app to go live your faith.
- **Free is spiritually complete.** Scripture, prayer, reflection, quests, and
  your journey are free and always will be. Plus only ever adds depth.
- **Private by default.** Prayers and reflections are sacred. They never appear
  in analytics or logs.

The design language is **Living Editorial — Paper + Pixel + Prayer**: warm
parchment, literary serif, hairline borders, gentle pixel art, calm motion.

---

## The daily loop

`open → today's quest → complete → reflect → pray → optional Scripture → growth tree / journey → return`

Everything else is secondary.

---

## Stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript** + **Tailwind CSS v4**
- Custom BibleQuest design system (shadcn/ui is *not* used as the visual identity)
- **Framer Motion** for gentle motion; reduced-motion honored throughout
- **Zustand** (+ persist) guest-mode store — local-first, private by default
- **Supabase** (Postgres, Auth, RLS) — optional, implemented account sync
- PWA: web manifest, service worker (offline-capable), installable
- Scripture: **KJV via keyless HelloAO** by default, with the full public-domain
  **World English Bible** bundled for immediate/offline fallback

---

## Getting started

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

No environment variables are required to run V1 — it works fully in guest mode
(local, private-by-default storage). Copy `.env.example` to `.env.local` when
you're ready to wire up Supabase, analytics, or payments.

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint |
| `pnpm test` | Noninteractive unit tests |
| `pnpm check:seed` | Regenerate and verify the canonical Console seed + exact-content manifest |
| `pnpm check:production-readiness` | Read-only production schema, content, health/metadata, and auth-provider probe |
| `node scripts/import-bible.mjs` | Re-import the WEB Bible → `src/data/bible/` |
| `node scripts/build-seed.mjs <json>` | Rebuild typed seed content |
| `node scripts/build-quest-expansion.mjs` | Rebuild the reviewed 66-quest expansion from local WEB text |
| `node scripts/build-daily-verses.mjs` | Rebuild the 180-passage daily rotation from local WEB text |
| `node scripts/process-pixel-sprites.mjs clean-supplied [source-dir] [out-dir]` | Normalize approved source-anchored art onto the production pixel grids |
| `node scripts/build-icons.mjs` | Rebuild the icon set, favicon, + OG image from the brand art |
| `node scripts/build-supabase-seed.mjs` | Emit the canonical 150-quest/180-passage `supabase/seed.sql` |

---

## Content

All app content is generated and **adversarially verified** (safety + tone +
theology lenses) before it ships:

- **150 reviewed free quests** across 14 categories, from five-minute practices
  to sustained study, service, reconciliation, and formation
- **32 prayer prompts**, **32 reflection prompts**, **38 milestones**
- **180 curated daily passages** across all 66 books, with exact
  public-domain WEB text
- **63 reviewed production sprites**, including a 20-stage growth tree

Seed data lives in `src/data/seed/` (typed) and mirrors to `supabase/seed.sql`.
See [`docs/CONTENT_GUIDE.md`](docs/CONTENT_GUIDE.md) for the writing guardrails.

---

## Project structure

```
src/
  app/
    (marketing)/        # landing + about/pricing/writing/churches/privacy/terms
    app/                # the private PWA: home, quests, bible, prayer, journey…
    onboarding/         # first-run flow
    offline/            # PWA offline fallback
  components/           # design-system, app-shell, quests, bible, prayer, …
  lib/
    questos/            # domain engines + store (business logic lives here)
    bible/              # local loader + reviewed server-only Bible providers
    analytics/          # privacy-first event wrapper
    supabase/           # client/server auth and account-sync adapters
  data/
    bible/              # World English Bible JSON (server-loaded)
    seed/               # verified quests, prompts, milestones, daily verses
supabase/               # migrations, RLS policies, generated seed.sql
docs/                   # Codex + setup/deployment/security/content/QA guides
```

---

## Documentation

- [`docs/CODEBASE_GUIDE.md`](docs/CODEBASE_GUIDE.md) — architecture map and change guide
- [`docs/BIBLEQUEST_CODEX.md`](docs/BIBLEQUEST_CODEX.md) — the source of truth
- [`docs/SETUP.md`](docs/SETUP.md) — Supabase, auth, migrations, seeding
- [`docs/FOUNDER_API_SETUP.md`](docs/FOUNDER_API_SETUP.md) — concise provider, API-key, email, donation, and subscription setup
- [`docs/FREE_BIBLE_API_SETUP.md`](docs/FREE_BIBLE_API_SETUP.md) — current KJV/HelloAO path and free-provider integration checklist
- [`docs/ACCOUNT_SYNC_RUNBOOK.md`](docs/ACCOUNT_SYNC_RUNBOOK.md) — production sync, SMTP, auth-link, schema, and content recovery
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Vercel + domain
- [`docs/ENV.md`](docs/ENV.md) — environment variables
- [`docs/REVENUECAT.md`](docs/REVENUECAT.md) — Plus identity, sandbox QA, and production gates
- [`docs/PLUS_7_DAY_TRIAL_HANDOFF.md`](docs/PLUS_7_DAY_TRIAL_HANDOFF.md) — founder decisions and safe 7-day trial setup
- [`SECURITY.md`](SECURITY.md) — RLS, sensitive data, disclosure
- [`docs/CONTENT_GUIDE.md`](docs/CONTENT_GUIDE.md) — quest/prayer/theology rules
- [`docs/QA.md`](docs/QA.md) — manual QA checklist
- [`docs/CI.md`](docs/CI.md) — pull request checks and branch protection

---

## Known limitations (V1)

- Guest mode and account sync are implemented. Account sync must stay a
  controlled beta capability until the production schema, content mirror,
  custom auth email, and two-user isolation gates in the recovery runbook pass.
- Notification delivery and external quest-generation providers are not
  enabled for V1.
- Plus billing uses RevenueCat configuration. One-time support uses a validated
  server-side Stripe Payment Link and stays unavailable until
  `STRIPE_DONATION_URL` is configured for the deployment.
- Guest data lives in the browser (`localStorage`). After an explicit account
  connection, supported journey data also syncs to the user's RLS-protected
  Supabase rows. Export/clear controls are in Settings.
- KJV is the default online edition through HelloAO; the World English Bible is
  bundled offline. Reviewed public-domain editions
  are fetched server-side from the keyless
  [Free Use Bible API](https://bible.helloao.org/docs/guide/) and fall back to
  the bundled WEB when that service is unreachable. The allow-list is checked
  into the app with each edition's source license; BibleQuest does not expose
  the provider's entire catalogue automatically.
- Copyrighted editions activate only when explicitly licensed through the
  server-only API.Bible adapter. Configure `API_BIBLE_API_KEY` plus a
  comma-separated `API_BIBLE_COMMERCIALLY_LICENSED_BIBLE_IDS` containing only
  exact editions enabled for BibleQuest's commercial plan; catalog visibility
  alone is not proof of rights. The legacy `API_BIBLE_ALLOWED_BIBLE_IDS` name is
  accepted only for backwards compatibility.

BibleQuest is not a church, and not a replacement for clergy, counseling, or
emergency services.
