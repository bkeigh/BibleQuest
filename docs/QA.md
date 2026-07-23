# QA checklist

This checklist supplies the detailed test cases for the July 31
[`launch and rollback runbook`](LAUNCH_RUNBOOK.md). Record launch evidence and
sign-off in that runbook; an unchecked item is not a pass.

## Automated

```bash
pnpm test                # all Vitest risk tests; noninteractive and exits
pnpm test:headers        # representative live-billing build + next start/dev header tests
pnpm test:headers:built  # rerun after that representative production build
pnpm test:service-worker # cache policy, lifecycle, and offline fallback
pnpm test:observability  # privacy allowlist, redaction, queue, and thresholds
pnpm test:launch-evidence # one-command sanitized evidence fixture
pnpm test:watch          # Vitest watch mode for local development
pnpm lint                # ESLint — 0 errors
pnpm exec tsc --noEmit   # strict TypeScript — 0 errors
pnpm build               # production build succeeds
pnpm audit --prod        # production dependency audit
git diff --check         # no whitespace errors
supabase test db --local supabase/tests/0014_journey_event_identity.sql
supabase test db --local supabase/tests/0015_daily_quest_cas.sql
```

The automated suite targets launch-critical behavior rather than UI snapshots:

- Auth callback targets stay on-origin and malformed redirect input falls back
  safely.
- Current journey backups round-trip, legacy daily assignments normalize, My
  Quests state survives restore, and malformed records are discarded.
- Clear/restore intent and per-record tombstones prevent account data from
  reappearing after deletion.
- Sync refuses cross-account handoff, permits same-account restart, invalidates
  stale runs, and applies tombstones before merging remote rows. Daily-quest
  tests cover simultaneous devices, stale revisions, duplicate requests,
  atomic rollback, unpick, completed-state preservation, and cached clients.
- Analytics uses one transport; default-denies incomplete configuration and
  consent; validates closed event/prop shapes; normalizes URLs; honors DNT/GPC;
  bounds and sanitizes offline retries; and stops safely on mid-flush opt-out.
- Operational observability reconstructs enum-only auth/sync/worker signals,
  deterministically rejects private fields, safely queues offline categories,
  aggregates Vercel-shaped rows without identifiers/URLs, and applies the
  checked-in launch thresholds.
- RevenueCat tests cover entitlement mapping, deny-by-default activation,
  current-offering/paywall readiness, cancellation/failure containment,
  anonymous persistence, guest → account identification, sign-out isolation,
  account switching, and repeated configuration.
- The service worker default-denies sensitive/query-bearing navigations,
  validates responses before caching, and removes only BibleQuest-owned stale
  caches.
- Live production and development responses preserve the exact Winterhill
  ancestor list, omit conflicting `X-Frame-Options`, scope HSTS/`unsafe-eval`
  correctly, and retain the evidenced RevenueCat/Stripe CSP origins.

Tests use deterministic time, UUID, and storage replacements and restore
modified globals after every case. Fixtures are deliberately fake and tests
must never print backup contents or private-text fields.

## Manual — security headers and external integrations

Run this matrix against the deployed HTTPS release candidate after the
automated live-response tests pass. Save the browser/version, URL, timestamp,
console/network evidence, and pass/fail result. Use sandbox/test credentials
only; never paste tokens, session cookies, full magic links, or card data into
the evidence.

