# iOS Phase 4b — native session transport

The iOS app can already **reach** the hosted API and cannot **authenticate** to
it. Phase 4b closes that: bearer identity on the server, and a CORS layer.

Branch `feat/capacitor-ios-scaffold` at `79d21ea`. One unrelated modification
sits in the tree (`.claude/launch.json`); ignore it — it is rsync-excluded from
the native build.

---

## Do this in order

1. **Document the latch** — `BIBLEQUEST_NATIVE_API_ORIGIN_ENABLED` in
   `.env.example`, beside the other per-environment latches. Zero risk, and it
   is the thing a reviewer will look for first.
2. **CORS + `OPTIONS`, alone, as its own change.** Everything else is untestable
   on device until preflights stop failing. `src/proxy.ts` runs on every request
   to the live site, so this ships and is verified by itself.
3. **Bearer identity** — `authenticatedServerContext()` plus its 16 call sites.
4. **`Authorization` injection** in `apiFetch`, gated on `isNativeTarget()`.
5. **Deferred items** (bottom of this doc), each as its own change.

## Done when

1. With the latch **off**, every `/api/*` response is byte-identical to today —
   pinned by a test.
2. With the latch **on**, an `OPTIONS` preflight from `capacitor://localhost` to
   an authenticated route returns 204 with the exact-origin CORS headers and no
   `Access-Control-Allow-Credentials`.
3. A request bearing a valid token resolves to the right user; one bearing an
   empty, malformed or expired token returns `privateError("unauthorized", 401)`
   and **never** falls back to a cookie identity.
4. Two different accounts cannot read each other's data through the bearer path
   — verified against a real entitlement, not a unit test.
5. `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build` stay green.
   That is a regression bar, not a definition of done.

---

## Invariants — breaking these is a vulnerability

- **There is no RLS backstop on 15 of the 16 authenticated surfaces.**
  `.eq("user_id", context.user.id)` on a service-role client is the only thing
  separating accounts. A bearer path that resolves the wrong user is a
  cross-account data breach, not a bug.
- **Never allowlist `Origin: null`.** A sandboxed iframe or a cross-origin
  redirect can make a real browser send it.
- **Never compare the native origin through `new URL(...).origin`.** Every
  non-special scheme serialises to the string `"null"`, so that comparison
  matches `foo://bar` and any `chrome-extension://…`. See the reasoning already
  written at `src/lib/http/native-origin.ts:26-34`.
- **Never weaken the `Sec-Fetch-Site` branch** at
  `src/lib/bible/provider-request-guard.ts:99`. It is the anti-hotlink defence
  for every web caller. Add allows, never removals.
- **Never extend the allowance to `/api/support/checkout`.** It serves guests,
  so the origin check is its only protection, and an `Origin` header carries no
  authentication weight. It is explicitly denied at
  `src/app/api/support/checkout/route.ts:69`.
- **One exported decision, never two.** Quoting
  `src/lib/http/native-origin.ts:5-8`: *"Two separately-located checks
  disagreeing about who a caller is has been the source of real
  vulnerabilities; a single exported decision cannot drift."* The CORS layer
  must call `isNativeAppOrigin`, not re-implement it.
- **Fail closed.** Any parse or verification failure returns
  `privateError("unauthorized", 401)` — the same code and status as the existing
  cookie failure at `src/lib/supabase/authenticated.server.ts:18`, so a partial
  rollout is indistinguishable from a logged-out user.

## Measured on device — do not re-derive

iPhone 17 Pro, iOS 26.5, Capacitor 8.5.0, against a request-echo server. Treat
anything unmeasured as unknown: two confident assumptions in this project were
already wrong, and only running the app caught them.

| fact | value |
| --- | --- |
| WebView origin | `capacitor://localhost` (frozen — it partitions localStorage) |
| `Origin` sent cross-origin | the literal `capacitor://localhost`, **not** `"null"` |
| `Sec-Fetch-Site` | `cross-site` |
| `Sec-Fetch-Mode` | `cors`; `Referer` absent |
| cookie on a cross-origin POST | **not sent** |
| `document.cookie` at that origin | **silent no-op** (already worked around) |
| direct `*.supabase.co` calls | reachable — Supabase serves its own CORS. Says nothing about `/api/*`, which serves none |
| `isSecureContext` / `crypto.subtle` | true / works, so PKCE is viable |

