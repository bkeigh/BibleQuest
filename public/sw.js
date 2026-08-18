/* BibleQuest service worker — offline-friendly without caching private state.
 *
 * Cache Storage contains only a small, explicit navigation surface plus
 * validated build assets. Prayers, reflections, and other user data continue
 * to live in the persisted Zustand store; this worker never handles that data.
 */
const CACHE_VERSION = "biblequest-v28";
const CACHE_OWNER_PREFIX = "biblequest-";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const CURRENT_CACHES = [SHELL_CACHE, RUNTIME_CACHE];
const WEB_AUTH_SW_ATTEST_REQUEST = "BIBLEQUEST_WEB_AUTH_ATTEST_V2";
const WEB_AUTH_SW_AUDIT_REQUEST = "BIBLEQUEST_WEB_AUTH_AUDIT_V2";
const WEB_AUTH_SW_CLIENT_CHALLENGE =
  "BIBLEQUEST_WEB_AUTH_CLIENT_CHALLENGE_V2";
const WEB_AUTH_SW_CLIENT_RESPONSE =
  "BIBLEQUEST_WEB_AUTH_CLIENT_RESPONSE_V2";
const WEB_AUTH_SW_RESULT = "BIBLEQUEST_WEB_AUTH_RESULT_V2";
const WEB_AUTH_CHALLENGE_TIMEOUT_MS = 2_000;
const attestedWebAuthClients = new Set();

// These are generic, client-rendered shells. Fetch without credentials during
// install so an authenticated response can never become a shared offline shell.
const ART_ASSET_NAMES = [
  "candle",
  "leaf",
  "star",
  "bird",
  "flower",
  "chapel",
  "book",
  "book-open",
  "bookmark",
  "lantern",
  "tree",
  "sun",
  "hands-praying",
  "wheat",
  "dove",
  "cross",
  "door",
  "key",
  "scroll",
  "compass",
  "crown",
  "mountain",
  "moon",
  "service-basket",
  "links",
  "people",
  "fountain",
  "map",
  "sprout",
  "stone",
  "myshepherd",
  "candle-unlit",
  "candle-small",
  "candle-steady",
  "candle-sparks",
  "candle-halo",
  "mascot-lamb",
  "mascot-campfire",
];

// Cache only the six approved candle loops; every character remains still.
const CANDLE_ANIMATION_NAMES = [
  "candle",
  "candle-unlit",
  "candle-small",
  "candle-steady",
  "candle-sparks",
  "candle-halo",
];

const ART_ASSET_PATHS = [
  ...ART_ASSET_NAMES.map((name) => `/art/2.5d/${name}.webp`),
  ...Array.from({ length: 20 }, (_, stage) =>
    `/art/2.5d/tree-stage-${stage}.webp`
  ),
  ...CANDLE_ANIMATION_NAMES.map(
    (name) => `/art/2.5d/candles/${name}.gif`
  ),
];
const ART_ASSET_PATH_SET = new Set(ART_ASSET_PATHS);

// Keep first-install transfer small while covering the three precached shells.
// The complete catalogue still enters the runtime cache when a screen uses it.
const PRECACHE_ART_PATHS = [
  "candle",
  "crown",
  "dove",
  "key",
  "lantern",
  "map",
  "book-open",
  "scroll",
  "sprout",
  "tree-stage-0",
  "mascot-lamb",
  "mascot-campfire",
].map((name) => `/art/2.5d/${name}.webp`);
PRECACHE_ART_PATHS.push("/art/2.5d/candles/candle.gif");

const PRECACHE_PATHS = [
  "/app",
  "/onboarding",
  "/manifest.webmanifest",
  ...PRECACHE_ART_PATHS,
];