| Scenario | Setup and action | Pass criteria | Owner |
| --- | --- | --- | --- |
| Winterhill embed | Open the production BibleQuest iframe from both `https://winterhill.studio` and `https://www.winterhill.studio`; navigate within the preview and inspect the console/network panel. | BibleQuest renders and remains interactive on both hosts; no ancestor/XFO refusal occurs; the response still lists exactly self and those two hosts. | Winterhill integration owner |
| Unapproved-origin denial | Serve `tests/manual/iframe-denied-origin.html` from an HTTPS origin that is not in the allowlist, point its iframe at the release candidate, and inspect the console. | The browser refuses to render BibleQuest because of `frame-ancestors`; opening BibleQuest directly still works. | Winterhill integration owner |
| Supabase sign-in and sync (enabled track) | On a clean browser profile, sign in through each enabled method, create one non-sensitive test record, reload, and confirm the same account receives the synced record. | Auth calls reach only the configured Supabase project over HTTPS; the session survives; sync completes; no CSP errors or cross-account data appears. Guest-only records this active behavior `OUT OF SCOPE — APPROVED GUEST-ONLY`, not `PASS`. | Supabase owner |
| Email sign-in + callback (enabled track) | Request an email for Gmail and iCloud addresses that are not Supabase organization members. Confirm the UI says the email was requested (not delivered), shows the target address, holds resend for 60 seconds, and keeps Google available. In a fresh installed PWA, enter the code without opening the email link; separately open a fresh link in a browser and observe `/auth/callback` through the first-quest hand-off. | Both messages have matching Supabase and SMTP-provider delivery events; the PWA code creates and retains its session inside standalone mode after a full close/reopen; callback stays on the BibleQuest origin, is `private, no-store`, and expired/used/browser-mismatch credentials show a bounded recovery reason with no raw token or provider text. Guest-only records provider delivery/round trips out of scope and runs the containment matrix below. | Supabase owner |
| PWA | Fresh-install from the immutable candidate URL. Separately, use the approved controlled non-production alias to load compatible old and candidate staging-built artifacts that both use the confirmed staging Supabase pair and safe billing posture; abort on Production values. Remap the same origin for update/rollback rehearsal. Inspect `/sw.js`, Cache Storage, online/offline/reconnect, and record both deployment IDs plus alias changes. | Fresh install/launch works; only documented shell/build assets are cached; forbidden/private routes are absent; same-origin worker update, streaming navigation, and compatible rollback remain functional without Production backend traffic. | Repository owner |
| RevenueCat sandbox paywall | Use the Test Store public key and a published sandbox paywall; open Plus, exercise paywall/package fallback, close/reopen, and complete a simulated purchase. | Offerings, branding image/font/media, entitlement refresh, and management action work without CSP errors; no Stripe request occurs for Test Store. | Billing owner |
| Stripe 3DS | Use RevenueCat Web Billing in Stripe test mode with an official 3DS challenge test payment method; complete and cancel separate challenges while watching frames and requests. | Stripe.js loads from its allowed JS origin, API calls use `api.stripe.com`, 3DS renders through allowed Stripe/hooks frames, success updates entitlement, cancel returns safely, and no CSP source was broadened ad hoc. | Billing owner |

## Manual — guest-only containment

Run this matrix whenever the launch record selects guest-only. Use a clean
browser on the immutable URL and an upgraded browser/installed PWA on the
approved same-origin transition alias. The sanitized request summary may
name endpoint categories and counts, but must not include keys, tokens, email,
user/record IDs, private text, raw URLs, or query strings.

- [ ] `/api/health` reports `guest-only`, the exact release SHA, canonical
      origin, expected worker/schema/content contracts, and selected billing
      posture; it never exposes a Supabase host or key.
- [ ] Enrollment, Email, Google, sign-in, sign-out, and account-sync controls are
      absent from onboarding, navigation, settings, direct account-route
      behavior, and installed/returning-client UI.
- [ ] Fake code, token-hash, provider-error, approved `next`, invalid `next`, and
      encoded/protocol-relative callback forms remain bounded and do not
      exchange credentials or create a session.
- [ ] Ordinary page navigation does not refresh a Supabase session, and startup,
      edits, reload, focus, `pageshow`, visibility return, offline/reconnect, and
      PWA relaunch do not create a sync client or call a user-owned table/RPC.
- [ ] DevTools/HAR inspection during the preceding steps shows zero browser
      requests to Supabase Auth/session endpoints, user-owned REST tables, or
      sync RPCs. Operator-only readiness probes are recorded separately.
- [ ] A new and returning guest can complete the quest/reflection/journey loop;
      settings, shelf, journal, Bible position, and milestones persist locally;
      export and clear work; offline create/reopen/reconnect loses no local data.