## What already exists

- `src/lib/http/native-origin.ts` — the single decision point.
  `NATIVE_APP_ORIGIN`, `nativeApiOriginEnabled()`, `isNativeAppOrigin(request)`.
  Raw lowercased header compared to a frozen source constant; latch is
  server-only and **defaults to off**.
- Wired into `src/lib/http/request.ts:8` (`hasSameOrigin`),
  `src/lib/bible/provider-request-guard.ts:93` (`crossSiteBrowserRequest`,
  above the Fetch Metadata branch), `src/app/api/observability/client/route.ts`
  (`hasExactOrigin`), and denied at `src/app/api/support/checkout/route.ts:69`.
- `src/lib/supabase/native-cookie-storage.ts` — session store standing in for
  the no-op `document.cookie`, passed to `createBrowserClient` via the `cookies`
  option (`auth.storage` is silently overwritten by that package; `cookies` is
  honored).
- A client-side access token already exists at
  `src/lib/supabase/client.ts` in the `accessToken` callback.
- Tests: `tests/native-origin.test.ts`, `tests/native-session-storage.test.ts`.

**The CORS layer is greenfield.** Verified: zero `Access-Control-*` anywhere in
`src/`, `next.config.ts` or `vercel.json`, and zero `OPTIONS` exports. Nothing
to remove, nothing to reconcile — a preflight to any `/api/*` route currently
reaches a route file that exports no `OPTIONS`.

---

## Piece 1 — bearer identity

**The structural blocker:** `authenticatedServerContext()` takes no parameters
(`src/lib/supabase/authenticated.server.ts:9`) and reads cookies out of
`next/headers` via `createServerSupabase()` (`src/lib/supabase/server.ts:19`,
`await cookies()`). It cannot see the incoming `Request`. A bearer variant must
accept `request: Request`, which means touching all 16 call sites.

Preserve the union return `{ supabase, user } | Response`; every caller
discriminates with `if (context instanceof Response) return context;`.

**Branch before any client is built.** On the native path never call
`createServerSupabase()`. `getUser(jwt)` falls back to the client's own storage
when `jwt` is falsy, so a conditional inside a function that can still reach the
cookie factory produces a route that believes it took the bearer path while
acting as the cookie user.

Ingredients for the bearer client: `process.env.NEXT_PUBLIC_SUPABASE_URL!`,
`supabasePublishableKey()` from `@/lib/supabase/config`, guarded by
`isSupabaseConfigured()` from `@/lib/supabase/client`. Construct with
`createClient` from `@supabase/supabase-js` — no cookie adapter,
`auth: { persistSession: false, autoRefreshToken: false }`, and
`global.headers.Authorization`.

**Token shape.** Do not use the RFC 6750 `b64token` charset — it permits `+`
and `/`, which are not base64url, and permits zero dots. Write an anchored
three-segment check against the value after stripping `Bearer `, plus a bounded
maximum length. This is a cheap shape gate, not verification;
`getUser(token)` is the verification and it is a real network round-trip that
checks signature, expiry and revocation.

### The 16 call sites

| route | line | method |
| --- | --- | --- |
| `api/arcade/status/route.ts` | 16 | GET |
| `api/arcade/consume/route.ts` | 16 | POST |
| `api/arcade/checkout/route.ts` | 26 | POST |
| `api/billing/status/route.ts` | 22 | GET |
| `api/billing/checkout/route.ts` | 28 | POST |
| `api/billing/portal/route.ts` | 19 | POST |
| `api/billing/refresh/route.ts` | 20 | POST |
| `api/push/config/route.ts` | 22 | GET |
| `api/push/preferences/route.ts` | 26 | PATCH |
| `api/push/test/route.ts` | 28 | POST |
| `api/push/subscriptions/route.ts` | 39, 131 | POST, DELETE |
| `api/profile/avatar/route.ts` | 130, 185, 325 | GET, POST, DELETE |
| `lib/billing/plus-entitlement.server.ts` | 22 | via `requireServerPlus` |