// Keep the last-resort navigation fallback independent from Next.js chunks so
// it still renders when a fresh install loses the network mid-update.
const OFFLINE_DOCUMENT = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#f6f0e2">
    <title>Offline — BibleQuest</title>
    <style>
      :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #f6f0e2; color: #29261f; }
      main { min-height: 100dvh; display: grid; place-content: center; gap: 1rem; padding: 2rem; text-align: center; }
      .mark { color: #9a7427; font: 3rem/1 Georgia, serif; }
      h1 { margin: 0; font: 700 2.25rem/1.1 Georgia, serif; }
      p { max-width: 20rem; margin: 0 auto; color: #625d52; font-size: 1rem; line-height: 1.6; }
      a { justify-self: center; margin-top: .5rem; border: 1px solid #0d614c; border-radius: 999px; padding: .75rem 1.25rem; color: #0d614c; font-weight: 700; text-decoration: none; }
      a:focus-visible { outline: 3px solid #c79a3b; outline-offset: 3px; }
    </style>
  </head>
  <body>
    <main>
      <div class="mark" aria-hidden="true">✦</div>
      <h1>No connection</h1>
      <p>You’re offline. Saved pages and drafts are still here.</p>
      <a href="/app">Return home</a>
    </main>
  </body>
</html>`;
const PUSH_KINDS = new Set([
  "daily_verse",
  "daily_quest",
  "prayer_reminder",
  "weekly_recap",
  "test",
]);
const PUSH_TITLE = "A gentle BibleQuest reminder";
const PUSH_BODY = "A quiet moment is ready whenever you are.";
const PUSH_TARGET = "/app";

// Default-deny navigation policy. Dynamic entries below are limited to known,
// public-content route families; account, billing, auth, and marketing routes
// are intentionally absent.
const OFFLINE_SAFE_NAVIGATION_PATHS = new Set([
  "/app",
  "/onboarding",
  "/app/prayer",
  "/app/prayer/new",
  "/app/prayer/reflections",
  "/app/prayer/reflection/new",
  "/app/journey",
  "/app/quests",
  "/app/bible",
  "/app/bible/saved",
  "/app/settings",
  "/app/guided",
  "/app/guided/daily",
  "/app/pilgrimages",
  "/app/games",
  "/app/rhythm",
]);

const OFFLINE_SAFE_NAVIGATION_PATTERNS = [
  /^\/app\/quests\/[^/]+$/,
  /^\/app\/bible\/[^/]+$/,
  /^\/app\/bible\/[^/]+\/[1-9]\d*$/,
  /^\/app\/pilgrimages\/[^/]+$/,
  /^\/app\/pilgrimages\/[^/]+\/[1-9]\d*$/,
];

function isPathWithin(pathname, root) {
  return pathname === root || pathname.startsWith(`${root}/`);
}

function isForbiddenPath(pathname) {
  return (
    isPathWithin(pathname, "/auth") ||
    isPathWithin(pathname, "/app/account") ||
    isPathWithin(pathname, "/api")
  );
}

/** Limits browser-auth attestation to customer pages on this exact origin. */
function isWebAuthCustomerPath(pathname) {
  return (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/onboarding" ||
    pathname === "/auth/customer-callback"
  );
}

/** Accepts only a same-origin customer window with one opaque client id. */
function isWebAuthCustomerClient(client) {
  if (!client || typeof client.id !== "string" || !client.id) return false;
  try {
    const url = new URL(client.url);
    return (
      url.origin === self.location.origin &&
      isWebAuthCustomerPath(url.pathname)
    );
  } catch {
    return false;
  }
}

function isRequestCacheCandidate(request, url = new URL(request.url)) {
  return (
    request.method === "GET" &&
    url.origin === self.location.origin &&
    url.search === "" &&
    // Bearer-bearing responses are private even if a future route is omitted
    // from the explicit forbidden-path list below.
    !request.headers.has("authorization") &&
    !isForbiddenPath(url.pathname)
  );
}

function isOfflineSafeNavigationPath(pathname) {
  return (
    OFFLINE_SAFE_NAVIGATION_PATHS.has(pathname) ||
    OFFLINE_SAFE_NAVIGATION_PATTERNS.some((pattern) => pattern.test(pathname))
  );
}

function isOfflineSafeNavigationRequest(request, url = new URL(request.url)) {
  return (
    request.mode === "navigate" &&
    isRequestCacheCandidate(request, url) &&
    isOfflineSafeNavigationPath(url.pathname)
  );
}

function isImmutableStaticRequest(request, url = new URL(request.url)) {
  return (
    isRequestCacheCandidate(request, url) &&
    url.pathname.startsWith("/_next/static/")
  );
}

function isArtAssetRequest(request, url = new URL(request.url)) {
  return (
    isRequestCacheCandidate(request, url) &&
    ART_ASSET_PATH_SET.has(url.pathname)
  );
}

function isResponseCacheable(response) {
  if (
    !response ||
    !response.ok ||
    response.redirected ||
    response.type === "opaque" ||
    response.type === "opaqueredirect"
  ) {
    return false;
  }

  const cacheControl = response.headers.get("cache-control") || "";
  if (/\b(?:no-store|private)\b/i.test(cacheControl)) return false;

  // Set-Cookie is a forbidden response header in some browser contexts, so
  // the app also marks every cookie-writing middleware response private/no-store.
  if (response.headers.has("set-cookie")) return false;

  return true;
}

function pushKind(data) {
  try {
    const value = data?.json();
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== "kind,version" ||
      value.version !== 1 ||
      !PUSH_KINDS.has(value.kind)
    ) {
      return null;
    }
    return value.kind;
  } catch {
    return null;
  }
}

function absoluteUrl(pathname) {
  return new URL(pathname, self.location.origin).href;
}

/** Creates a content-free nonce that binds one challenge response. */
function webAuthChallengeNonce() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replaceAll("-", "");
  }
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    ""
  );
}

/** Accepts only the exact response shape emitted by the current page helper. */
function isExactWebAuthChallengeResponse(value, nonce) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === "nonce,type,version" &&
    value.type === WEB_AUTH_SW_CLIENT_RESPONSE &&
    value.version === CACHE_VERSION &&
    value.nonce === nonce
  );
}

/**
 * Challenges one document without returning its URL, id, or failure reason.
 *
 * Resolves "passed", "refused" for a wrong answer, or "silent" when the page
 * never answers. Those last two are different evidence and must not be
 * collapsed: a wrong answer means the page disagrees about the running
 * version, while silence usually means the page is backgrounded or restoring
 * and cannot answer at all.
 */
function challengeWebAuthClient(client) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const nonce = webAuthChallengeNonce();
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      channel.port1.close();
      resolve(outcome);
    };
    const timer = setTimeout(
      () => finish("silent"),
      WEB_AUTH_CHALLENGE_TIMEOUT_MS
    );
    channel.port1.onmessage = (event) => {
      finish(
        isExactWebAuthChallengeResponse(event.data, nonce)
          ? "passed"
          : "refused"
      );
    };
    try {
      // The HTML bfcache reasons include serviceworker-postmessage, so a page
      // can accept this message and never get to answer. Silence is recorded
      // as its own outcome: it neither attests the page nor refuses it.
      client.postMessage(
        {
          type: WEB_AUTH_SW_CLIENT_CHALLENGE,
          version: CACHE_VERSION,
          nonce,
        },
        [channel.port2]
      );
    } catch {
      channel.port2.close();
      finish("refused");
    }
  });
}

/**
 * Proves the requesting window runs the exact current worker protocol and that
 * no other window contradicts it.
 *
 * This does NOT prove every live window is current. The page responder
 * (src/lib/platform/web-auth-service-worker.ts) returns without replying on a
 * version mismatch, so genuine version skew arrives here as "silent", not
 * "refused". A skewed page is denied at the ATTEST boundary below instead,
 * which requires event.data.version === CACHE_VERSION, so it can never
 * complete an account operation of its own; cross-tab writes are separately
 * invalidated by the localStorage private-write generation.
 */
async function auditWebAuthClients(requester) {
  if (
    !isWebAuthCustomerClient(requester) ||
    !attestedWebAuthClients.has(requester.id)
  ) {
    return false;
  }
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const customers = windows.filter(isWebAuthCustomerClient);
  if (!customers.some((client) => client.id === requester.id)) return false;
  const results = await Promise.all(
    customers.map(async (client) => ({
      client,
      outcome: await challengeWebAuthClient(client),
    }))
  );
  // Keep the distinction challengeWebAuthClient draws, exactly as
  // handleAuthorizedFetch already does. Collapsing both into "not passed"
  // meant one backgrounded tab — routine on iOS — failed the audit for every
  // other window, blocking sign-in with nothing the person could act on.
  //
  // A wrong answer is evidence a page disagrees about the running protocol,
  // so it still fails the audit closed. Silence is evidence of nothing: the
  // page accepted the challenge and could not reply. It therefore neither
  // fails the audit nor earns attestation — it is simply not vouched for, and
  // a controlled client's own credentialed request is challenged again at
  // fetch time. An uncontrolled client never reaches the fetch handler, and
  // equally can never attest, so it gains nothing from being skipped either.
  //
  // The requester is live by construction, having just sent this message, so
  // it must still answer for itself before anything is attested.
  const requesterPassed = results.some(
    (result) => result.client.id === requester.id && result.outcome === "passed"
  );
  const anyRefused = results.some((result) => result.outcome === "refused");
  const passed = requesterPassed && !anyRefused;
  if (passed) {
    attestedWebAuthClients.clear();
    for (const result of results) {
      if (result.outcome === "passed") {
        attestedWebAuthClients.add(result.client.id);
      }
    }
  } else {
    for (const result of results) {
      if (result.outcome !== "passed") {
        attestedWebAuthClients.delete(result.client.id);
      }
    }
  }
  return passed;
}

/** Replies with only the current version and one boolean result. */
function replyWebAuthResult(port, ok) {
  try {
    port.postMessage({ type: WEB_AUTH_SW_RESULT, version: CACHE_VERSION, ok });
  } finally {
    port.close();
  }
}

/** Rejects unverified bearer traffic without returning operational detail. */
function webAuthAttestationFailure() {
  return new Response(null, {
    status: 403,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Re-attests a current page after an idle worker restart, then proxies once.
 *
 * iOS restarts service workers aggressively, so on iPhone this re-challenge is
 * the ordinary path rather than a rare one. A page that is backgrounded or
 * mid-restore — returning from another app — accepts the challenge and cannot
 * answer inside the timeout. Treating that silence as a refusal denied sign-in
 * with a 403 the person saw as "You appear to be offline", with no way to
 * recover.
 *
 * Silence is not evidence of an attacker. The client identity check above
 * already proves this is a same-origin customer page, and it comes from the
 * worker's own client registry, which a page cannot forge. Only the running
 * version stays unproven, so a wrong answer is still refused and silence is
 * forwarded without being remembered as attested — the next request
 * challenges again.
 */
async function handleAuthorizedFetch(event) {
  if (!event.clientId) return webAuthAttestationFailure();
  const client = await self.clients.get(event.clientId);
  if (!isWebAuthCustomerClient(client)) return webAuthAttestationFailure();
  if (!attestedWebAuthClients.has(client.id)) {
    const outcome = await challengeWebAuthClient(client);
    if (outcome === "refused") return webAuthAttestationFailure();
    if (outcome === "passed") attestedWebAuthClients.add(client.id);
  }
  return fetch(event.request);
}

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(
    PRECACHE_PATHS.map(async (pathname) => {
      try {
        const request = new Request(absoluteUrl(pathname), {
          cache: "reload",
          credentials: "omit",
        });
        const response = await fetch(request);
        if (isResponseCacheable(response)) {
          await cache.put(request, response.clone());
        }
      } catch {
        // A partial install is still useful. Runtime navigation will retry the
        // network and the fallback below remains honest if precaching failed.
      }
    })
  );
}

function offlineDocumentResponse() {
  return new Response(OFFLINE_DOCUMENT, {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function cachedNavigation(request) {
  const runtime = await caches.open(RUNTIME_CACHE);
  const runtimeMatch = await runtime.match(request);
  if (runtimeMatch) return runtimeMatch;

  const shell = await caches.open(SHELL_CACHE);
  return shell.match(request);
}

async function handleNavigation(request) {
  const url = new URL(request.url);
  const mayCache = isOfflineSafeNavigationRequest(request, url);

  let response;
  try {
    response = await fetch(request);
  } catch {
    if (mayCache) {
      const cached = await cachedNavigation(request);
      if (cached) return cached;
    }
    return offlineDocumentResponse();
  }

  // A resolved 4xx/5xx or redirect is returned as-is. Cache fallback is only
  // for an actual fetch failure, so the worker cannot hide live server errors.
  if (mayCache) {
    try {
      const runtime = await caches.open(RUNTIME_CACHE);
      if (isResponseCacheable(response)) {
        // Query-bearing requests never reach this point, so this exact request
        // key cannot alias a sensitive query to a queryless URL.
        await runtime.put(request, response.clone());
      } else {
        // A live rollback, private response, or route error invalidates any
        // older offline copy instead of leaving a retired feature available.
        await runtime.delete(request);
      }
    } catch {
      // Cache updates are best-effort and must not replace a network reply.
    }
  }

  return response;
}

function staleWhileRevalidate(event, request) {
  const runtime = caches.open(RUNTIME_CACHE);
  const network = runtime.then(async (cache) => {
    const response = await fetch(request);
    if (isResponseCacheable(response)) {
      try {
        await cache.put(request, response.clone());
      } catch {
        // A failed cache write does not change the network result.
      }
    }
    return response;
  });

  // Extend the fetch event synchronously. Calling waitUntil only after an
  // awaited cache lookup can be too late once the event dispatch has ended.
  event.waitUntil(network.then(() => undefined).catch(() => undefined));
  return runtime.then(async (cache) => (await cache.match(request)) || network);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(CACHE_OWNER_PREFIX) &&
                !CURRENT_CACHES.includes(key)
            )
            .map((key) => caches.delete(key))
        )
      )
      // Worker activation and claim are standardized bfcache not-restored
      // reasons; the explicit client audit remains the cross-browser gate.
      .then(() => self.clients.claim())
  );
});

// Answers a fixed version challenge so a controlled page can prove which
// worker is active without exposing its script URL or any client identifier.
self.addEventListener("message", (event) => {
  if (
    event.data?.type === "BIBLEQUEST_SW_VERSION_REQUEST" &&
    event.source &&
    typeof event.source.postMessage === "function"
  ) {
    event.source.postMessage({
      type: "BIBLEQUEST_SW_VERSION_RESPONSE",
      version: CACHE_VERSION,
    });
    return;
  }

  const type = event.data?.type;
  if (
    type !== WEB_AUTH_SW_ATTEST_REQUEST &&
    type !== WEB_AUTH_SW_AUDIT_REQUEST
  ) {
    return;
  }
  if (event.ports.length !== 1) return;
  const port = event.ports[0];
  const source = event.source;
  const exactRequest =
    event.data !== null &&
    typeof event.data === "object" &&
    !Array.isArray(event.data) &&
    Object.keys(event.data).sort().join(",") === "type,version" &&
    event.data.version === CACHE_VERSION;
  if (!exactRequest || !isWebAuthCustomerClient(source)) {
    replyWebAuthResult(port, false);
    return;
  }
  if (type === WEB_AUTH_SW_ATTEST_REQUEST) {
    attestedWebAuthClients.add(source.id);
    replyWebAuthResult(port, true);
    return;
  }
  event.waitUntil(
    auditWebAuthClients(source)
      .then((ok) => replyWebAuthResult(port, ok))
      .catch(() => replyWebAuthResult(port, false))
  );
});

// Payloads carry only a bounded kind. Visible copy and navigation are fixed in
// the worker so no prayer, journal, quest, or Scripture text can reach a lock
// screen even if an upstream scheduler regresses.
self.addEventListener("push", (event) => {
  const kind = pushKind(event.data);
  if (!kind) return;
  event.waitUntil(
    self.registration.showNotification(PUSH_TITLE, {
      body: PUSH_BODY,
      icon: "/icons/icon-192.png",
      badge: "/icons/favicon-48.png",
      tag: `biblequest-reminder-${kind}`,
      renotify: false,
      silent: false,
      data: { target: PUSH_TARGET },
    })
  );
});

// Notification clicks can focus or open only the fixed same-origin app shell.
self.addEventListener("notificationclick", (event) => {
  if (!event.notification?.tag?.startsWith("biblequest-reminder-")) return;
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        for (const client of clients) {
          const url = new URL(client.url);
          if (url.origin !== self.location.origin) continue;
          if (typeof client.navigate === "function") {
            await client.navigate(PUSH_TARGET);
          }
          return client.focus();
        }
        return self.clients.openWindow(PUSH_TARGET);
      })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.headers.has("authorization")) {
    event.respondWith(handleAuthorizedFetch(event));
    return;
  }

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (
    isImmutableStaticRequest(request, url) ||
    isArtAssetRequest(request, url)
  ) {
    event.respondWith(staleWhileRevalidate(event, request));
  }
});

// The production worker never defines this flag. Tests set it before loading
// this exact file so policy predicates and version constants stay deterministic.
if (self.__BIBLEQUEST_SW_TESTING__) {
  self.__BIBLEQUEST_SW_TESTING__ = Object.freeze({
    CACHE_VERSION,
    CACHE_OWNER_PREFIX,
    SHELL_CACHE,
    RUNTIME_CACHE,
    CURRENT_CACHES,
    PRECACHE_PATHS,
    OFFLINE_DOCUMENT,
    ART_ASSET_PATHS,
    PRECACHE_ART_PATHS,
    PUSH_KINDS,
    PUSH_TITLE,
    PUSH_BODY,
    PUSH_TARGET,
    WEB_AUTH_SW_ATTEST_REQUEST,
    WEB_AUTH_SW_AUDIT_REQUEST,
    WEB_AUTH_SW_CLIENT_CHALLENGE,
    WEB_AUTH_SW_CLIENT_RESPONSE,
    WEB_AUTH_SW_RESULT,
    OFFLINE_SAFE_NAVIGATION_PATHS,
    isWebAuthCustomerPath,
    isWebAuthCustomerClient,
    isForbiddenPath,
    isRequestCacheCandidate,
    isOfflineSafeNavigationPath,
    isOfflineSafeNavigationRequest,
    isImmutableStaticRequest,
    isArtAssetRequest,
    isResponseCacheable,
    pushKind,
  });
}
