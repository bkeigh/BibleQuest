# BibleQuest security and product-health follow-up — 2026-08-03

> **STATUS (2026-08-14):** Historical audit record. Findings were remediated in the releases that followed.


## Executive result

No unresolved critical or high-severity application or production-dependency
vulnerability was found. This follow-up closes four concrete defense gaps and
two mobile quality-of-life defects found after the 2026-08-02 audit. Security
is a maintained posture rather than a guarantee; this release materially
reduces the exposed credential, outbound-request, and provider-abuse surfaces.

## Findings closed

| Severity | Finding | Resolution |
| --- | --- | --- |
| Medium | An authenticated push subscriber could store an arbitrary HTTPS delivery endpoint, creating a blind outbound-request/SSRF primitive. | Push endpoints now require HTTPS, no credentials/hash/custom port, and an exact or dot-boundary-safe browser provider host (Apple, Firebase, Mozilla, or WNS). |
| Medium | Public Bible provider routes used only per-instance quotas, which can reset as serverless instances rotate. | Chapter, passage, translations, and FUMS reporting now claim the existing atomic database quota after cheap request validation. |
| Medium | Production runtime still exposed legacy Supabase service-role/JWT and direct Postgres credentials that application code did not need. | Runtime now prefers Supabase publishable/secret keys; unused privileged/direct database variables were removed from Vercel Production. |
| Low | Opaque rate-limit identities reused the database credential as HMAC material. | Added a dedicated 256-bit Vercel secret for rate-limit hashing in Production and Preview. |
| High (development only) | The ESLint dependency tree resolved vulnerable `brace-expansion` 5.0.8. | Pinned the patched 5.0.9 release; both production and complete dependency audits are clean. |
| Low | The marketing mobile menu appeared abruptly and lacked modal focus/scroll behavior. | Added reduced-motion-aware entry/exit, click-away dismissal, focus containment/restoration, and scroll locking. |
| Low | The install prompt was translucent over home content and overlapped the floating MyShepherd launcher. | Made the prompt opaque, simplified its mobile action layout, and re-docked MyShepherd above temporary shell overlays. |

## Verified posture

- GitHub secret-scanning, Dependabot, and code-scanning APIs reported no open
  alerts at the audit baseline.
- Production runtime error logs contained no errors in the preceding 24 hours.
- Production `/api/health` reported status `ok`, release SHA
  `60d00854c1c261355130dd089ff6caebd6c29fe9`, schema `0035`, service worker
  `v25`, configured auth, and approved live billing before this release.
- Authentication uses verified server sessions and ownership RLS; mutating
  browser APIs retain exact same-origin, bounded-body, content-type, and
  private no-store boundaries.
- Billing retains signed Stripe webhooks, server-owned prices/redirects,
  livemode validation, idempotency, and entitlement checks.
- Push subscriptions remain AES-256-GCM encrypted at rest; provider
  allowlisting now limits where the server may deliver them.
- Paid AI still sends no prayer, journal, reflection, profile, or conversation
  history and remains authenticated, Plus-gated, bounded, and rate-limited.

## Automated evidence

| Gate | Result |
| --- | --- |
| ESLint | Pass |
| TypeScript `--noEmit` | Pass |
| Vitest | 129 files, 895 tests passed |
| Production build | Pass: Next.js 16.2.12, 277 static pages generated |
| Production/development header integration | 2 passed |
| Playwright optimized-build smoke | 2 passed |
| Production dependency audit | No known vulnerabilities |
| Complete dependency audit | No known vulnerabilities |
| Git whitespace/error check | Pass |

The local pgTAP database run was unavailable because the workstation Docker
daemon did not respond. The protected GitHub workflow starts a clean Supabase
stack, resets every migration, and runs the full pgTAP suite; it remains a
required merge check and is not waived.

## Residual risks and recommended order

1. Require every protected CI and CodeQL check, especially the clean Supabase
   migration/pgTAP job, before merge.
2. Verify the exact merged SHA, health contract, public Bible routes, framing
   headers, and aggregate runtime errors after Vercel deploys it.
3. Use an isolated staging Supabase project for full Preview testing. Generic
   previews intentionally do not inherit Production database credentials and
   privileged routes fail closed there.
4. Confirm Web Push and auth on representative Apple, Google, and Firefox
   devices. Provider host changes should be reviewed before allowlist updates.
5. After confirming no external consumer still uses the legacy Supabase JWT
   credentials, rotate or revoke them in Supabase so old deployment snapshots
   cannot use them.
6. Continue the longer-term CSP migration away from `unsafe-inline` when the
   framework and styling approach can support request nonces or hashes.
7. Schedule an independent external penetration test before materially
   expanding account, payment, or private-data volume.
