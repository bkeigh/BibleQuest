import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://biblequest.test";
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(TEST_DIR, "..", "public", "sw.js");
const WORKER_SOURCE = fs.readFileSync(WORKER_PATH, "utf8");

type WorkerPolicy = {
  CACHE_VERSION: string;
  SHELL_CACHE: string;
  RUNTIME_CACHE: string;
  PRECACHE_PATHS: string[];
  PIXEL_ASSET_PATHS: string[];
  isRequestCacheCandidate: (request: Request) => boolean;
  isOfflineSafeNavigationRequest: (request: Request) => boolean;
  isImmutableStaticRequest: (request: Request) => boolean;
  isPixelAssetRequest: (request: Request) => boolean;
  isResponseCacheable: (response: Response) => boolean;
};

type WorkerEvent = {
  request?: Request;
  respondWith?: (value: Promise<Response> | Response) => void;
  waitUntil: (value: Promise<unknown>) => void;
};

type WorkerListener = (event: WorkerEvent) => void;

function makeRequest(
  pathname: string,
  options: { method?: string; mode?: RequestMode } = {}
) {
  const result = new Request(new URL(pathname, ORIGIN), {
    method: options.method ?? "GET",
  });
  Object.defineProperty(result, "mode", {
    configurable: true,
    value: options.mode ?? "navigate",
  });
  return result;
}

function makeResponse(
  body: string,
  options: {
    status?: number;
    headers?: HeadersInit;
    redirected?: boolean;
    type?: ResponseType;
  } = {}
) {
  const result = new Response(body, {
    status: options.status ?? 200,
    headers: options.headers,
  });
  if (options.redirected) {
    Object.defineProperty(result, "redirected", { value: true });
  }
  if (options.type) {
    Object.defineProperty(result, "type", { value: options.type });
  }
  return result;
}

class MemoryCache {
  readonly entries = new Map<string, Response>();

  private key(input: RequestInfo | URL) {
    const value =
      typeof input === "string" || input instanceof URL ? input : input.url;
    return new URL(value, ORIGIN).href;
  }

  async match(input: RequestInfo | URL) {
    const value = this.entries.get(this.key(input));
    return value?.clone();
  }

  async put(input: RequestInfo | URL, value: Response) {
    this.entries.set(this.key(input), value.clone());
  }
}

class MemoryCacheStorage {
  readonly cacheMap = new Map<string, MemoryCache>();
  readonly deleted: string[] = [];

  async open(name: string) {
    if (!this.cacheMap.has(name)) this.cacheMap.set(name, new MemoryCache());
    return this.cacheMap.get(name)!;
  }

  async keys() {
    return [...this.cacheMap.keys()];
  }

  async delete(name: string) {
    this.deleted.push(name);
    return this.cacheMap.delete(name);
  }
}

function loadWorker(
  fetchImplementation: (request: Request) => Promise<Response> = async () =>
    makeResponse("network")
) {
  const listeners = new Map<string, WorkerListener>();
  const cacheStorage = new MemoryCacheStorage();
  const state = { claimed: false, skipped: false };
  const worker = {
    __BIBLEQUEST_SW_TESTING__: true as true | WorkerPolicy,
    location: new URL(`${ORIGIN}/sw.js`),
    clients: {
      async claim() {
        state.claimed = true;
      },
    },
    async skipWaiting() {
      state.skipped = true;
    },
    addEventListener(type: string, listener: WorkerListener) {
      listeners.set(type, listener);
    },
  };

  const context = vm.createContext({
    self: worker,
    caches: cacheStorage,
    fetch: fetchImplementation,
    Request,
    Response,
    URL,
    console,
  });
  vm.runInContext(WORKER_SOURCE, context, { filename: WORKER_PATH });

  return {
    caches: cacheStorage,
    listeners,
    policy: worker.__BIBLEQUEST_SW_TESTING__ as WorkerPolicy,
    state,
  };
}

