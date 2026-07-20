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
pnpm test:watch          # Vitest watch mode for local development
pnpm lint                # ESLint — 0 errors
pnpm exec tsc --noEmit   # strict TypeScript — 0 errors
pnpm build               # production build succeeds
pnpm audit --prod        # production dependency audit
git diff --check         # no whitespace errors
```

The automated suite targets launch-critical behavior rather than UI snapshots:

- Auth callback targets stay on-origin and malformed redirect input falls back
  safely.
- Current journey backups round-trip, legacy daily assignments normalize, My
  Quests state survives restore, and malformed records are discarded.
- Clear/restore intent and per-record tombstones prevent account data from
  reappearing after deletion.
- Sync refuses cross-account handoff, permits same-account restart, invalidates
  stale runs, and applies tombstones before merging remote rows.
- Analytics uses one transport; default-denies incomplete configuration and
  consent; validates closed event/prop shapes; normalizes URLs; honors DNT/GPC;
  bounds and sanitizes offline retries; and stops safely on mid-flush opt-out.
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
| Supabase sign-in and sync | On a clean browser profile, sign in through each enabled method, create one non-sensitive test record, reload, and confirm the same account receives the synced record. | Auth calls reach only the configured Supabase project over HTTPS; the session survives; sync completes; no CSP errors or cross-account data appears. | Supabase owner |
| Magic-link request + callback | Request a link for Gmail and iCloud addresses that are not Supabase organization members. Confirm the UI says the link was requested (not delivered), shows the target address, holds resend for 60 seconds, and keeps Google plus a local continuation available. Open the link in the intended same browser and in the supported token-hash/cross-device path, and observe `/auth/callback` through the first-quest hand-off. | Both messages have matching Supabase and SMTP-provider delivery events; callback stays on the BibleQuest origin, sets/refreshes the session, is `private, no-store`, and expired/used/browser-mismatch links show a bounded recovery reason with no raw token or provider text. | Supabase owner |
| PWA | Install from the release candidate, launch standalone, inspect `/sw.js` headers and Cache Storage, then repeat the documented online/offline/reconnect flow. | Install/launch works; only the documented self-hosted shell/build assets are cached; forbidden/private routes are absent; worker update and streaming navigation remain functional. | Repository owner |
| RevenueCat sandbox paywall | Use the Test Store public key and a published sandbox paywall; open Plus, exercise paywall/package fallback, close/reopen, and complete a simulated purchase. | Offerings, branding image/font/media, entitlement refresh, and management action work without CSP errors; no Stripe request occurs for Test Store. | Billing owner |
| Stripe 3DS | Use RevenueCat Web Billing in Stripe test mode with an official 3DS challenge test payment method; complete and cancel separate challenges while watching frames and requests. | Stripe.js loads from its allowed JS origin, API calls use `api.stripe.com`, 3DS renders through allowed Stripe/hooks frames, success updates entitlement, cancel returns safely, and no CSP source was broadened ad hoc. | Billing owner |

## Manual — core daily loop

- [ ] A new visitor to `/app` is routed to onboarding.
- [ ] Onboarding shows the account card before revealing the first quest. Email
      and Google are visually primary; “Not now — continue on this device” is
      available as a quiet local-first escape without losing profile choices.
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
      both remain. Reconnect and confirm normal sync behavior separately.
- [ ] Follow an auth callback, account link, and URL containing `?qa=1` while
      offline; each must use the offline fallback and must not reveal a cached
      response for that URL.
- [ ] After reconnecting and loading a newer release, relaunch twice and confirm
      the worker update does not strand the installed app on the old shell.

### Desktop Cache Storage inspection

- [ ] Run a production build, open the app, and in DevTools → Application →
      Service Workers confirm `/sw.js` controls the page at scope `/`.
- [ ] In Application → Cache Storage, confirm only the current
      `biblequest-v4-shell` and `biblequest-v4-runtime` caches are BibleQuest
      owned; unrelated-origin cache names are not touched by activation.
- [ ] Inspect every shell entry: only `/offline`, `/app`, `/onboarding`, and
      `/manifest.webmanifest` may be present.
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
- [ ] Seed old `biblequest-v3-shell` / `biblequest-v3-runtime` cache names and a
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

- Guest data is device-local. Account sync is implemented, but production must
  pass migrations through `0011`, content reconciliation, custom auth-email,
  and both-direction two-user checks in
  [`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md) before the beta gate opens.
- Notification delivery and external AI generation are not implemented. Plus
  stays coming-soon unless its complete provider and release gates pass.
