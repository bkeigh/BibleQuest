# BibleQuest application and security audit — 2026-08-02

## Executive result

BibleQuest is ready to enter the protected release pipeline. No unresolved
critical or high-severity application or production-dependency vulnerability
was found. The release closes the material issues identified during this pass:
deployment-wide provider quotas, unbounded AI request reads, newsletter
third-party loading, route framing, incomplete browser/database CI coverage,
above-fold reveal delays, and an oversized PWA art precache.

Production database contract `0034` is applied and reconciled. Before the app
release, the deployed `/api/health` response still advertises contract `0033`;
this is the expected and only automated production-readiness failure until the
matching application build reaches production.

## Scope and method

The review covered:

- all App Router pages, API routes, middleware, authentication, billing,
  support, AI, Bible-provider, push, avatar, analytics, and PWA boundaries;
- all 42 public Supabase tables, RLS/grants, security-definer RPCs, immutable
  migration checksums, production history, and content contracts;
- CSP, HSTS, permissions, cache controls, clickjacking, origin checks, request
  size limits, redirects, provider timeouts, and private error handling;
- production dependencies and lockfile advisories;
- accessibility landmarks, progress semantics, reduced motion, image loading,
  LCP visibility, and browser smoke paths;
- the hand-painted 2.5D asset migration, runtime registry, service worker, and
  offline cache policy;
- CI action pinning, production builds, deterministic content generation, and
  browser/database acceptance coverage.

This was a code, configuration, automated behavior, and live-readiness audit.
It was not an external black-box penetration test by an independent third
party and did not attempt destructive traffic or social engineering.

## Material findings closed

| Severity | Finding | Resolution |
| --- | --- | --- |
| High | Paid AI and public support relied on per-instance memory limits, which reset across serverless instances. | Added service-only atomic Supabase fixed-window claims keyed by opaque HMAC buckets. Production migration `0034` is applied. |
| High | Paid AI routes used unbounded `request.json()` reads before validating small fields. | Added a 4 KiB raw-body cap with strict JSON content-type and field validation before quota or provider use. |
| Medium | The newsletter loaded Tally's parent-page script and allowed default referrer transmission. | Removed the parent script; the direct iframe is sandboxed and uses `Referrer-Policy: no-referrer`. |
| Medium | The framing policy could not safely support the approved Winterhill homepage embed while denying sensitive routes. | Homepage framing is allowlisted to the two exact Winterhill origins; every other route uses CSP `frame-ancestors 'none'` plus `X-Frame-Options: DENY`. |
| Medium | Crisis and active-danger language could reach the model or miss deterministic safety handling. | Expanded explicit self-harm, overdose, assault, and immediate-danger detection; the bounded deterministic response now precedes paid-provider quota. |
| Medium | CI did not exercise browser release paths or the complete local database policy suite. | Added Chromium smoke tests and a clean Supabase migration/seed/pgTAP job with immutable action SHAs. |
| Medium | The new service worker would download the complete 6.3 MB art catalogue on install. | Reduced install precaching to 13 core art assets; the exact remaining catalogue is cached only when used. |
| Low | Above-fold marketing content began opacity-hidden behind in-view animation. | Added immediate reveal mode for the complete hero so first paint and LCP content remain visible. |
| Low | Onboarding lacked a main landmark and an accessible progress name. | Added the main landmark, named progressbar, and eager/high-priority step mascot loading. |
| Low | Several framework/provider packages were behind safe patch releases. | Updated Next.js, React, Supabase, Stripe, Framer Motion, Tailwind, and related type/build packages. |

## Verified controls

- Mutating browser APIs require exact same-origin requests; authenticated
  account and Plus checks remain server-side.
- Billing prices, products, redirect origins, entitlements, customer mappings,
  webhook signatures, and idempotency are server controlled.
- Support checkout accepts one exact server-priced request shape, rate-limits
  both locally and across the deployment, and never reflects provider detail.
- AI sends no prayer, journal, reflection, profile, or conversation history;
  outputs stay constrained to reviewed quest content or bounded study answers.
- Provider-backed routes use timeouts, bounded inputs, local abuse controls,
  private no-store responses, and deployment-wide claims where provider cost or
  payment abuse is material.
- Database rate-limit identities are HMAC digests; raw account IDs and network
  addresses are not stored in the bucket table.
- RLS is enabled and forced for the provider bucket table; clients cannot read
  it or execute the claim RPC. Only `service_role` can claim capacity.
- Sensitive app, auth, console, account, API, and cookie-bearing responses are
  excluded from service-worker caching.
- Production CSP denies objects, limits frames and connections to exact needs,
  pins form/base/ancestor behavior, and omits development `unsafe-eval`.
- Repository scans found no committed provider secret, private key, live Stripe
  key, webhook secret, or Supabase service key.

## Automated evidence

| Gate | Result |
| --- | --- |
| ESLint | Pass |
| TypeScript `--noEmit` | Pass |
| Vitest | 126 files, 883 tests passed |
| Deterministic seed | Pass: 150 quests, 180 daily verses, 32 prayer prompts, 32 reflection prompts, 38 milestones |
| Production build | Pass: Next.js 16.2.12, 277 static pages generated |
| Production/development header integration | 2 passed |
| Playwright production browser smoke | 2 passed |
| Production dependency audit | No known vulnerabilities |
| Production migration `0034` reconciliation | Pass; applied, no pending proposal |
| Production database/content readiness | All database, auth-provider, and content checks passed |
| Git whitespace/error check | Pass |

The local pgTAP run could not start because the workstation Docker daemon was
unavailable while the Mac was locked. The release workflow now runs the same
clean migration, seed, and pgTAP suite on GitHub's Ubuntu runner; that check is
a merge gate rather than waived evidence.

## Residual risks and next actions

1. **Publish an edge rate-limit rule after traffic review.** The Vercel project
   currently lacks the plan capability required to add rate-limit rules. A
   log-only draft for public Bible read bursts is staged but intentionally not
   published. Upgrade/enable the feature, observe legitimate traffic, then set
   an enforceable threshold. Until then public Bible and client-observability
   endpoints retain bounded per-instance controls; paid AI and support already
   have database-distributed enforcement.
2. **Require the new database-policy CI job to pass before merge.** This closes
   the only unavailable local automated gate.
3. **Complete the documented human launch checks.** SMTP delivery, Apple and
   Google round trips, signed two-user isolation, account purge, backup restore,
   offline reconnect, and representative iOS/Android accessibility checks need
   real accounts/devices and remain operator evidence.
4. **Move CSP away from inline scripts/styles when framework support and effort
   justify it.** Production excludes `unsafe-eval`, but Next.js streaming and
   current styling still require `unsafe-inline`. A request nonce or hash-based
   design is worthwhile future defense-in-depth, not a release blocker.
5. **Add bucket-table housekeeping as routine maintenance.** The table keeps
   one current row per scope, opaque identity, and window size rather than one
   row per request/window. A later bounded retention job can remove identities
   inactive for a chosen period.
6. **Monitor the 2.5D rollout.** Watch LCP, transfer volume, service-worker
   install failures, and image 404s after release; the install policy now avoids
   downloading decorative art that the user has not visited.

## Release decision

Proceed through pull request and protected CI. Merge only after every required
check passes. After Vercel promotes the merge, require `/api/health` to report
schema contract `0034`, rerun production readiness and synthetic health, verify
route-specific framing headers, and inspect runtime logs before calling the
release complete.