function lifecycleEvent() {
  const promises: Promise<unknown>[] = [];
  return {
    waitUntil(value: Promise<unknown>) {
      promises.push(Promise.resolve(value));
    },
    async done() {
      await Promise.all(promises);
    },
  };
}

async function dispatchFetch(
  harness: ReturnType<typeof loadWorker>,
  request: Request
) {
  const pending: Promise<unknown>[] = [];
  let responsePromise: Promise<Response> | undefined;
  const event: WorkerEvent = {
    request,
    respondWith(value) {
      responsePromise = Promise.resolve(value);
    },
    waitUntil(value) {
      pending.push(Promise.resolve(value));
    },
  };
  harness.listeners.get("fetch")!(event);
  const result = responsePromise ? await responsePromise : undefined;
  await Promise.all(pending);
  return result;
}

describe("service-worker cache policy", () => {
  it("allows only the explicit local-first navigation surface", () => {
    const { policy } = loadWorker();
    const allowed = [
      "/app",
      "/onboarding",
      "/app/prayer",
      "/app/prayer/new",
      "/app/reflection",
      "/app/reflection/new",
      "/app/journey",
      "/app/quests",
      "/app/quests/love-your-neighbor",
      "/app/bible",
      "/app/bible/saved",
      "/app/bible/john",
      "/app/bible/john/3",
      "/app/settings",
    ];
    for (const pathname of allowed) {
      expect(
        policy.isOfflineSafeNavigationRequest(makeRequest(pathname)),
        pathname
      ).toBe(true);
    }

    for (const pathname of ["/", "/about", "/app/plus", "/app/unknown"]) {
      expect(
        policy.isOfflineSafeNavigationRequest(makeRequest(pathname)),
        pathname
      ).toBe(false);
    }
  });

  it("rejects auth, account, API, query, non-GET, and cross-origin requests", () => {
    const { policy } = loadWorker();
    const forbidden = [
      makeRequest("/auth/callback"),
      makeRequest("/auth/callback?code=secret"),
      makeRequest("/app/account"),
      makeRequest("/app/account/security"),
      makeRequest("/api/health"),
      makeRequest("/app?qa=1"),
      makeRequest("/app", { method: "POST" }),
      makeRequest("https://example.com/app"),
    ];
    for (const candidate of forbidden) {
      expect(policy.isRequestCacheCandidate(candidate), candidate.url).toBe(
        false
      );
    }
  });

  it("uses static caching only for queryless same-origin hashed build assets", () => {
    const { policy } = loadWorker();
    expect(
      policy.isImmutableStaticRequest(
        makeRequest("/_next/static/chunks/app-abc123.js", { mode: "cors" })
      )
    ).toBe(true);
    expect(
      policy.isImmutableStaticRequest(
        makeRequest("/_next/static/chunks/app-abc123.js?v=2", { mode: "cors" })
      )
    ).toBe(false);
    expect(
      policy.isImmutableStaticRequest(makeRequest("/sw.js", { mode: "cors" }))
    ).toBe(false);
    expect(
      policy.isImmutableStaticRequest(
        makeRequest("/uploads/private.jpg", { mode: "cors" })
      )
    ).toBe(false);
  });

  it("caches only the explicit queryless production sprite catalogue", () => {
    const { policy } = loadWorker();
    expect(policy.PIXEL_ASSET_PATHS).toHaveLength(63);
    expect(new Set(policy.PIXEL_ASSET_PATHS).size).toBe(63);
    expect(
      policy.isPixelAssetRequest(
        makeRequest("/pixel/praying-hands.png", { mode: "cors" })
      )
    ).toBe(true);
    expect(
      policy.isPixelAssetRequest(
        makeRequest("/pixel/tree-stage-19.png", { mode: "cors" })
      )
    ).toBe(true);
    expect(
      policy.isPixelAssetRequest(
        makeRequest("/pixel/tree-stage-20.png", { mode: "cors" })
      )
    ).toBe(false);
    expect(
      policy.isPixelAssetRequest(
        makeRequest("/pixel/praying-hands.png?v=2", { mode: "cors" })
      )
    ).toBe(false);
    expect(
      policy.isPixelAssetRequest(
        makeRequest("/pixel/private-upload.png", { mode: "cors" })
      )
    ).toBe(false);
  });

  it("rejects redirects, errors, opaque, private, no-store, and Set-Cookie responses", () => {
    const { policy } = loadWorker();
    expect(policy.isResponseCacheable(makeResponse("ok"))).toBe(true);
    expect(
      policy.isResponseCacheable(
        makeResponse("redirected", { redirected: true })
      )
    ).toBe(false);
    expect(
      policy.isResponseCacheable(makeResponse("missing", { status: 404 }))
    ).toBe(false);
    expect(
      policy.isResponseCacheable(makeResponse("error", { status: 500 }))
    ).toBe(false);
    expect(
      policy.isResponseCacheable(makeResponse("opaque", { type: "opaque" }))
    ).toBe(false);
    expect(
      policy.isResponseCacheable(
        makeResponse("private", {
          headers: { "Cache-Control": "private, max-age=60" },
        })
      )
    ).toBe(false);
    expect(
      policy.isResponseCacheable(
        makeResponse("no store", {
          headers: { "Cache-Control": "no-store" },
        })
      )
    ).toBe(false);
    expect(
      policy.isResponseCacheable(
        makeResponse("cookie", {
          headers: { "Set-Cookie": "session=secret" },
        })
      )
    ).toBe(false);
  });
});