- [ ] On the controlled same-origin alias, fully close/relaunch installed PWAs
      twice after the worker update. Record old/candidate deployment IDs and
      alias changes. Any stale open client is documented with its backend
      containment or rollback decision; an alias change alone is not
      containment.
- [ ] Active SMTP/Gmail/iCloud, provider callback completion, signed-in sync,
      transactional/cached-client, and A/B client rows are recorded `OUT OF
      SCOPE — APPROVED GUEST-ONLY`, not `PASS`.
- [ ] The named account posture owner and rollback authority accept the complete
      evidence and residual-client decision with UTC timestamps.

Any visible account control, credential exchange, session refresh, sync-client
activity, Supabase auth/sync browser request, local-first data loss, or missing
acceptance is a hard failure.

## Manual — transactional daily-quest sync

Run before auth + sync is enabled, on staging first, with two disposable
accounts and two physical or isolated browser/PWA clients. Use obviously fake
quest state only. Record UTC time, browser/device, deployed SHA, service-worker
version, sanitized provider/event status, and pass/fail; never record email,
cookie, token, raw user/record ID, or private content. Fully close and reopen
each cached PWA where specified. An approved guest-only release records these
active-client rows out of scope and still requires local/database CAS tests,
the public CAS posture, the RLS/grant report, and anonymous mutation denials.

| Scenario | Action | Pass criteria |
| --- | --- | --- |
| Simultaneous devices | Sign in as A on devices 1 and 2 from the same restored state; while one is offline, pick different unfinished quests on each, then reconnect both. | One device may briefly show the bounded conflict copy; the retry reaches the union once, sync returns idle, and neither completed nor unfinished pick is lost. |
| Stale revision | Keep device 2 open on an older state, change the day on device 1, then change it on device 2. | Device 2 cannot overwrite the newer canonical day blindly; it adopts/merges the canonical response and retries without an error loop. |
| Duplicate request | Interrupt the response after submitting a pick, then reconnect without making another local edit. | Exactly one canonical assignment remains and the revision advances once; offline retry completes without a duplicate. |
| Partial failure / rollback | Use the staging-only failure fixture or database pgTAP test to fail insertion after deletion. | The preexisting day and revision are unchanged; no transient empty day becomes canonical. |
| Deletion / unpick | Unpick an unfinished quest on device 1, sync, then close/reopen device 2. | The unfinished pick stays removed; no later pull resurrects it. |
| Completed preservation | Complete a quest on device 1 while device 2 holds an older unfinished or empty day, then reconnect device 2. | Completion, completion timestamp, and visible completed state survive every merge and retry. |
| Cached old client | Load the previous compatible bundle on device 1 before `0015`, close it, deploy `0015`, reopen it and write; then fully reopen the current bundle on device 2. | The cached bundle retains owner-only direct sync; the current bundle sees the legacy revision change and converges. No missing-RPC fallback occurs for a policy/permission error. |
| Account isolation | Repeat assignment and revision SELECT/INSERT/UPDATE/DELETE attempts A→B and B→A using normal sessions only. | Every cross-owner read is empty and every cross-owner write is denied or affects zero rows; anonymous mutation RPC execution fails. |
| Public CAS posture | Call `daily_quest_sync_contract` with the anonymous key and no user session. | HTTP succeeds with exactly `contract: "biblequest_daily_quest_sync_v1"` and `ok: true`; the response has no rows, identifiers, policy text, or diagnostics. |
| Clear My Data | Purge A after creating an empty-day revision; restore B on the other device. | A’s assignment and revision rows are gone, B is unchanged, and neither account’s data resurrects. |

Any isolation, resurrection, completion loss, silent overwrite, unbounded retry,
or rollback failure keeps account rollout on hold. Delivery-provider evidence
remains separate from signed journey-restore and CAS evidence.

## Manual — core daily loop

- [ ] A new visitor to `/app` is routed to onboarding.
- [ ] Enabled auth/sync: onboarding shows the account card before revealing the
      first quest; Email and Google are visually primary; “Not now — continue on
      this device” is a quiet local-first escape. Guest-only: no account/provider
      control is shown and onboarding proceeds locally without losing choices.
