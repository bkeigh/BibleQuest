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

`open → today's verse → today's quest → complete → reflect → pray → growth tree / journey → return`

Everything else is secondary.

---

## Stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript** + **Tailwind CSS v4**
- Custom BibleQuest design system (shadcn/ui is *not* used as the visual identity)
- **Framer Motion** for gentle motion; reduced-motion honored throughout
- **Zustand** (+ persist) guest-mode store — local-first, private by default
- **Supabase** (Postgres, Auth, RLS) — scaffolded for optional account sync
- **Zod** + React Hook Form for validation
- PWA: web manifest, service worker (offline-capable), installable
- Scripture: **World English Bible** (public domain) — full 66-book text

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
| `node scripts/import-bible.mjs` | Re-import the WEB Bible → `src/data/bible/` |
| `node scripts/build-seed.mjs <json>` | Rebuild typed seed content |
| `node scripts/build-icons.mjs` | Rasterize the app icon set + OG image |
| `node scripts/build-supabase-seed.mjs <json>` | Emit `supabase/seed.sql` |

---

## Content

All app content is generated and **adversarially verified** (safety + tone +
theology lenses) before it ships:

- **84 quests** across 14 categories, 79 with exact WEB verse text
- **32 prayer prompts**, **32 reflection prompts**, **22 milestones**
- **60 curated daily verses** with exact public-domain text

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
    bible/              # server-only chapter loader
    analytics/          # privacy-first event wrapper
    supabase/           # client/server scaffolds
  data/
    bible/              # World English Bible JSON (server-loaded)
    seed/               # verified quests, prompts, milestones, daily verses
supabase/               # migrations, RLS policies, generated seed.sql
docs/                   # Codex + setup/deployment/security/content/QA guides
```

---

## Documentation

- [`docs/BIBLEQUEST_CODEX.md`](docs/BIBLEQUEST_CODEX.md) — the source of truth
- [`docs/SETUP.md`](docs/SETUP.md) — Supabase, auth, migrations, seeding
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Vercel + domain
- [`docs/ENV.md`](docs/ENV.md) — environment variables
- [`SECURITY.md`](SECURITY.md) — RLS, sensitive data, disclosure
- [`docs/CONTENT_GUIDE.md`](docs/CONTENT_GUIDE.md) — quest/prayer/theology rules
- [`docs/QA.md`](docs/QA.md) — manual QA checklist

---

## Known limitations (V1)

- Account sync, notifications, payments, and the AI Guide are **scaffolded**, not
  shipped. The app runs entirely in guest mode today.
- Data lives in the browser (localStorage). Export/clear is in Settings.
- Bible text is the World English Bible only; the schema supports adding
  licensed translations later (do not add copyrighted ones without a license).

BibleQuest is not a church, and not a replacement for clergy, counseling, or
emergency services.
