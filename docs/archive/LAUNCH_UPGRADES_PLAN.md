# BibleQuest launch upgrades

> **STATUS (2026-08-14):** Completed implementation plan for the July 31 launch; kept as a record.


Status: implementation plan
Baseline: `173b1a95a6db8c6abb42d43ac62d0449cbcab50d`
Prepared: July 24, 2026

## Guardrails

- Keep Scripture, prayer, reflection, basic quests, and the daily faith rhythm
  free.
- Keep production billing in `coming-soon` until test evidence is reviewed and
  the owner explicitly authorizes live mode.
- Treat prayer, reflection, push endpoint, and billing data as private. Never
  include them in analytics, logs, monitor reports, or notification copy.
- Make each phase additive and independently disableable. Database rollback
  means disabling readers and writers first; it never means dropping user or
  financial records.
- Apply database migrations to staging and prove RLS with two real authenticated
  users before any production migration.

## Baseline findings

- Production `/api/health` reports release `173b1a9`, observability contract
  `biblequest_observability_v1`, schema `0022`, service worker
  `biblequest-v20`, configured account sync, and `coming-soon` billing.
- The apex domain redirects to `https://www.biblequest.co/` with `308`.
- Profile photos are normalized in the browser and saved under one IndexedDB
  key. Only a local `avatarUpdatedAt` marker survives in QuestOS. Account sync
  deliberately reattaches that device marker and never transfers image bytes.
- `profiles` has no avatar columns and Supabase Storage has no avatar bucket or
  avatar policies.
- `notification_preferences` already contains disabled reminder flags, a
  coarse preferred time, and a timezone column. The UI is only a coming-soon
  disclosure. The service worker has no `push` or `notificationclick` handler.
- No push subscription, delivery, scheduler, or delivery-metric table exists.
- Production health and launch-evidence probes exist, but no daily synthetic
  workflow or deduplicated incident issue automation exists.
- RevenueCat is the current dormant Plus scaffold. A validated Stripe Payment
  Link is the current dormant one-time payment scaffold. Neither is active in
  production.
- `subscriptions` is a minimal read-only projection. It lacks complete Stripe
  lifecycle, webhook-idempotency, customer, refund, and dispute records.
- The starting checkout is dirty on an older branch. It remains untouched. All
  launch work lives in the clean `codex/launch-upgrades-2026-07-24` worktree.
- Baseline verification independently passes 458 tests, ESLint, and TypeScript.

## Phase 1 — private cross-device avatars

Migration `0023` will:

- add nullable `avatar_path`, `avatar_version`, and `avatar_updated_at` columns
  to `profiles`, with a constraint binding every path to the row owner;
- create a private `profile-avatars` bucket with an image-only MIME allowlist
  and a bounded object size;
- add `SELECT`, `INSERT`, and `DELETE` Storage policies restricted to the
  authenticated user's first path segment and Storage owner;
- advance the schema and account-sync contracts without making avatar columns
  writable through the generic mutable-profile sync RPC.

Authenticated route handlers will validate the user with `auth.getUser()`.
Uploads will accept only bounded JPEG, PNG, or WebP input, verify signatures,
decode with Sharp, reject animated or oversized images, apply orientation,
resize, and re-encode metadata-free WebP. Objects use
`{user_id}/avatar-{uuid}.webp`. The profile row switches only after upload
succeeds; the prior object is deleted only after the row switch. If the row
switch fails, the new object is removed and the old avatar remains authoritative.

The browser will cache the authenticated download in IndexedDB under the opaque
avatar version, not a shared fixed key. An existing local-only avatar uploads
after sign-in only when the account has no remote avatar. When both exist, the
remote account avatar wins. A failed or offline upload leaves the prior local
and remote avatar unchanged. Remote deletion clears the local copy only after
the server succeeds.

Account deletion will remove Storage objects through the Storage API before the
Auth identity is deleted. Local media remains until all server deletion steps
succeed, so a failed account deletion cannot destroy the only remaining copy.

Rollback: set `BIBLEQUEST_AVATAR_SYNC_ENABLED=false`, leave the private bucket
and additive columns in place, and fall back to the last cached local image.

## Phase 2 — privacy-safe push reminders

Migration `0024` will:

- add sealed account-level preferences with an exact delivery time and
  quiet-hours window while keeping every reminder disabled by default;
- add encrypted `push_subscriptions`, idempotent `push_deliveries`, and bounded
  delivery-metric records;
- add owner-only RLS for subscription management and server-only scheduler
  access;
- add atomic claims for test-message throttling and delivery idempotency.

The browser will show an explanatory screen first and call
`Notification.requestPermission()` only from the user's enable action. Feature
detection will distinguish supported browsers, ordinary iOS browser tabs, and
installed iOS/iPadOS Home Screen apps. Subscribe, unsubscribe, and test routes
will require an authenticated session and same-origin request.

Endpoints and key material will be AES-256-GCM encrypted with a server-only key.
Only a SHA-256 endpoint fingerprint is indexed. VAPID private material,
scheduler secrets, plaintext endpoints, and payload keys will never reach logs.

