# Deployment

BibleQuest deploys to **Vercel** and installs as a PWA at BibleQuest.us.

## Deploy to Vercel

1. Import the `bkeigh/BibleQuest` repository into Vercel.
2. Framework preset: **Next.js** (auto-detected). Build command `pnpm build`,
   install command `pnpm install`.
3. Add environment variables (all optional for a guest-mode launch) — see
   [`ENV.md`](ENV.md). Add `NEXT_PUBLIC_APP_URL=https://biblequest.co`.
4. Deploy.

> The repo pins native-build approval and disables pnpm's pre-run deps check in
> `pnpm-workspace.yaml` (`onlyBuiltDependencies`, `verifyDepsBeforeRun: false`)
> so `pnpm build` runs clean in CI.

## Domain

1. Add `biblequest.co` (and `www`) in Vercel → Domains.
2. Point DNS to Vercel per their instructions (A / CNAME).
3. Confirm HTTPS is issued before sharing links.

## Bible text tracing

The chapter reader loads book JSON server-side. `next.config.ts` includes
`outputFileTracingIncludes` for `src/data/bible/**` so those files ship with the
`/app/bible/**` routes. No action needed — just don't remove that config.

## Post-deploy checks

- [ ] Landing page loads and looks like Living Editorial (not a generic app).
- [ ] `/app` routes a new visitor to onboarding.
- [ ] Complete the daily loop: quest → reflect → complete → journey/tree update.
- [ ] Bible chapter renders real WEB text.
- [ ] Add to Home Screen on an iPhone; confirm it opens standalone.
- [ ] Offline: load the app, go offline, confirm the offline fallback appears.
- [ ] `/api/health` returns `{ "status": "ok" }`.
- [ ] Privacy and Terms pages load.

## Manual founder checklist (before public launch)

- [ ] Confirm the `biblequest.co` domain and DNS.
- [ ] Create the Supabase project + run migrations/policies/seed (if enabling sync).
- [ ] Configure analytics (privacy-first) and Sentry, if desired.
- [ ] Configure Stripe products/prices (only when Plus is ready).
- [ ] **Verify Bible translation licensing** before adding any non-public-domain
      translation. WEB is public domain and needs none.
- [ ] Review sensitive quests once more (see [`CONTENT_GUIDE.md`](CONTENT_GUIDE.md)).
- [ ] Finalize Privacy Policy and Terms.
- [ ] Keep AI Guide scaffold-only unless separately reviewed and guardrailed.
