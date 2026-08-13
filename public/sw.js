/* BibleQuest service worker — offline-friendly without caching private state.
 *
 * Cache Storage contains only a small, explicit navigation surface plus
 * validated build assets. Prayers, reflections, and other user data continue
 * to live in the persisted Zustand store; this worker never handles that data.
 */
const CACHE_VERSION = "biblequest-v27";
const CACHE_OWNER_PREFIX = "biblequest-";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const CURRENT_CACHES = [SHELL_CACHE, RUNTIME_CACHE];

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

function isRequestCacheCandidate(request, url = new URL(request.url)) {
  return (
    request.method === "GET" &&
    url.origin === self.location.origin &&
    url.search === "" &&
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
  }
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
    OFFLINE_SAFE_NAVIGATION_PATHS,
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