The scheduler will run from a GitHub Action at four offset minutes each hour.
This avoids Vercel Hobby's once-daily cron limit while preserving a manual
dispatch and a repository-variable rollout latch. It derives each user's local
date and time with an IANA timezone, shifts delivery out of quiet hours, and
uses a unique `(subscription, reminder_kind, local_date)` claim. Permanent
404/410 push responses remove the expired subscription. Transient failures
receive bounded retry. Metrics store only kind, outcome category, status code
class, attempt count, and timestamps.

The service worker will move to `biblequest-v21`, show only neutral copy, and
navigate to a fixed allowlisted app route. Prayer text, journal text, quest
details, and religious activity specifics never appear on the lock screen.

Rollback: disable `BIBLEQUEST_PUSH_ENABLED`, disable the scheduler workflow, and
leave encrypted subscriptions dormant until users can unsubscribe or the data
is purged.

## Phase 3 — daily synthetic health

A scheduled and manually dispatchable GitHub Action will run daily away from the
top of the hour with workflow concurrency enabled. A fixture-tested Node monitor
will use strict timeouts and bounded retry to inspect:

- `/api/health`, release/schema/content/service-worker contracts, and latency;
- apex/canonical redirects, canonical metadata, the public page, and app shell;
- manifest, static assets, and active service-worker version;
- one anonymous public-content query;
- bounded auth, push, and Stripe configuration posture;
- unexpected HTTP errors;
- sanitized Vercel runtime error counts when optional Vercel credentials exist.

The workflow will archive a short JSON and Markdown artifact. On failure it will
create or update one issue with a fixed marker. Repeated failures update that
issue; recovery comments and closes it. Reports include no response body beyond
the allowlisted health contract and no provider URLs, keys, tokens, user data,
or content rows.

Rollback: disable the schedule. Manual dispatch and the existing readiness probe
remain available.

## Phase 4 — Stripe test-mode subscriptions

Migration `0025` will:

- expand `subscriptions` into a complete Stripe projection with nullable user
  ownership, customer, subscription, price, product, status, period,
  cancellation, and synchronization fields;
- add unique Stripe mappings and checks for supported lifecycle states;
- add `stripe_customers` and `stripe_webhook_events`;
- preserve billing records when an application identity is deleted by setting
  its user reference to null;
- expose subscriptions read-only to their current owner while all projection
  writes remain server-only.

Stripe becomes the billing authority. RevenueCat checkout and entitlement reads
will be retired. Server-created hosted Checkout Sessions will offer monthly and
annual configured Price IDs. Customer creation and session creation will use
stable Stripe idempotency keys. The portal route will derive the customer from
the authenticated user; it will never accept a customer ID from the client.

The webhook route will read the raw body, verify the Stripe signature, claim the
event ID atomically, retrieve current authoritative Stripe objects, and apply an
order-tolerant projection. It will handle checkout completion, subscription
creation/update/deletion/pausing, invoice success/failure, refunds, and disputes.
Redirect success never grants Plus.

Every entitlement response will come from the protected server projection.
`trialing` and `active` grant Plus; other states remain visible but do not grant
new premium access unless the final grace-period policy explicitly says so.

Rollback: keep `STRIPE_BILLING_MODE=coming-soon`, hide checkout controls, retain
the Stripe projection and webhook ingestion, and fall back to free access.
Never drop webhook or financial records.

## Phase 5 — one-time Support BibleQuest payments

The public support flow will use server-created Stripe Checkout Sessions in
`payment` mode. The server will choose USD, validate preset/custom cents within
a bounded range, and attach no private app content. Guests will not receive an
application account. Authenticated supporters may be associated with their own
record, but no billing details become user-queryable.

Copy will say “Support BibleQuest,” “one-time support,” and “contribution.” It
will clearly state that the payment is one-time, separate from Plus, and not
tax-deductible. Completion, expiration, refund, and dispute status will come
from webhooks, not return parameters.

Rollback: keep the support route in unavailable mode and retain required
payment/refund/dispute records.

## API routes

| Route | Auth | Purpose |
| --- | --- | --- |
| `/api/profile/avatar` | user | authenticated download, upload, delete |
| `/api/push/config` | user | return enabled posture and VAPID public key |
| `/api/push/subscriptions` | user | subscribe, replace, unsubscribe |
| `/api/push/test` | user | rate-limited neutral test notification |
| `/api/push/schedule` | scheduler secret | idempotent due delivery |
| `/api/billing/status` | user | server-authoritative Plus projection |
| `/api/billing/checkout` | user | monthly/annual Checkout Session |
| `/api/billing/portal` | user | customer portal for the current account |
| `/api/billing/webhook` | Stripe signature | Stripe event ingestion |
| `/api/support/checkout` | guest or user | one-time Checkout Session |

All mutation routes reject cross-origin requests, validate body size and shape,
return generic errors, and use `private, no-store`.

## Environment variables