describe("service-worker fetch behavior", () => {
  it("caches allowed successful navigation under its exact key", async () => {
    const harness = loadWorker(async () => makeResponse("fresh app"));
    const result = await dispatchFetch(harness, makeRequest("/app/prayer"));
    expect(await result?.text()).toBe("fresh app");

    const runtime = await harness.caches.open(harness.policy.RUNTIME_CACHE);
    expect(await (await runtime.match(`${ORIGIN}/app/prayer`))?.text()).toBe(
      "fresh app"
    );
    expect(await runtime.match(`${ORIGIN}/app/prayer?view=all`)).toBeUndefined();
  });

  it("fetches forbidden navigation but never caches it", async () => {
    const harness = loadWorker(async () => makeResponse("account"));
    const result = await dispatchFetch(harness, makeRequest("/app/account"));
    expect(await result?.text()).toBe("account");
    const runtime = await harness.caches.open(harness.policy.RUNTIME_CACHE);
    expect(runtime.entries.size).toBe(0);
  });

  it("keeps online navigation errors visible instead of falling back", async () => {
    const harness = loadWorker(async () =>
      makeResponse("server error", { status: 500 })
    );
    const runtime = await harness.caches.open(harness.policy.RUNTIME_CACHE);
    await runtime.put(`${ORIGIN}/app`, makeResponse("stale app"));

    const result = await dispatchFetch(harness, makeRequest("/app"));
    expect(result?.status).toBe(500);
    expect(await result?.text()).toBe("server error");
    expect(await (await runtime.match(`${ORIGIN}/app`))?.text()).toBe(
      "stale app"
    );
  });

  it("uses exact cached navigation before the offline page on fetch failure", async () => {
    const harness = loadWorker(async () => {
      throw new TypeError("offline");
    });
    const runtime = await harness.caches.open(harness.policy.RUNTIME_CACHE);
    const shell = await harness.caches.open(harness.policy.SHELL_CACHE);
    await runtime.put(`${ORIGIN}/app/prayer`, makeResponse("cached prayer"));
    await shell.put(`${ORIGIN}/offline`, makeResponse("offline fallback"));

    const result = await dispatchFetch(harness, makeRequest("/app/prayer"));
    expect(await result?.text()).toBe("cached prayer");
  });

  it("uses the offline page for unvisited or forbidden navigation failures", async () => {
    const harness = loadWorker(async () => {
      throw new TypeError("offline");
    });
    const shell = await harness.caches.open(harness.policy.SHELL_CACHE);
    await shell.put(`${ORIGIN}/offline`, makeResponse("offline fallback"));

    for (const pathname of [
      "/app/reflection",
      "/app/account",
      "/app?qa=1",
    ]) {
      const result = await dispatchFetch(harness, makeRequest(pathname));
      expect(await result?.text(), pathname).toBe("offline fallback");
    }
  });

  it("stale-while-revalidates assets only after response validation", async () => {
    let networkResponse = makeResponse("new asset");
    const harness = loadWorker(async () => networkResponse);
    const assetRequest = makeRequest("/_next/static/chunks/app-abc123.js", {
      mode: "cors",
    });
    const runtime = await harness.caches.open(harness.policy.RUNTIME_CACHE);
    await runtime.put(assetRequest, makeResponse("old asset"));

    const stale = await dispatchFetch(harness, assetRequest);
    expect(await stale?.text()).toBe("old asset");
    expect(await (await runtime.match(assetRequest))?.text()).toBe("new asset");

    networkResponse = makeResponse("do not cache", {
      headers: { "Cache-Control": "private" },
    });
    await dispatchFetch(harness, assetRequest);
    expect(await (await runtime.match(assetRequest))?.text()).toBe("new asset");
  });

  it("serves a cached production sprite while refreshing it", async () => {
    const pixelRequest = makeRequest("/pixel/tree-stage-19.png", {
      mode: "cors",
    });
    const harness = loadWorker(async () => makeResponse("refreshed tree"));
    const runtime = await harness.caches.open(harness.policy.RUNTIME_CACHE);
    await runtime.put(pixelRequest, makeResponse("offline tree"));

    const result = await dispatchFetch(harness, pixelRequest);
    expect(await result?.text()).toBe("offline tree");
    expect(await (await runtime.match(pixelRequest))?.text()).toBe(
      "refreshed tree"
    );
  });
});

