# iOS Phase 4b — native session transport (handoff)

Paste the section below into a fresh session. Everything it needs is stated;
it should not have to rediscover the measurements, which were expensive.

---

## Task

Finish Phase 4b of the BibleQuest iOS work: make authenticated API calls work
from the Capacitor iOS app. Two pieces remain — **bearer identity** and a
**CORS layer**. Both touch live web security code, so correctness matters more
than speed.

Repo: `/Users/brendankenney/Development/BibleQuest`, branch
`feat/capacitor-ios-scaffold`. The tree is clean; the last two commits are
`d9165c1` (the iOS app) and `d1a17b4` (the native origin allowance).

## Measured facts — do not re-derive, do not assume otherwise

These were measured on device (iPhone 17 Pro, iOS 26.5, Capacitor 8.5.0) with a
request-echo server. Two earlier confident assumptions in this project were
wrong (`iosScheme` could not be https; `trailingSlash` was not required), and
both were caught only by running the app. Treat anything unmeasured as unknown.

| fact | value |
| --- | --- |
| WebView origin | `capacitor://localhost` (frozen — it partitions localStorage) |
| `Origin` header sent cross-origin | the literal `capacitor://localhost`, **not** `"null"` |
| `Sec-Fetch-Site` | `cross-site` |
| `Sec-Fetch-Mode` | `cors`; `Referer` absent |
| cookie on a cross-origin POST | **not sent** |
| `document.cookie` at that origin | **silent no-op** (already worked around) |
| Supabase reachability | fine — CORS does not block it |
| `isSecureContext` / `crypto.subtle` | true / works (PKCE is viable) |

Also measured, in node: `new URL("capacitor://localhost").origin === "null"`,
identical to `new URL("foo://bar").origin` and any `chrome-extension://…`.

## What already exists

- `src/lib/http/native-origin.ts` — the single decision point. Exports
  `NATIVE_APP_ORIGIN`, `nativeApiOriginEnabled()`, `isNativeAppOrigin(request)`.
  Compares the **raw lowercased** `Origin` header against a frozen source
  constant. Latch is `BIBLEQUEST_NATIVE_API_ORIGIN_ENABLED === "true"`,
  server-only, **default off**.
- That helper is already wired into `hasSameOrigin`
  (`src/lib/http/request.ts`), `crossSiteBrowserRequest`
  (`src/lib/bible/provider-request-guard.ts`, placed **above** the Fetch
  Metadata branch), and `hasExactOrigin`
  (`src/app/api/observability/client/route.ts`).
- `/api/support/checkout` explicitly **rejects** the native origin. Keep it
  that way (see traps).
- `src/lib/supabase/native-cookie-storage.ts` — the session store standing in
  for the no-op `document.cookie`, passed to `createBrowserClient` via the
  `cookies` option.
- Tests: `tests/native-origin.test.ts`, `tests/native-session-storage.test.ts`.

## Piece 1 — bearer identity, by construction

`src/lib/supabase/authenticated.server.ts` currently builds a cookie client and
calls `supabase.auth.getUser()` with no argument.

Requirements:

1. **Branch before any client is built.** On the native path, never call
   `createServerSupabase()`. Build a fresh client with no cookie adapter and
   `global.headers.Authorization`, and return *that* as `context.supabase`.
2. **Parse the token strictly** — e.g. `/^Bearer ([A-Za-z0-9._~+/-]+=*)$/` on
   the raw header. Reject empty or whitespace.
3. Verify with `getUser(token)` and assert a non-empty user id.

Why "by construction" and not a conditional: `getUser(jwt)` falls back to the
client's own storage when `jwt` is falsy. A route could then believe it took
the bearer path while acting as the cookie user. Four routes
(`arcade/consume`, `push/preferences`, `push/subscriptions`, `push/test`) write
through the service-role admin client keyed on `context.user.id` with **no RLS
backstop**, so identity confusion there is unrecoverable. The avatar route
splits the other way, running RLS work on `context.supabase` against
`auth.uid()`.

## Piece 2 — the CORS layer