- [ ] Onboarding completes in under two minutes; optional steps are skippable.
- [ ] Home shows the greeting/account surface, then the compact “View Today's
      Verse” invitation, then active/ready/completed quests; the button opens
      the Bible hub and quests remain the strongest section heading.
- [ ] Quest suggestions and rolling quest windows work without shame language.
- [ ] Quest detail shows scripture text, why-it-matters, prayer-to-begin, and a
      safety note for sensitive quests.
- [ ] Begin → reflect → complete works; reflection is optional.
- [ ] Completion updates the journey timeline and grows the tree.
- [ ] Milestones reveal gently, one at a time, and never repeat.

## Manual — sections

- [ ] Prayer Journal: prayers and reflections share one newest-first timeline,
      grouped under Today/Yesterday/calendar dates; the legacy reflections URL
      opens the same timeline prefiltered.
- [ ] Journal search matches body, title/prompt, category/mood, answer note, and
      verse context without putting the query in the URL, analytics, or network.
- [ ] All, Prayers, Reflections, Answered, and Archived filters return the right
      records. Archiving/restoring an answered prayer preserves Answered state;
      reflections archive and restore without deletion.
- [ ] Hide entries obscures journal cards. Background the PWA and return; entries
      remain obscured until the user reveals them. Copy does not claim encryption.
- [ ] Prayer and reflection composers hide the bottom tabs, format bold/italic/
      lists/quotes safely, report word count, rotate built-in prompts, and save.
- [ ] Close a non-empty composer, reopen it, and confirm the scoped device draft
      is recovered. Save or discard and confirm its draft key is removed.
- [ ] Reflection: create standalone and from a verse; prompt, mood, and verse
      context survive edit and appear in the journal.
- [ ] Bible: daily KJV resolves through HelloAO; search finds any book; testament
      switching, recent verses, saved verses, and chapter progress are accurate.
- [ ] Reader: verses remain stable serif text; keyboard selection, save/share/
      reflect actions, focus mode, progress, previous/next, dark mode, large text,
      reduced motion, and clearly-labelled WEB offline fallback all work.
- [ ] Journey: tree stage + growth breakdown + markers + timeline all correct.
- [ ] Settings: theme (incl. Candle/dark), text size, reduced motion apply live;
      export downloads JSON; clear-data returns to onboarding.
- [ ] Plus: free promise shown first; nothing spiritual is gated.

## Manual — RevenueCat (sandbox only)

Keep Vercel production in `coming-soon`. Use only an ignored local Test Store
public key and `NEXT_PUBLIC_REVENUECAT_BILLING_MODE=sandbox`; never print the
key or connect/create/change live billing state. Complete the detailed
dashboard gates in [`REVENUECAT.md`](REVENUECAT.md) first.

- [ ] Coming-soon/no-key: pricing and `/app/plus` render calm coming-soon copy,
      no RevenueCat request, and no purchase control.
- [ ] Invalid/mismatched mode and key: no SDK call and no purchase control.
- [ ] Missing current offering, empty current offering, or unpublished paywall:
      no direct package buttons and no purchase control.
- [ ] Complete Test Store current offering + published paywall: exactly one
      paywall CTA is shown; displayed products/prices come from RevenueCat.
- [ ] Simulated cancellation: neutral “no changes” copy, no entitlement, retry
      remains available.
- [ ] Simulated failure: generic error only, no raw SDK/customer/purchase data,
      no entitlement, retry remains available.
- [ ] Simulated success: Plus activates immediately, then remains active after
      close, reload, focus return, `pageshow`, visibility return, and reconnect.
- [ ] Guest success → sign in: Plus follows the account. Sign out: the fresh
      guest is free. Account A → B: A's Plus never appears or flashes for B.
- [ ] Active Plus with a management URL opens it in a new isolated tab and
      refreshes on return. With no URL, access remains active and an explicit
      refresh action replaces the disabled management control.
- [ ] Analytics/network inspection contains no App User ID, anonymous ID,
      CustomerInfo identifier, transaction/purchase identifier, operation
      session ID, management URL, or redemption data.

