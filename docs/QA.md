# QA checklist

This checklist supplies the detailed test cases for the July 31
[`launch and rollback runbook`](LAUNCH_RUNBOOK.md). Record launch evidence and
sign-off in that runbook; an unchecked item is not a pass.

## Automated

```bash
pnpm test                # all Vitest risk tests; noninteractive and exits
pnpm test:headers        # production build + next start/dev header tests
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
supabase test db --local # all account, avatar, push, billing, and support pgTAP
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
- Direct Stripe tests cover deny-by-default/mode configuration, server-selected
  Prices, current-object entitlement projection, Checkout/Portal origins,
  signed replay-safe webhook boundaries, failure categories, account
  isolation, and legally retained deletion posture.
- One-time support tests cover server-bounded amounts, guest/account separation,
  idempotent Checkout creation, exact hosted origins, current-object
  completion/refund/dispute projection, sealed records, and pressure-free copy.
- The service worker default-denies sensitive/query-bearing navigations,
  validates responses before caching, and removes only BibleQuest-owned stale
  caches.
- Live production and development responses preserve the exact Winterhill
  ancestor list, omit conflicting `X-Frame-Options`, scope HSTS/`unsafe-eval`
  correctly, and keep hosted Stripe navigation out of the document CSP.

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
| Direct Stripe Checkout | Use the test-only purchase gate and all three configured Prices; complete monthly, annual, and lifetime Checkout and cancel a separate session. | Displayed amounts come from Stripe; the server selects the Price; cancel grants nothing; success grants only after the signed webhook/current-object projection. Lifetime has no renewal and full refund/open or lost dispute removes access. | Billing owner |
| Stripe 3DS | Use hosted Stripe Checkout in test mode with an official 3DS challenge test payment method; complete and cancel separate challenges. | Stripe owns the hosted challenge origin; success reconciles current Subscription state; cancellation grants nothing; BibleQuest CSP gains no Stripe subresource origin. | Billing owner |
| One-time support | Enable only the test support latch; complete guest and signed-in support, cancel, expire, refund, dispute, resend, and abuse checks from the dedicated matrix. | Server amount/currency and exact hosted origin hold; signed current objects alone update bounded financial state; no account is created, no Plus access appears, and no payment/contact data enters evidence. | Billing owner |

## Manual — exact Email and Google auth workflows

Run this section only on an auth + sync enabled release candidate with two
disposable accounts and inboxes. A guest-only launch records every active
provider row `OUT OF SCOPE — APPROVED GUEST-ONLY` and completes the containment
matrix instead. Record UTC time, immutable deployment SHA, browser/device,
sanitized Supabase/provider event status, and pass/fail. Never save an email
address, code, token, callback URL, cookie, user ID, or private content.

### Email

| Case | Action | Pass criteria |
| --- | --- | --- |
| New signup and verification | Request passwordless email for a never-used Gmail address. Test the numeric code inside the requesting installed PWA, then use a new message to test the browser link. | Custom sender and branded template appear; matching Supabase and SMTP events exist; each path creates one verified account and reaches only an approved same-origin destination. |
| Returning login | Fully sign out, close the client, request a fresh message, sign in, then close/reopen again. | One existing account resumes, its owned test state restores, and no second identity or guest-owned state is silently attached. |
| Single use and expiry | Reuse a consumed code/link; separately use an expired code/link and a link opened in the wrong browser context. | Each fails with bounded recovery copy; no session is created; raw provider text, token, and email never enter the destination URL, logs, analytics, or evidence. |
| Resend and rate limits | Request again before 60 seconds, after 60 seconds, and repeatedly up to the approved Supabase/provider threshold. | UI cooldown works; server/provider throttling is calm and bounded; Google remains usable; no address-enumeration difference appears. |
| Recovery/reset | Generate a Supabase `recovery` callback for the disposable account even though BibleQuest advertises passwordless sign-in, not a password-reset UI. | Callback is `private, no-store`, stays same-origin, and reaches only the reviewed recovery posture; malformed/expired recovery credentials create no session or account change. |
| Email change | Generate and complete the reviewed Supabase `email_change` flow for the disposable account, then repeat with an expired/used credential. | Fresh confirmation preserves the same owner and private rows; old address no longer signs in after provider state settles; invalid credentials change nothing and expose no address/token. |
| Logout/login | Sign out from settings, navigate/reload/back-forward, then sign in again. | Private UI, avatar URL, billing state, push controls, and sync client clear immediately; no stale account flashes; the same account restores only after verified login. |
| Sender and spam posture | Deliver fresh messages to Gmail and iCloud; inspect Supabase and SMTP-provider delivery records plus Inbox/Spam placement. | Verified custom domain/sender, SPF/DKIM/DMARC posture, matching delivery events, acceptable placement, reply/support path, and no production use of Supabase’s test sender. |

### Google

| Case | Action | Pass criteria |
| --- | --- | --- |
| New signup | From a clean client, choose Google and approve with a never-used disposable Google account. | Consent identifies the reviewed app/domain; callback is canonical and `private, no-store`; exactly one BibleQuest account is created. |
| Returning login | Sign out, fully close, then choose the same Google account again. | The same owner and test state restore; no duplicate account or guest-state attachment appears. |
| Cancel and provider error | Cancel at account chooser/consent; separately exercise a safe test provider-error callback. | User returns to bounded recovery UI; no session/account is created and no raw Google error or identifier is exposed. |
| Wrong account | At the chooser select disposable account B instead of A. | B opens as B with none of A’s identifiers, avatar, billing, push, prayer, reflection, Journey, or settings state. |
| Redirect defense | Test approved internal `next` values plus external, protocol-relative, encoded, and malformed destinations. | Approved paths remain on the canonical origin; every hostile form is rejected without credential exchange or open redirect. |
| Logout/login | Sign out, use reload/back-forward, then sign in with Google again. | Session UI and private caches clear on logout; returning login restores only the selected account. |
| Email collision/linking | Use passwordless email and Google with the same verified disposable address, then repeat with distinct addresses. | Result matches the frozen Supabase identity-linking policy; there is no silent cross-owner merge, orphaned private data, or attacker-controlled linking. Evidence records only “same owner” or “separate owners,” never raw IDs. |

Any unreviewed redirect, token leak, duplicate identity, cross-owner merge,
address-enumeration behavior, stale private UI, or provider flow that cannot be
matched to sanitized server logs keeps auth + sync disabled.

## Manual — exact two-user private-data isolation

Use two disposable verified users A and B, separate browser profiles, synthetic
sentinel content, normal user tokens, and the immutable candidate. Run the
checked-in pgTAP/RLS report first, then prove the deployed API boundary. Do not
use the service-role key for negative tests.

| Surface | Required A↔B attempts | Pass criteria |
| --- | --- | --- |
| Every user-owned table and view | For every private relation named by the RLS report, test owner create/read/update/delete, cross-owner filtered read, list/enumeration, guessed UUID/natural key, spoofed owner insert/upsert, update, and delete in both directions. | Owner CRUD follows the contract; cross-owner reads are empty and writes are denied or affect zero rows; no count, error, timing, or returned representation leaks another owner. |
| Prayer, reflection, quest, Bible, Journey, and settings | Create distinct A/B sentinels, reload on second clients, edit/delete, reconnect from offline, and inspect all app list/detail/export surfaces. | Each account sees only its own records; deletion does not resurrect; export contains only the signed-in owner; local drafts never cross accounts. |
| RPCs and account deletion | Exercise every authenticated RPC with own IDs, B’s guessed IDs, anonymous credentials, stale generation/revision, duplicate request UUIDs, and malformed bounded input; run Clear My Data and full account deletion separately. | `auth.uid()` remains authoritative; anonymous/cross-owner calls fail; retries are idempotent; purge removes only the target owner; B remains unchanged. |
| Avatar API and Storage | Upload/get/replace/delete each owner’s avatar; try listing, reading, signing, uploading, overwriting, moving, and deleting the other owner’s guessed object key; repeat slow/interrupted uploads. | Bucket stays private; only the owner receives a short-lived URL; guessed keys reveal nothing; invalid/partial files never become current; replacement/deletion removes obsolete ownership safely. |
| Push | Create preferences and subscriptions for A/B; attempt cross-owner list/update/delete, endpoint reuse, guessed subscription ID, test delivery, and scheduler access. | Browser roles see only their own bounded posture; endpoint ownership cannot be stolen; scheduler/service operations reject user tokens; logout/deletion removes or disables the correct subscriptions only. |
| Billing and one-time support | Create distinct Stripe test state; try cross-owner status, refresh, Checkout, Portal, guessed app/Stripe identifiers, support rows, and return-query manipulation. | Server derives the owner; browser roles cannot enumerate financial rows; A never receives B’s Portal/entitlement; guest support creates no account; query strings grant nothing. |
| Account switch and residual state | Use A, sign out, then use B in the same client; repeat after reload, back-forward, offline/reconnect, and service-worker update. | A’s avatar, private text, billing, push, caches, and sync status never flash or reappear for B. |

Save only relation/surface names, operation category, HTTP/result category,
UTC time, release SHA, browser/device, and pass/fail. Sanitize HAR/screenshots;
never retain tokens, emails, raw IDs, object keys, private text, Stripe IDs,
push endpoints/keys, or signed URLs. After evidence is accepted, delete both
test users, purge their application rows and avatar objects, remove push
subscriptions, close Stripe test objects where applicable, and record only
sanitized zero-residual counts.

## Manual — exact multi-device, offline, avatar, and push matrix

Use an iPhone installed PWA, Android installed PWA, desktop Chromium, and
desktop Safari against one immutable candidate. For worker update/rollback,
use the approved same-origin non-production alias and record both artifact SHAs.

| Case | Action | Pass criteria |
| --- | --- | --- |
| Install and relaunch | Add to Home Screen on iPhone Safari and Android Chrome; install/use desktop Chromium where offered; open normally in desktop Safari; close/relaunch each twice. | Correct icon/name/start URL, standalone posture on phones, safe-area layout, retained local/session posture, and no unexpected account or payment control. |
| Avatar sync | Upload on one device, observe on the other three, replace on a second device, then delete on a third. | Current avatar converges everywhere after normal refresh signals; stale signed URLs fail safely; no old/account-switched avatar flash appears. |
| Slow/interrupted upload | Throttle upload, disconnect mid-request, retry the same valid file, then try oversized, wrong-type, corrupt, and decompression-heavy files. | Calm bounded failure; no partial current avatar; retry succeeds once; server-decoded limits hold; temporary/obsolete objects do not accumulate. |
| Offline edits and conflicts | While one device is offline, create/edit/delete prayer, reflection, quest, Bible, Journey, and settings state from both clients; reconnect in both orders. | Local work survives close/reopen; merge/CAS rules converge without duplication, resurrection, completion loss, silent overwrite, or retry loop. |
| Service-worker update and rollback | Load the compatible old artifact, fully close, remap the controlled alias to candidate, relaunch twice, then rehearse the approved compatible rollback. | Worker becomes `biblequest-v21`; only allowlisted public shells/assets are cached; no auth/API/private response is cached; update and rollback do not strand the app. |
| Push subscribe/unsubscribe | On each supported platform, grant permission only after the in-app action, subscribe, send a test reminder, change time/timezone, unsubscribe, and revoke browser permission. | One owner-bound subscription per endpoint; foreground/background behavior is honest; changes converge; unsubscribe/revocation stops delivery without affecting another device. Unsupported Safari/device posture is explicit, not reported as pass. |
| Logout and deletion | With multiple active devices and push subscriptions, log out one device, then delete the disposable account from another; reopen all clients online and offline. | Logged-out client clears private UI/subscription posture; deletion purges/detaches reviewed data, prevents later push, and no offline client resurrects the account. |

Record platform/OS/browser versions, UTC time, immutable SHA, worker version,
network posture, sanitized provider/event category, and pass/fail. Never record
private content, accounts, notification endpoints/keys, signed avatar URLs,
payment/contact data, cookies, tokens, or raw identifiers.

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

## Manual — direct Stripe (test only)

Keep Vercel Production `coming-soon` with purchases disabled. Use only ignored
local or encrypted preview test credentials; never print them or create/change
live billing state. Complete the full evidence matrix in
[`STRIPE_TEST_BILLING.md`](STRIPE_TEST_BILLING.md).

- [ ] Coming-soon/no-key: pricing and `/app/plus` show calm coming-soon copy and
      no purchase control.
- [ ] Invalid, incomplete, mismatched-mode, or duplicate-Price configuration
      fails closed and health reports `invalid` without exposing a value.
- [ ] Test mode with purchase gate off shows no checkout control.
- [ ] Monthly, annual, and lifetime controls display Stripe-authored amounts for the same
      Product/currency and open only exact hosted Checkout.
- [ ] Checkout cancellation and return query manipulation grant nothing.
- [ ] Success, 3DS, initial failure, renewal failure/recovery, cancel-at-period,
      Portal, refund, and dispute states match the server projection.
- [ ] Duplicate and out-of-order webhook delivery cannot replay an entitlement.
- [ ] Reload, focus, `pageshow`, visibility return, reconnect, and explicit
      refresh restore current server state.
- [ ] Sign out and Account A → B never show A’s status or management control.
- [ ] Analytics/network/evidence contains no Customer, Subscription, Price,
      Session, invoice, payment method, card, email, or webhook payload data.

## Manual — one-time support (test only)

Keep the Production support latch off. Use only test credentials and complete
the full matrix in
[`STRIPE_ONE_TIME_SUPPORT.md`](STRIPE_ONE_TIME_SUPPORT.md).

- [ ] Support-disabled and invalid billing postures show no payment control.
- [ ] Presets/custom amount bounds, immutable request UUID, same-origin/body
      guards, per-instance throttles, and Vercel Firewall all fail closed.
- [ ] Guest Checkout creates no app account; signed-in Checkout remains
      separate from Plus; both return only an exact hosted Stripe URL.
- [ ] Cancel/return query manipulation never claims payment.
- [ ] Signed current Session events cover success, async failure, and expiry;
      duplicate/out-of-order delivery remains replay-safe.
- [ ] Current Charge/Dispute state covers partial/full refund and
      created/updated/won/lost dispute posture.
- [ ] Account deletion detaches the user ID while preserving the bounded
      financial record; browser roles cannot read or mutate any support row.
- [ ] Stripe receipt/refund email, support inbox, pressure-free copy, desktop
      browsers, and physical mobile Safari all pass.
- [ ] Logs, analytics, network summaries, screenshots, and saved evidence
      contain no contact/payment IDs, Checkout URLs, or raw webhook payloads.

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
      `biblequest-v21-shell` and `biblequest-v21-runtime` caches are BibleQuest
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
- Private Web Push is implemented but remains deny-by-default until its
  migration, encryption, scheduler, isolation, device, and live rollout gates
  pass. External AI generation is not implemented. Plus and one-time support
  stay disabled unless their complete provider and release gates pass.