1. **No `Access-Control-Allow-Credentials`.** Cookies are measurably never sent
   cross-site, so it buys nothing — and it would turn any future same-site
   allowlist entry (`console.biblequest.co` is same-site with `www`) into
   credentialed cross-origin read of unguarded `GET`s. Omitting it also
   enforces bearer-only a second time at the browser.
2. **Static `Access-Control-Allow-Origin`** for the one frozen native origin —
   never reflected. Assert by construction that no `http(s)` origin can be
   allowlisted, with a test.
3. `Vary: Origin`, `Access-Control-Allow-Methods`,
   `Access-Control-Allow-Headers: Content-Type, Authorization`, and an
   `OPTIONS` short-circuit. No route exports `OPTIONS` today.
4. **Exclude `/api/billing/plans`** — the one publicly cacheable response
   (`Cache-Control: public, max-age=300`, which may conflict with
   next.config's `private, no-store` for `/api/:path*`; verify which actually
   ships). Stamping CORS on a shared-cacheable response is a cache-poisoning
   hazard.
5. CORS headers are **decoration, not a boundary** — the 403 in the guard is
   the boundary. If the `OPTIONS` short-circuit lives in `src/proxy.ts` (Edge)
   while the accept/reject decision lives in Node route handlers, they must
   call the *same* helper. `src/proxy.ts` runs on every request to the live
   site; a mistake there is a total outage, so land it as its own change.

## Traps

- Do **not** allowlist `Origin: null`. A sandboxed iframe or cross-origin
  redirect can produce one from a hostile page.
- Do **not** compare the native origin through `new URL(...).origin`.
- Do **not** weaken or delete the `Sec-Fetch-Site` branch — it is the
  anti-hotlink defence for every web caller. Add allows, never removals.
- Do **not** extend the allowance to `/api/support/checkout`. It serves guests,
  so the origin check is its only protection; the header carries no
  authentication weight.
- `apiFetch` (`src/lib/platform/api.ts`) passes `init` verbatim. Injecting
  `Authorization` must **merge** headers via `new Headers(init?.headers)` —
  `src/lib/avatar/client.ts` deliberately omits `Content-Type` so the browser
  generates the multipart boundary. Gate injection on `isNativeTarget()` so the
  web bundle never sends a token that could diverge from its cookie.
- The 20 `credentials: "same-origin"` call sites should become
  `credentials: "omit"` on native.
- `NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED` is a single global build constant. Set it
  only in the `build:native` invocation's environment — never in `.env.local`
  or shared Vercel env, or account sync opens on the **web** build too.

## Also worth doing

- Document `BIBLEQUEST_NATIVE_API_ORIGIN_ENABLED` in `.env.example` beside the
  other per-environment latches, noting it must never be scoped to "All
  Environments" in Vercel.
- Give the two 403s distinct codes (`forbidden_origin` vs
  `forbidden_fetch_site`) so a partial rollout is visible in logs.
- Fix account deletion on native: `src/lib/auth/account-deletion.ts` correctly
  deletes storage before identity, but its avatar `DELETE` goes through
  `apiFetch` and is unreachable. Replace only the default `removeOwnedAvatars`
  on native with a direct `supabase.storage.from('profile-avatars').remove()`.
  Deletion leaving media behind is a named App Store hard release stop.
- Add offline entitlement grace: `usePlus` resolves to a **confident** free tier
  on fetch failure (`status: "error"` makes `loading` false), so a paying
  subscriber offline silently loses wallpaper, quest slots and rhythm blocks.

## Verification

- `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build` must all stay
  green; the web build must not change behaviour.
- `pnpm build:native` then `pnpm exec cap sync ios`, build in Xcode, and run on
  the simulator. Cheapest non-authenticated end-to-end proof that CORS works:
  switch the Bible translation to a non-bundled edition and confirm the text
  loads instead of falling back to the bundled WEB with a notice.
- Keep the latch **off** by default. Enable it only in the native build's
  environment.

## Honest state

iOS is currently guest-only, free-tier and English-WEB-only. Sign-in is
unverified end-to-end — the cookie adapter is unit-tested against the package
contract but has not been observed carrying a real session. Treat this as
internal TestFlight only until the entitlement work lands, because signing in
without it makes the experience *worse* for exactly the people most likely to
sign in: a paying member lands in a confidently-free state with the explanatory
upsell suppressed on native.