## Manual — PWA & platform

- [ ] Add to Home Screen on iPhone Safari; opens standalone.
- [ ] Offline fallback appears when disconnected.
- [ ] Mobile (375px) and desktop layouts both read well; bottom nav respects
      safe areas.
- [ ] Reduced-motion preference (OS or in-app) stills the ambient animation.

### Intended offline surface

Cache Storage is intentionally limited. Queryless navigations may be retained
for `/app`, `/onboarding`, the Prayer hub (`/app/prayer`,
`/app/prayer/reflections`, `/app/prayer/new`, `/app/prayer/reflection/new`),
`/app/journey`, quests
(`/app/quests`, `/app/quests/[slug]`), Bible reading (`/app/bible`,
`/app/bible/saved`, `/app/bible/[book]`, `/app/bible/[book]/[chapter]`), and
`/app/settings`. The `/offline` page and generic `/app` and `/onboarding` shells
are installed up front. Visited allowlisted pages use network-first behavior;
only a network failure may fall back to their exact cached URL, then `/offline`.

Legacy `/app/reflection*` bookmarks redirect to the integrated Prayer routes
while online. Redirect responses are intentionally never cached, so an old
unvisited bookmark uses the honest `/offline` fallback when disconnected.

`/auth/*`, `/app/account`, `/api/*`, `/app/plus`, marketing pages, unlisted
routes, query-bearing URLs, non-GET requests, and cross-origin requests are
never stored. Redirects, opaque responses, non-2xx responses, `Set-Cookie`
responses, and responses marked `no-store` or `private` are also rejected.
Only hashed `/_next/static/*` build assets use stale-while-revalidate.

Prayer and reflection records created offline stay in the persisted Zustand
store (`localStorage` key `biblequest:v1`). They are not written to Cache
Storage. Cache Storage contains route shells and build assets, never user data.
Unfinished journal drafts use scoped `biblequest:journal-draft:*` localStorage
keys, stay off account sync, and clear after save/discard, “clear everything,”
or a cross-account “start fresh.” Drafts older than 30 days are purged the next
time BibleQuest opens.

### Physical iPhone offline check

An immutable generated deployment URL cannot receive an upgrade because its
origin never changes. Use it for fresh-install checks only. For the final update
check below, use the approved controlled non-production alias: map it first to
compatible old and candidate staging-built artifacts that both use the same
confirmed staging Supabase pair and safe billing posture. Abort if either
embeds Production values. Record both immutable deployment IDs and every alias
change. Never move the production domain for a rehearsal.

- [ ] In Safari while online, open `/app`, complete onboarding, and visit one
      prayer, reflection (inside the Prayer tab), quest, and Bible chapter screen.
- [ ] Add BibleQuest to the Home Screen, launch it once online, then fully close
      the standalone app.
- [ ] Enable Airplane Mode (with Wi-Fi off), relaunch from the Home Screen, and
      confirm `/app` opens without a browser error.
- [ ] Confirm previously visited allowlisted screens work where their current
      app bundle permits; an unvisited or forbidden route must show the honest
      offline page, never stale account, billing, or sign-in content.
- [ ] Create a prayer and reflection offline, force-close/reopen, and confirm
      both remain. Enabled auth/sync reconnects and syncs normally; guest-only
      reconnects with local data intact and zero Supabase auth/sync traffic.
- [ ] Follow an auth callback, account link, and URL containing `?qa=1` while
      offline; each must use the offline fallback and must not reveal a cached
      response for that URL.
- [ ] After reconnecting and remapping the same controlled alias to the newer
      candidate, relaunch twice and confirm the worker update does not strand
      the installed app on the old shell. Rehearse the approved compatible
      rollback mapping on that alias and restore the alias afterward.

### Desktop Cache Storage inspection

- [ ] Run a production build, open the app, and in DevTools → Application →
      Service Workers confirm `/sw.js` controls the page at scope `/`.
- [ ] In Application → Cache Storage, confirm only the current
      `biblequest-v15-shell` and `biblequest-v15-runtime` caches are BibleQuest
      owned; unrelated-origin cache names are not touched by activation.