All secrets stay in `.env.local`, GitHub Actions secrets, Supabase secrets, or
Vercel encrypted environment settings. Values must never be committed or pasted
into chat.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `BIBLEQUEST_AVATAR_SYNC_ENABLED` | server | reversible avatar rollout |
| `BIBLEQUEST_PUSH_ENABLED` | server | reversible push rollout |
| `WEB_PUSH_VAPID_PUBLIC_KEY` | server | returned to authenticated clients |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | server secret | VAPID signing |
| `WEB_PUSH_VAPID_SUBJECT` | server | `mailto:` or HTTPS operator identity |
| `PUSH_SUBSCRIPTION_ENCRYPTION_KEY` | server secret | 32-byte base64 AES key |
| `PUSH_SUBSCRIPTION_KEY_VERSION` | server | encryption rotation label |
| `PUSH_SUBSCRIPTION_ENCRYPTION_KEYS` | server secret | optional prior-key rotation ring |
| `PUSH_SCHEDULER_SECRET` | server/GitHub secret | scheduler authentication |
| `SUPABASE_SERVICE_ROLE_KEY` | server secret | scheduler and Stripe projection |
| `STRIPE_BILLING_MODE` | server | `coming-soon`, `test`, or approved `live` |
| `STRIPE_SECRET_KEY` | server secret | Stripe API |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | browser-safe | posture and future SDK |
| `STRIPE_WEBHOOK_SECRET` | server secret | webhook signature verification |
| `STRIPE_PLUS_MONTHLY_PRICE_ID` | server | monthly Price allowlist |
| `STRIPE_PLUS_ANNUAL_PRICE_ID` | server | annual Price allowlist |
| `STRIPE_PLUS_LIFETIME_PRICE_ID` | server | one-time lifetime Price allowlist |
| `NEXT_PUBLIC_APP_URL` | shared | exact origin for returns and CSRF checks |
| `BIBLEQUEST_MONITOR_VERCEL_PROJECT_ID` | GitHub secret, optional | log posture |
| `BIBLEQUEST_MONITOR_VERCEL_TEAM_ID` | GitHub secret, optional | log posture |
| `BIBLEQUEST_MONITOR_VERCEL_TOKEN` | GitHub secret, optional | log posture |

## Retry and idempotency

- Avatar: versioned object, upload-before-row-switch, delete-after-switch.
- Push subscribe: endpoint fingerprint uniqueness; replace same-device data.
- Push schedule: database claim per subscription/kind/local date; bounded
  transient retry; delete permanent endpoints.
- Stripe API: stable per-user or per-attempt idempotency keys.
- Stripe webhooks: event-ID claim with stale-processing recovery; current Stripe
  object retrieval prevents event-order dependence.
- Synthetic monitor: two attempts for network/5xx failures only; one fixed issue
  marker prevents alert spam.

## Rollout order

1. Merge additive code with every feature disabled.
2. Apply and test `0023` in staging; enable avatar sync in preview; run two-user,
   two-device, offline, deletion, and object-isolation tests.
3. Apply and test `0024` in staging; enable push in preview; run supported,
   denied, revoked, duplicate, DST, quiet-hours, expiry, and offline tests.
4. Merge and observe the daily synthetic monitor on the default branch.
5. Apply and test `0025` in staging; configure Stripe sandbox/test values only;
   run mocked, CLI, duplicate, delayed, refund, and dispute evidence.
6. Complete human auth, RLS, device, email, legal, and payment review.
7. Present evidence. Live billing remains blocked pending explicit approval.
8. After approval only: create/verify live products and prices, enter live
   secrets directly in provider dashboards, deploy, watch, and verify exact SHA.

## Owner decisions required before live billing

1. Monthly and annual Plus prices, currency, taxes, trial, grace period, and
   annual discount.
2. Cancellation timing, refund policy, and treatment of account deletion while
   a subscription is active.
3. One-time support preset amounts, currency, custom minimum/maximum, and
   whether guest support remains allowed.
4. Written confirmation that BibleQuest is not representing itself as a
   tax-exempt nonprofit; otherwise qualified counsel must supply approved copy.
5. Whether the existing “5% of proceeds” pledge is documented and operational.
   Remove it before launch if it cannot be substantiated.
6. Final legal review of pricing, renewal, cancellation, refund, privacy,
   retention, and non-tax-deductibility disclosures.
7. Named owner for synthetic-monitor alerts and the support/refund queue.
8. Explicit authorization to replace dormant RevenueCat billing with direct
   Stripe as specified by this mission.

## Current official references

- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase private asset downloads](https://supabase.com/docs/guides/storage/serving/downloads)
- [Supabase user deletion and owned Storage objects](https://supabase.com/docs/guides/auth/managing-user-data)
- [WebKit Web Push on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [MDN PushManager](https://developer.mozilla.org/en-US/docs/Web/API/PushManager)
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [GitHub Actions concurrency](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency)
- [Stripe Checkout subscriptions](https://docs.stripe.com/payments/checkout/build-subscriptions)
- [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Stripe webhook ordering and duplicate handling](https://docs.stripe.com/webhooks)
- [Vercel cron operations and security](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
