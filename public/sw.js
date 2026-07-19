/* BibleQuest service worker — offline-friendly without caching private state.
 *
 * Cache Storage contains only a small, explicit navigation surface plus
 * validated build assets. Prayers, reflections, and other user data continue
 * to live in the persisted Zustand store; this worker never handles that data.
 */
const CACHE_VERSION = "biblequest-v11";
const CACHE_OWNER_PREFIX = "biblequest-";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const CURRENT_CACHES = [SHELL_CACHE, RUNTIME_CACHE];

// These are generic, client-rendered shells. Fetch without credentials during
// install so an authenticated response can never become a shared offline shell.
const PIXEL_ASSET_NAMES = [
  "candle",
  "leaf",
  "star",
  "bird",
  "flower",
  "chapel",
  "book",
  "open-book",
  "bookmark",
  "lantern",
  "path",
  "tree",
  "sun",
  "heart",
  "hands",
  "praying-hands",
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
  "candle-unlit",
  "candle-small",
  "candle-steady",
  "candle-sparks",
  "candle-halo",
  "mascot-lamb",
  "mascot-lantern",
  "mascot-scroll",
  "mascot-dove",
  "mascot-sprout",
  "mascot-key",
  "mascot-map",
  "mascot-campfire",
];

const PIXEL_ASSET_PATHS = [
  ...PIXEL_ASSET_NAMES.map((name) => `/pixel/${name}.png`),
  ...Array.from({ length: 20 }, (_, stage) =>
    `/pixel/tree-stage-${stage}.png`
  ),
];
const PIXEL_ASSET_PATH_SET = new Set(PIXEL_ASSET_PATHS);

const PRECACHE_PATHS = [
  "/offline",
  "/app",
  "/onboarding",
  "/manifest.webmanifest",
  ...PIXEL_ASSET_PATHS,
];

const OFFLINE_PATH = "/offline";

// Default-deny navigation policy. Dynamic entries below are limited to known,
// public-content route families; account, billing, auth, and marketing routes
// are intentionally absent.
const OFFLINE_SAFE_NAVIGATION_PATHS = new Set([
  "/app",
  "/onboarding",
  "/app/prayer",
  "/app/prayer/new",
  "/app/reflection",
  "/app/reflection/new",
  "/app/journey",
  "/app/quests",
  "/app/bible",
  "/app/bible/saved",
  "/app/settings",
]);

const OFFLINE_SAFE_NAVIGATION_PATTERNS = [
  /^\/app\/quests\/[^/]+$/,
  /^\/app\/bible\/[^/]+$/,
  /^\/app\/bible\/[^/]+\/[1-9]\d*$/,
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

function isPixelAssetRequest(request, url = new URL(request.url)) {
  return (
    isRequestCacheCandidate(request, url) &&
    PIXEL_ASSET_PATH_SET.has(url.pathname)
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

async function cachedOfflineResponse() {
  const shell = await caches.open(SHELL_CACHE);
  const cached = await shell.match(absoluteUrl(OFFLINE_PATH));
  return (
    cached ||
    new Response("BibleQuest is offline.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  );
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
    return cachedOfflineResponse();
  }

  // A resolved 4xx/5xx or redirect is returned as-is. Cache fallback is only
  // for an actual fetch failure, so the worker cannot hide live server errors.
  if (mayCache && isResponseCacheable(response)) {
    try {
      const runtime = await caches.open(RUNTIME_CACHE);
      // Query-bearing requests never reach this point, so this exact request
      // key cannot alias a sensitive query to a queryless URL.
      await runtime.put(request, response.clone());
    } catch {
      // Cache writes are best-effort and must not replace a valid network reply.
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
    isPixelAssetRequest(request, url)
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
    PIXEL_ASSET_PATHS,
    OFFLINE_SAFE_NAVIGATION_PATHS,
    isForbiddenPath,
    isRequestCacheCandidate,
    isOfflineSafeNavigationPath,
    isOfflineSafeNavigationRequest,
    isImmutableStaticRequest,
    isPixelAssetRequest,
    isResponseCacheable,
  });
}