- [ ] Inspect every shell entry: only `/offline`, `/app`, `/onboarding`,
      `/manifest.webmanifest`, and the exact `/pixel/` catalogue from `sw.js`
      may be present.
- [ ] Inspect runtime entries: navigation keys must exactly match the allowlist
      above and contain no query string; asset keys must begin
      `/_next/static/` and contain no query string.
- [ ] Visit `/auth/callback?code=fake`, `/app/account`, `/api/health`,
      `/app?qa=1`, and `/app/plus`; refresh Cache Storage and confirm none was
      added.
- [ ] In DevTools Network, confirm `/sw.js` is served with
      `Cache-Control: no-cache, no-store, must-revalidate`; auth, account, and
      API responses are `private, no-store`.
- [ ] Simulate Offline in DevTools: cached allowlisted navigation falls back to
      its exact cached page, an unvisited/forbidden navigation falls back to
      `/offline`, and an online 4xx/5xx remains visible instead of being replaced
      by cached content.
- [ ] Seed old `biblequest-v13-shell` / `biblequest-v13-runtime` cache names and a
      clearly unrelated cache, activate the new worker, and confirm only the
      old `biblequest-*` caches are removed.

## Manual — guardrails

- [ ] No shame / streak-loss / guilt copy anywhere.
- [ ] No prayer or reflection text appears in console, network analytics, or logs.
- [ ] Scripture always labels the edition actually shown; a preferred edition
      is never used as the label for BSB or WEB fallback text.
- [ ] Select BSB, Spanish R09, German L12, Chinese CU1, and Arabic VDV in turn;
      confirm chapter text, direction, source/license link, save, and share.
- [ ] Disconnect the network after loading an open edition and confirm saved
      verses use their attributed stored snapshot while unsaved readings fall
      back to bundled WEB with a visible explanation.
- [ ] Open a BSB public verse URL and confirm its canonical/share metadata keeps
      `translation=bsb`; invalid or licensed translation query values show WEB.
- [ ] Nothing implies paid users are closer to God.
- [ ] The UI never looks like a generic Tailwind/shadcn dashboard.

## Manual — analytics privacy

- [ ] On a new profile and after migration, the analytics toggle is off and no
      request is made even when analytics environment variables are configured.
- [ ] Opting in produces one `POST` to the configured Plausible `/api/event`
      endpoint per online event attempt; no provider script or second dispatch
      appears in Network or the page source.
- [ ] Payload URLs contain no query string, hash, quest slug, book/chapter value,
      or other dynamic segment; request details show no referrer or credentials.
- [ ] Payload properties match [`ANALYTICS.md`](ANALYTICS.md) exactly. Search the
      request body for prayer/reflection/note/verse fixtures, email, phone, user
      ID, record ID, and auth token; none may appear.
- [ ] With DevTools Offline, generate more than 50 accepted events and confirm
      `biblequest:analytics-queue` remains capped at 50 sanitized entries.
- [ ] While a reconnect flush is active, turn analytics off in another tab.
      Confirm the queue disappears immediately and no later event is sent in
      either tab or after relaunch.
- [ ] Enable browser Do Not Track or Global Privacy Control and confirm analytics
      remains a silent no-op even with explicit in-app consent.

## Known launch postures

- Guest data is device-local. A guest-only production launch may be READY only
  after the containment matrix above and named acceptance pass; active SMTP,
  Gmail/iCloud, provider callback, account sync, transactional/cached-client, and
  A/B behavior remain explicitly out of scope. Migrations through `0015`, RLS/
  grants and anonymous denials, public CAS posture, content, backup/restore,
  privacy, device, legal, monitoring, and rollback evidence still pass.
- Before the beta gate opens, account sync must pass the complete custom-auth
  email, Gmail/iCloud, callback, transactional/cached-client, and both-direction
  two-user checks in [`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md). A
  prior guest-only launch is not evidence for any of those active behaviors.
- Notification delivery and external AI generation are not implemented. Plus
  stays coming-soon unless its complete provider and release gates pass.