All 16 touch `context.supabase`, but for 15 of them it is **only** an
anon-granted `*_contract()` readiness probe — it proves nothing about identity
and will pass with a broken token. Their real per-user work runs on the
service-role admin client keyed on `context.user.id`.

## Piece 1 — the avatar trap

`/api/profile/avatar` is the one surface doing genuine RLS-scoped PostgREST and
Storage work through `context.supabase`.

A verify-only design — call `getUser(token)`, key the admin client on the
returned id — **satisfies 15 of 16 call sites and silently breaks all three
avatar handlers.** The RPCs `set_profile_avatar` and `clear_profile_avatar` take
no user-id parameter; they read `auth.uid()` internally and are
`security definer` (`supabase/migrations/0023_private_profile_avatars.sql:93`
and `:157`). If the JWT is not attached to the PostgREST **and** Storage
requests, `auth.uid()` is null and the operation silently targets nothing.

So the bearer client must be the one returned as `context.supabase`, not merely
a means of resolving a user id.

## Piece 2 — the CORS layer

1. **No `Access-Control-Allow-Credentials`.** Cookies are measurably never sent
   cross-site, so it buys nothing — and it would turn any future same-site
   allowlist entry (`console.biblequest.co` is same-site with `www`) into
   credentialed cross-origin read of unguarded `GET`s. Omitting it also enforces
   bearer-only a second time, at the browser.
2. **Static `Access-Control-Allow-Origin`** for the one frozen origin, never
   reflected. Assert by construction that no `http(s)` origin can be
   allowlisted, with a test.
3. `Vary: Origin`, `Access-Control-Allow-Methods`,
   `Access-Control-Allow-Headers: Content-Type, Authorization`, and an `OPTIONS`
   short-circuit.
4. **Exclude `/api/billing/plans`** — it sets `Cache-Control: public,
   max-age=300` on three code paths, while `next.config.ts` applies `private,
   no-store` to `/api/:path*`. Which one actually ships is unresolved; stamping
   CORS on a shared-cacheable response is a cache-poisoning hazard either way.
   Resolve or exclude — do not guess.
5. **`src/proxy.ts` is a viable seam and a dangerous one.** Its matcher
   (`src/proxy.ts:64`) does not exclude `/api`, so it already runs on every API
   request including preflights. But `updateSession` reassigns the response
   object — set CORS headers on the object it *returns*, never before. It
   declares no `export const runtime`; confirm which runtime it gets before
   relying on `process.env` there.
6. **CORS headers are decoration; the 403 in the guard is the boundary.** The
   dangerous failure is not "browser blocks the response" — it is "route
   accepts, mutation commits, browser discards the response". Both layers must
   consult `isNativeAppOrigin`.
7. `/api/*` also matches the `/:path+` rule in `next.config.ts`, so API
   responses already carry the full private security header set. A CORS layer in
   `headers()` would interact with that; a layer in `proxy.ts` does not.

## Footguns — breaking these produces a bug

- `apiFetch` (`src/lib/platform/api.ts:49`) passes `init` verbatim. Injecting
  `Authorization` must **merge** via `new Headers(init?.headers)` —
  `src/lib/avatar/client.ts` deliberately omits `Content-Type` so the browser
  generates the multipart boundary. Gate on `isNativeTarget()` so the web bundle
  never sends a token that could diverge from its cookie.
- There are **21 `apiFetch` call sites**; **19** pass
  `credentials: "same-origin"` and the rest pass none. Because the fix belongs
  in `apiFetch` itself, prefer changing it there over editing 19 sites.
- `tests/platform-boundaries.test.ts` reads the **source text** of eight client
  files and forbids a literal `fetch("/api/...")`. The token must go through
  `apiFetch`.
- `NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED` is a single global build constant. Set it
  only by prefixing the `pnpm build:native` invocation — an inline shell
  assignment overrides `--env-file-if-exists`, so it does not persist. Putting
  it in `.env.local` opens account sync on the **web** build and fails ~11 tests
  across the containment suites.

## Environment and build

```bash
NEXT_PUBLIC_APP_PLATFORM=native \
NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN=https://<preview>.vercel.app \
pnpm build:native
```

Both variables are hard-required; the script fails in under a second with an
actionable message if either is missing or malformed.

