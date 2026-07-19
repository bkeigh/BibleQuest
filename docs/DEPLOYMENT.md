# Deployment

BibleQuest deploys to **Vercel** and installs as a PWA at BibleQuest.us.

For the July 31 production sequence, hard gates, named owners, evidence, and
rollback procedure, execute [`LAUNCH_RUNBOOK.md`](LAUNCH_RUNBOOK.md).

## Deploy to Vercel

1. Import the `bkeigh/BibleQuest` repository into Vercel.
2. Framework preset: **Next.js** (auto-detected). Build command `pnpm build`,
   install command `pnpm install`.
3. Add environment variables (all optional for a guest-mode launch) — see
   [`ENV.md`](ENV.md). Add `NEXT_PUBLIC_APP_URL=https://biblequest.co`.
4. Deploy.

Database changes use a separate staged, approval-gated process. Follow
[`SUPABASE_SECURITY_ROLLOUT.md`](SUPABASE_SECURITY_ROLLOUT.md); never run a
linked migration command against production based only on this Vercel flow.

> The repo pins native-build approval and disables pnpm's pre-run deps check in
> `pnpm-workspace.yaml` (`onlyBuiltDependencies`, `verifyDepsBeforeRun: false`)
> so `pnpm build` runs clean in CI.

## Domain

1. Add `biblequest.co` (and `www`) in Vercel → Domains.
2. Point DNS to Vercel per their instructions (A / CNAME).
3. Confirm HTTPS is issued before sharing links.

## HTTPS and HSTS launch gate

HSTS is safe only after HTTPS is permanent. Before deploying this header to a
new app hostname, verify that Vercel has issued a valid certificate, every HTTP
request redirects to HTTPS without an interstitial or loop, and all browser
resources are HTTPS. Do this for the canonical host, `www`, and every preview
hostname that will serve a production-mode Next.js build.

`next.config.ts` sends `Strict-Transport-Security: max-age=15552000` (six
months) only from production-mode responses. `next dev` never sends it. The
policy deliberately omits `includeSubDomains` because unrelated subdomains
have not been audited, and omits `preload` because that is a long-lived browser
vendor commitment. Do not add either token without a separate domain-wide
inventory and repository-owner approval.

If HSTS must be withdrawn, serve `Strict-Transport-Security: max-age=0` over
valid HTTPS before removing it; merely deleting the header does not clear a
browser's cached policy.

The repository owner owns the deployed header check. The Winterhill integration
owner owns the two allowed embed checks and an unapproved-origin denial check.
Billing and Supabase owners own their rows in the acceptance matrix in
[`QA.md`](QA.md#manual--security-headers-and-external-integrations).

After a production deploy, record the unmodified response headers for both a
document and the worker (do not deploy from this checklist itself):

```bash
curl --silent --show-error --dump-header - --output /dev/null https://biblequest.co/
curl --silent --show-error --dump-header - --output /dev/null https://biblequest.co/sw.js
```

Confirm the document has CSP and six-month HSTS, has no `X-Frame-Options`, and
that `frame-ancestors` is exactly self plus the two Winterhill origins. Confirm
`/sw.js` also retains `Cache-Control: no-cache, no-store, must-revalidate` and
`Service-Worker-Allowed: /`. Header inspection cannot prove iframe behavior;
complete the browser matrix as well.

## Bible text tracing

The chapter reader loads book JSON server-side. `next.config.ts` includes
`outputFileTracingIncludes` for `src/data/bible/**` so those files ship with both
the private `/app/bible/**` reader and public `/verse/**` share routes. No action
needed — just don't remove that config.

## Post-deploy checks

- [ ] Landing page loads and looks like Living Editorial (not a generic app).
- [ ] Run the Winterhill header and browser checks in
      [`EMBED_SECURITY.md`](EMBED_SECURITY.md) without adding a framing bypass.
- [ ] `/app` routes a new visitor to onboarding.
- [ ] Complete the daily loop: quest → reflect → complete → journey/tree update.
- [ ] Bible chapter renders real WEB text.
- [ ] A public `/verse/{book}/{chapter}/{verse}` link renders without onboarding,
      has canonical/social metadata, and its “Open chapter” CTA targets the verse.
- [ ] `/support` clearly reports whether one-time support is available. If
      `STRIPE_DONATION_URL` is intentionally configured, verify the same-origin
      checkout route redirects only to the reviewed live Stripe Payment Link;
      repeat with the variable absent and confirm it fails closed.
- [ ] Add to Home Screen on an iPhone; confirm it opens standalone.
- [ ] Offline: load the app, go offline, confirm the offline fallback appears.
- [ ] `/api/health` returns `{ "status": "ok" }`.
- [ ] Privacy and Terms pages load.
- [ ] Save deployed document and `/sw.js` header evidence; confirm HSTS/CSP are
      not changed by Vercel project-level header rules.
- [ ] Complete every row in the security/integration acceptance matrix in
      [`QA.md`](QA.md#manual--security-headers-and-external-integrations).

## Manual founder checklist (before public launch)

- [ ] Confirm the `biblequest.co` domain and DNS.
- [ ] Rehearse the complete Supabase migration/RLS runbook on staging, review
      the production dry run, and obtain explicit approval before the database
      push (if enabling sync).
- [ ] Configure analytics (privacy-first) and Sentry, if desired.
- [ ] Keep RevenueCat in `coming-soon` unless every sandbox-to-production gate
      in [`REVENUECAT.md`](REVENUECAT.md) has evidence and explicit approval.
- [ ] Keep the Free Use Bible API catalogue constrained to the reviewed
      public-domain allow-list in `src/lib/bible/translations.ts`. A provider
      catalogue entry is not, by itself, approval to expose that edition.
- [ ] Verify each open edition's source license URL and attribution whenever the
      allow-list or pinned upstream SHA-256 changes. An unexpected provider
      revision fails closed until it is reviewed and deployed; WEB remains the
      bundled offline fallback.
- [ ] Mirror the app's online-Scripture limits in Vercel Firewall (fixed window,
      per IP, deny on exceed): 60/minute for path prefix `/api/bible/`, plus
      40/minute for `GET /verse/*` with a `translation` query. If the plan has
      only one custom rate rule, combine both path condition groups at
      40/minute. The app also has per-instance windows; over-limit public share
      pages fall back to WEB.
- [ ] For API.Bible, configure server-only `API_BIBLE_API_KEY` and
      `API_BIBLE_COMMERCIALLY_LICENSED_BIBLE_IDS` only after each exact id is
      licensed for commercial BibleQuest use. Catalog access alone is not
      permission. The old `API_BIBLE_ALLOWED_BIBLE_IDS` name remains a temporary
      backwards-compatible alias.
- [ ] Review sensitive quests once more (see [`CONTENT_GUIDE.md`](CONTENT_GUIDE.md)).
- [ ] Finalize Privacy Policy and Terms.
- [ ] Keep AI Guide scaffold-only unless separately reviewed and guardrailed.