describe("service-worker lifecycle and upgrades", () => {
  it("installs the v9 shell and production sprite catalogue, omitting uncacheable responses", async () => {
    const harness = loadWorker(async (fetchRequest) => {
      if (fetchRequest.url.endsWith("/onboarding")) {
        return makeResponse("private", {
          headers: { "Cache-Control": "private" },
        });
      }
      return makeResponse(fetchRequest.url);
    });
    const event = lifecycleEvent();
    harness.listeners.get("install")!(event);
    await event.done();

    const shell = await harness.caches.open(harness.policy.SHELL_CACHE);
    expect(harness.policy.CACHE_VERSION).toBe("biblequest-v11");
    expect(shell.entries.size).toBe(harness.policy.PRECACHE_PATHS.length - 1);
    expect(await shell.match(`${ORIGIN}/onboarding`)).toBeUndefined();
    expect(
      await shell.match(`${ORIGIN}/pixel/tree-stage-19.png`)
    ).toBeDefined();
    expect(harness.state.skipped).toBe(true);
  });

  it("deletes only obsolete BibleQuest caches during v9 activation", async () => {
    const harness = loadWorker();
    await harness.caches.open("biblequest-v6-shell");
    await harness.caches.open("biblequest-v6-runtime");
    await harness.caches.open(harness.policy.SHELL_CACHE);
    await harness.caches.open(harness.policy.RUNTIME_CACHE);
    await harness.caches.open("another-app-runtime");

    const event = lifecycleEvent();
    harness.listeners.get("activate")!(event);
    await event.done();

    expect(harness.caches.deleted.sort()).toEqual([
      "biblequest-v6-runtime",
      "biblequest-v6-shell",
    ]);
    expect((await harness.caches.keys()).sort()).toEqual([
      "another-app-runtime",
      "biblequest-v11-runtime",
      "biblequest-v11-shell",
    ]);
    expect(harness.state.claimed).toBe(true);
  });
});