**`NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN` must be a bare HTTPS origin** — enforced in
four places (`scripts/build-native.mjs`, `src/lib/platform/runtime.ts`,
`src/lib/platform/api.ts`, `src/lib/security/csp.ts`). You therefore **cannot
point the native build at a local dev server**. Use a Vercel Preview origin and
scope `BIBLEQUEST_NATIVE_API_ORIGIN_ENABLED=true` to Preview only. The CSP
`connect-src` derives from the same variable, so it follows automatically.

```bash
pnpm exec cap sync ios
cd ios/App && xcodebuild -project App.xcodeproj -scheme App \
  -sdk iphonesimulator -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=NO build
```

There is no `.xcworkspace` — the project uses Swift Package Manager.

## Verification

**Without a device.** The token parser, the fail-closed 401, and the CORS header
construction are all unit-testable; the suite runs `environment: "node"` with a
hand-rolled DOM in `tests/setup.ts`.

**Cheapest CORS proof, no auth needed.** In the simulator: Home → tap the avatar
top-left (Settings is *not* in the bottom nav) → the "Bible translation"
disclosure. Success renders a search field listing non-English editions, which
exist only in the server response. Caveat: a 403 and a CORS block look identical
from the app — attach Web Inspector to tell them apart.

**Sign-in.** Build with `NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED=true`, then Home →
avatar → Account sync → Sign in. Use the **emailed numeric code**: it is a pure
XHR (`verifyOtp`) with no redirect. The emailed *link* opens in Safari, and OAuth
falls back to the hosted callback — neither completes in-app until deep links
exist.

## Checks that fail for environment reasons — do not chase

- `pnpm check:supabase-browser-bundle` fails even with a correct `.env.local`,
  because that script alone omits the `--env-file-if-exists=.env.local` its
  siblings have. Run it as
  `node --env-file-if-exists=.env.local scripts/check-supabase-browser-bundle.mjs`
  after a `pnpm build`.
- `pnpm check:seed` writes files before diffing.

## Not in scope

- `/api/support/checkout` — deliberately denied to native; a test asserts that
  exact source line.
- The operator console.
- OAuth deep links — needs `NEXT_PUBLIC_NATIVE_AUTH_CALLBACK_URL` plus a
  `CFBundleURLTypes` entry that does not exist, and Google blocks OAuth in
  embedded WebViews regardless.
- Keychain migration for the session store.

## Release blockers carried from the audit

**Account deletion leaves avatar media behind on native.** The ordering in
`src/lib/auth/account-deletion.ts` is already correct (storage before identity)
and fail-closed, but its avatar `DELETE` goes through `apiFetch` and is
unreachable cross-origin. Replace only the default `removeOwnedAvatars` on
native with a direct `supabase.storage.from('profile-avatars').remove()`.
`docs/IOS_RELEASE_READINESS.md` names this as a hard release stop — it cannot
ride under "nice to have".

*Premise update (post-4b):* once the CORS layer, bearer transport, and
`apiFetch` injection landed, the "unreachable cross-origin" premise above is
expected to be false — the avatar `DELETE` preflights, carries the bearer
token, and deletion runs storage-before-identity while the session is still
valid. Re-measure on device before implementing the direct-storage
replacement; if the `apiFetch` path now works, update the readiness doc's
blocker rationale instead of adding a second, divergent deletion mechanism.

## Deferred — separate changes

- Split the two 403s into `forbidden_origin` / `forbidden_fetch_site` so a
  partial rollout is visible in logs. **`tests/native-origin.test.ts` asserts
  the literal source line in `support/checkout/route.ts`** — update it in the
  same commit.
- Document `BIBLEQUEST_NATIVE_API_ORIGIN_ENABLED` in `.env.example`, noting it
  must never be scoped to "All Environments" in Vercel.
- Offline entitlement grace — a web `usePlus` change; probably belongs in its
  own document.

## Honest state

iOS is guest-only, free-tier and English-WEB-only. Sign-in is unverified
end-to-end: the cookie adapter is unit-tested against the package contract but
has not been observed carrying a real session.

Internal TestFlight only until entitlements land. A paying member offline
resolves to a confident free tier — `usePlus` sets `status: "error"`, which
makes `loading` false — with the explanatory upsell suppressed on native.
