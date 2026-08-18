import fs from "node:fs";
import { webcrypto } from "node:crypto";
import path from "node:path";
import vm from "node:vm";
import { MessageChannel, type MessagePort } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import observability from "../config/observability.json";

const ORIGIN = "https://biblequest.test";
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(TEST_DIR, "..", "public", "sw.js");
const WORKER_SOURCE = fs.readFileSync(WORKER_PATH, "utf8");

type WorkerPolicy = {
  CACHE_VERSION: string;
  SHELL_CACHE: string;
  RUNTIME_CACHE: string;
  PRECACHE_PATHS: string[];
  OFFLINE_DOCUMENT: string;
  ART_ASSET_PATHS: string[];
  PRECACHE_ART_PATHS: string[];
  PUSH_TITLE: string;
  PUSH_BODY: string;
  PUSH_TARGET: string;
  WEB_AUTH_SW_ATTEST_REQUEST: string;
  WEB_AUTH_SW_AUDIT_REQUEST: string;
  WEB_AUTH_SW_CLIENT_CHALLENGE: string;
  WEB_AUTH_SW_CLIENT_RESPONSE: string;
  WEB_AUTH_SW_RESULT: string;
  pushKind: (data: { json: () => unknown } | null) => string | null;
  isWebAuthCustomerPath: (pathname: string) => boolean;
  isWebAuthCustomerClient: (client: WindowClient | null) => boolean;
  isRequestCacheCandidate: (request: Request) => boolean;
  isOfflineSafeNavigationRequest: (request: Request) => boolean;
  isImmutableStaticRequest: (request: Request) => boolean;
  isArtAssetRequest: (request: Request) => boolean;
  isResponseCacheable: (response: Response) => boolean;
};

type WindowClient = {
  id?: string;
  url: string;
  postMessage?: (message: unknown, transfer?: readonly MessagePort[]) => void;
  navigate?: (path: string) => Promise<unknown>;
  focus: () => Promise<unknown>;
};

type WorkerEvent = {
  clientId?: string;
  data?: unknown;
  notification?: {
    tag?: string;
    close: () => void;
  };
  ports?: MessagePort[];
  request?: Request;
  source?: WindowClient | { postMessage: (message: unknown) => void };
  respondWith?: (value: Promise<Response> | Response) => void;
  waitUntil: (value: Promise<unknown>) => void;
};

type WorkerListener = (event: WorkerEvent) => void;

function makeRequest(
  pathname: string,
  options: { headers?: HeadersInit; method?: string; mode?: RequestMode } = {}
) {
  const result = new Request(new URL(pathname, ORIGIN), {
    headers: options.headers,
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

  async delete(input: RequestInfo | URL) {
    return this.entries.delete(this.key(input));
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
  const state = {
    claimed: false,
    skipped: false,
    notifications: [] as Array<{ title: string; options: Record<string, unknown> }>,
    opened: [] as string[],
    matchAllCalls: [] as Array<Record<string, unknown> | undefined>,
    windowClients: [] as WindowClient[],
  };
  const worker = {
    __BIBLEQUEST_SW_TESTING__: true as true | WorkerPolicy,
    location: new URL(`${ORIGIN}/sw.js`),
    registration: {
      async showNotification(
        title: string,
        options: Record<string, unknown>,
      ) {
        state.notifications.push({ title, options });
      },
    },
    clients: {
      async claim() {
        state.claimed = true;
      },
      async get(id: string) {
        return state.windowClients.find((client) => client.id === id);
      },
      async matchAll(options?: Record<string, unknown>) {
        state.matchAllCalls.push(options);
        return state.windowClients;
      },
      async openWindow(pathname: string) {
        state.opened.push(pathname);
        return null;
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
    MessageChannel,
    Uint8Array,
    clearTimeout,
    console,
    crypto: webcrypto,
    setTimeout,
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
  request: Request,
  clientId?: string,
) {
  const pending: Promise<unknown>[] = [];
  let responsePromise: Promise<Response> | undefined;
  const event: WorkerEvent = {
    clientId,
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

/** Creates one bounded v28 client responder for worker challenge tests. */
function webAuthWindowClient(
  harness: ReturnType<typeof loadWorker>,
  id: string,
  pathname: string,
  response: "exact" | "wrong" | "throw" | "silent" = "exact",
): WindowClient {
  return {
    id,
    url: new URL(pathname, ORIGIN).href,
    focus: vi.fn().mockResolvedValue(undefined),
    postMessage(message, transfer) {
      if (response === "throw") throw new Error("challenge unavailable");
      // A page that is backgrounded or mid-restore accepts the message and
      // never gets to answer. iOS does this routinely when someone returns
      // from another app, and it is not an error the page can report.
      if (response === "silent") return;
      const port = transfer?.[0];
      if (!port) return;
      const value = message as { nonce?: unknown };
      port.postMessage({
        type: harness.policy.WEB_AUTH_SW_CLIENT_RESPONSE,
        version:
          response === "exact" ? harness.policy.CACHE_VERSION : "biblequest-v26",
        nonce: value.nonce,
      });
      port.close();
    },
  };
}

/** Dispatches one content-free service-worker protocol request. */
async function dispatchWebAuthMessage(
  harness: ReturnType<typeof loadWorker>,
  source: WindowClient,
  type: string,
) {
  const channel = new MessageChannel();
  const pending: Promise<unknown>[] = [];
  const result = new Promise<unknown>((resolve) => {
    channel.port1.once("message", resolve);
  });
  harness.listeners.get("message")!({
    data: { type, version: harness.policy.CACHE_VERSION },
    ports: [channel.port2],
    source,
    waitUntil(value) {
      pending.push(Promise.resolve(value));
    },
  });
  const value = await result;
  await Promise.all(pending);
  channel.port1.close();
  return value;
}

describe("service-worker cache policy", () => {
  it("allows only the explicit local-first navigation surface", () => {
    const { policy } = loadWorker();
    const allowed = [
      "/app",
      "/onboarding",
      "/app/prayer",
      "/app/prayer/new",
      "/app/prayer/reflections",
      "/app/prayer/reflection/new",
      "/app/journey",
      "/app/quests",
      "/app/quests/love-your-neighbor",
      "/app/bible",
      "/app/bible/saved",
      "/app/bible/john",
      "/app/bible/john/3",
      "/app/settings",
      "/app/guided",
      "/app/guided/daily",
      "/app/pilgrimages",
      "/app/pilgrimages/learning-to-remain",
      "/app/pilgrimages/learning-to-remain/1",
      "/app/games",
      "/app/rhythm",
    ];
    for (const pathname of allowed) {
      expect(
        policy.isOfflineSafeNavigationRequest(makeRequest(pathname)),
        pathname
      ).toBe(true);
    }

    for (const pathname of [
      "/",
      "/about",
      "/app/plus",
      "/app/unknown",
      "/app/games/archive",
      "/app/games/archive/connections-books-rivers-soils",
    ]) {
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
      makeRequest("/app/games?view=archive"),
      makeRequest("/app", {
        headers: { Authorization: "Bearer header.payload.signature" },
      }),
      makeRequest("/app", { method: "POST" }),
      makeRequest("https://example.com/app"),
    ];
    for (const candidate of forbidden) {
      expect(policy.isRequestCacheCandidate(candidate), candidate.url).toBe(
        false
      );
    }
  });

  it("runtime-caches gated Green routes without precaching disabled 404s", () => {
    const { policy } = loadWorker();

    expect(policy.PRECACHE_PATHS).not.toContain("/app/guided");
    expect(policy.PRECACHE_PATHS).not.toContain("/app/pilgrimages");
    expect(policy.PRECACHE_PATHS).not.toContain("/app/games");
    expect(policy.PRECACHE_PATHS).not.toContain("/app/rhythm");
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

  it("caches only the explicit queryless production 2.5D catalogue", () => {
    const { policy } = loadWorker();
    expect(policy.ART_ASSET_PATHS).toHaveLength(64);
    expect(new Set(policy.ART_ASSET_PATHS).size).toBe(64);
    expect(
      policy.isArtAssetRequest(
        makeRequest("/art/2.5d/hands-praying.webp", { mode: "cors" })
      )
    ).toBe(true);
    expect(
      policy.isArtAssetRequest(
        makeRequest("/art/2.5d/tree-stage-19.webp", { mode: "cors" })
      )
    ).toBe(true);
    expect(
      policy.isArtAssetRequest(
        makeRequest("/art/2.5d/candles/candle-halo.gif", { mode: "cors" })
      )
    ).toBe(true);
    expect(
      policy.isArtAssetRequest(
        makeRequest("/art/2.5d/tree-stage-20.webp", { mode: "cors" })
      )
    ).toBe(false);
    expect(
      policy.isArtAssetRequest(
        makeRequest("/art/2.5d/hands-praying.webp?v=2", { mode: "cors" })
      )
    ).toBe(false);
    expect(
      policy.isArtAssetRequest(
        makeRequest("/art/2.5d/private-upload.webp", { mode: "cors" })
      )
    ).toBe(false);
  });

  it("precaches only the art required by the offline, app, and onboarding shells", () => {
    const { policy } = loadWorker();
    expect(policy.PRECACHE_ART_PATHS).toHaveLength(13);
    expect(policy.PRECACHE_ART_PATHS).toContain(
      "/art/2.5d/candles/candle.gif",
    );
    expect(policy.PRECACHE_ART_PATHS).toContain(
      "/art/2.5d/mascot-lamb.webp",
    );
    expect(policy.PRECACHE_ART_PATHS).not.toContain(
      "/art/2.5d/candles/candle-halo.gif",
    );
    expect(policy.PRECACHE_ART_PATHS).not.toContain(
      "/art/2.5d/tree-stage-19.webp",
    );
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

  it("keeps online errors visible and retires their stale offline copy", async () => {
    const harness = loadWorker(async () =>
      makeResponse("server error", { status: 500 })
    );
    const runtime = await harness.caches.open(harness.policy.RUNTIME_CACHE);
    await runtime.put(`${ORIGIN}/app`, makeResponse("stale app"));

    const result = await dispatchFetch(harness, makeRequest("/app"));
    expect(result?.status).toBe(500);
    expect(await result?.text()).toBe("server error");
    expect(await runtime.match(`${ORIGIN}/app`)).toBeUndefined();
  });

  it("uses exact cached navigation before the offline page on fetch failure", async () => {
    const harness = loadWorker(async () => {
      throw new TypeError("offline");
    });
    const runtime = await harness.caches.open(harness.policy.RUNTIME_CACHE);
    await runtime.put(`${ORIGIN}/app/prayer`, makeResponse("cached prayer"));

    const result = await dispatchFetch(harness, makeRequest("/app/prayer"));
    expect(await result?.text()).toBe("cached prayer");
  });

  it("uses a self-contained page for unvisited or forbidden navigation failures", async () => {
    const harness = loadWorker(async () => {
      throw new TypeError("offline");
    });
    // A stale framework-rendered fallback must not override the script-free
    // document because its build chunks may be unreachable during an update.
    const shell = await harness.caches.open(harness.policy.SHELL_CACHE);
    await shell.put(`${ORIGIN}/offline`, makeResponse("stale chunked fallback"));

    for (const pathname of [
      "/app/reflection",
      "/app/account",
      "/app?qa=1",
    ]) {
      const result = await dispatchFetch(harness, makeRequest(pathname));
      const body = await result?.text();
      expect(result?.status, pathname).toBe(503);
      expect(body, pathname).toBe(harness.policy.OFFLINE_DOCUMENT);
      expect(body, pathname).toContain("No connection");
      expect(body, pathname).not.toContain("<script");
      expect(result?.headers.get("cache-control"), pathname).toBe("no-store");
      expect(result?.headers.get("content-security-policy"), pathname).toContain(
        "default-src 'none'",
      );
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

  it("serves cached production art while refreshing it", async () => {
    const artRequest = makeRequest("/art/2.5d/tree-stage-19.webp", {
      mode: "cors",
    });
    const harness = loadWorker(async () => makeResponse("refreshed tree"));
    const runtime = await harness.caches.open(harness.policy.RUNTIME_CACHE);
    await runtime.put(artRequest, makeResponse("offline tree"));

    const result = await dispatchFetch(harness, artRequest);
    expect(await result?.text()).toBe("offline tree");
    expect(await (await runtime.match(artRequest))?.text()).toBe(
      "refreshed tree"
    );
  });
});

describe("service-worker browser-auth attestation", () => {
  it("limits attestation to exact same-origin customer routes", () => {
    const { policy } = loadWorker();
    for (const pathname of [
      "/app",
      "/app/",
      "/app/settings",
      "/onboarding",
      "/auth/customer-callback",
    ]) {
      expect(policy.isWebAuthCustomerPath(pathname), pathname).toBe(true);
    }
    for (const pathname of [
      "/",
      "/auth/callback",
      "/auth/customer-callback/extra",
      "/console",
      "/console/users",
    ]) {
      expect(policy.isWebAuthCustomerPath(pathname), pathname).toBe(false);
    }

    expect(
      policy.isWebAuthCustomerClient({
        id: "customer",
        url: `${ORIGIN}/app`,
        focus: vi.fn(),
      }),
    ).toBe(true);
    expect(
      policy.isWebAuthCustomerClient({
        id: "external",
        url: "https://example.com/app",
        focus: vi.fn(),
      }),
    ).toBe(false);
    expect(
      policy.isWebAuthCustomerClient({
        url: `${ORIGIN}/app`,
        focus: vi.fn(),
      }),
    ).toBe(false);
  });

  it("returns only exact version/pass after every customer window attests", async () => {
    const harness = loadWorker();
    const requester = webAuthWindowClient(harness, "requester", "/app");
    harness.state.windowClients.push(
      requester,
      webAuthWindowClient(harness, "onboarding", "/onboarding"),
      webAuthWindowClient(
        harness,
        "callback",
        "/auth/customer-callback?code=private",
      ),
      webAuthWindowClient(harness, "console", "/console", "throw"),
      webAuthWindowClient(
        harness,
        "external",
        "https://example.com/app",
        "throw",
      ),
    );

    await expect(
      dispatchWebAuthMessage(
        harness,
        requester,
        harness.policy.WEB_AUTH_SW_ATTEST_REQUEST,
      ),
    ).resolves.toEqual({
      type: harness.policy.WEB_AUTH_SW_RESULT,
      version: harness.policy.CACHE_VERSION,
      ok: true,
    });
    const result = await dispatchWebAuthMessage(
      harness,
      requester,
      harness.policy.WEB_AUTH_SW_AUDIT_REQUEST,
    );

    expect(result).toEqual({
      type: harness.policy.WEB_AUTH_SW_RESULT,
      version: harness.policy.CACHE_VERSION,
      ok: true,
    });
    expect(Object.keys(result as object).sort()).toEqual([
      "ok",
      "type",
      "version",
    ]);
    expect(harness.state.matchAllCalls).toContainEqual({
      type: "window",
      includeUncontrolled: true,
    });
  });

  it("fails the all-customer-window audit when any customer is stale", async () => {
    const harness = loadWorker();
    const requester = webAuthWindowClient(harness, "requester", "/app");
    harness.state.windowClients.push(
      requester,
      webAuthWindowClient(harness, "stale", "/app/prayer", "wrong"),
    );
    await dispatchWebAuthMessage(
      harness,
      requester,
      harness.policy.WEB_AUTH_SW_ATTEST_REQUEST,
    );

    await expect(
      dispatchWebAuthMessage(
        harness,
        requester,
        harness.policy.WEB_AUTH_SW_AUDIT_REQUEST,
      ),
    ).resolves.toEqual({
      type: harness.policy.WEB_AUTH_SW_RESULT,
      version: harness.policy.CACHE_VERSION,
      ok: false,
    });
  });

  it("does not let one silent tab block the audit for a live one", async () => {
    // The defect: challengeWebAuthClient distinguishes "silent" from
    // "refused" — its own comment insists they "must not be collapsed" — but
    // auditWebAuthClients collapsed both into passed:false, and every() then
    // failed the whole audit. A second BibleQuest tab suspended by iOS is
    // ordinary, so one frozen tab blocked sign-in for a live one with no
    // message the person could act on.
    const harness = loadWorker();
    const requester = webAuthWindowClient(harness, "requester", "/app");
    harness.state.windowClients.push(
      requester,
      webAuthWindowClient(harness, "backgrounded", "/app/prayer", "silent"),
    );
    await dispatchWebAuthMessage(
      harness,
      requester,
      harness.policy.WEB_AUTH_SW_ATTEST_REQUEST,
    );

    await expect(
      dispatchWebAuthMessage(
        harness,
        requester,
        harness.policy.WEB_AUTH_SW_AUDIT_REQUEST,
      ),
    ).resolves.toEqual({
      type: harness.policy.WEB_AUTH_SW_RESULT,
      version: harness.policy.CACHE_VERSION,
      ok: true,
    });
  });

  it("fails the audit closed when a client answers with a version this worker does not run", async () => {
    // The other half of the asymmetry: a wrong answer is real evidence, so the
    // audit must still fail closed. Note what this fixture does and does not
    // stand for — the shipped responder returns without replying on a version
    // mismatch, so ordinary version skew reaches the worker as SILENT. This
    // case therefore covers a malformed or hostile same-origin answer, not the
    // routine skew of an older tab.
    const harness = loadWorker();
    const requester = webAuthWindowClient(harness, "requester", "/app");
    harness.state.windowClients.push(
      requester,
      webAuthWindowClient(harness, "backgrounded", "/app/prayer", "silent"),
      webAuthWindowClient(harness, "stale", "/app/journal", "wrong"),
    );
    await dispatchWebAuthMessage(
      harness,
      requester,
      harness.policy.WEB_AUTH_SW_ATTEST_REQUEST,
    );

    await expect(
      dispatchWebAuthMessage(
        harness,
        requester,
        harness.policy.WEB_AUTH_SW_AUDIT_REQUEST,
      ),
    ).resolves.toEqual({
      type: harness.policy.WEB_AUTH_SW_RESULT,
      version: harness.policy.CACHE_VERSION,
      ok: false,
    });
  });

  it("fails the audit when the requesting tab cannot answer for itself", async () => {
    // The requester just sent this message, so it is live by construction and
    // must answer its own challenge. Excusing it would attest a page that
    // proved nothing, which is not what the silence allowance is for.
    const harness = loadWorker();
    const requester = webAuthWindowClient(
      harness,
      "requester",
      "/app",
      "silent",
    );
    harness.state.windowClients.push(requester);
    await dispatchWebAuthMessage(
      harness,
      requester,
      harness.policy.WEB_AUTH_SW_ATTEST_REQUEST,
    );

    await expect(
      dispatchWebAuthMessage(
        harness,
        requester,
        harness.policy.WEB_AUTH_SW_AUDIT_REQUEST,
      ),
    ).resolves.toEqual({
      type: harness.policy.WEB_AUTH_SW_RESULT,
      version: harness.policy.CACHE_VERSION,
      ok: false,
    });
  });

  it("grants a silent tab no attestation, so its own traffic is challenged", async () => {
    // Passing the audit must not vouch for a tab that never answered. The
    // silent tab stays unattested and is challenged when it actually makes a
    // credentialed request, which is exactly what handleAuthorizedFetch does.
    const network = vi.fn(async () => makeResponse("protected response"));
    const harness = loadWorker(network);
    const requester = webAuthWindowClient(harness, "requester", "/app");
    const backgrounded = webAuthWindowClient(
      harness,
      "backgrounded",
      "/app/prayer",
      "silent",
    );
    let challenges = 0;
    const silentPostMessage = backgrounded.postMessage!.bind(backgrounded);
    backgrounded.postMessage = (message, transfer) => {
      challenges += 1;
      return silentPostMessage(message, transfer);
    };
    harness.state.windowClients.push(requester, backgrounded);
    await dispatchWebAuthMessage(
      harness,
      requester,
      harness.policy.WEB_AUTH_SW_ATTEST_REQUEST,
    );
    await dispatchWebAuthMessage(
      harness,
      requester,
      harness.policy.WEB_AUTH_SW_AUDIT_REQUEST,
    );
    const afterAudit = challenges;

    await dispatchFetch(
      harness,
      makeRequest("https://provider.example.test/rest/v1/profile", {
        headers: { Authorization: "Bearer header.payload.signature" },
        mode: "cors",
      }),
      backgrounded.id,
    );

    expect(afterAudit).toBeGreaterThan(0);
    expect(
      challenges,
      "an unattested silent tab must be challenged again on its own request",
    ).toBeGreaterThan(afterAudit);
  });

  it("re-attests a v28 customer after restart before forwarding bearer traffic", async () => {
    const network = vi.fn(async () => makeResponse("protected response"));
    const harness = loadWorker(network);
    const customer = webAuthWindowClient(harness, "customer", "/app/settings");
    harness.state.windowClients.push(customer);
    const request = makeRequest("https://provider.example.test/rest/v1/profile", {
      headers: { Authorization: "Bearer header.payload.signature" },
      mode: "cors",
    });

    const result = await dispatchFetch(harness, request, customer.id);

    expect(result?.status).toBe(200);
    expect(await result?.text()).toBe("protected response");
    expect(network).toHaveBeenCalledOnce();
    expect(harness.caches.cacheMap.size).toBe(0);
  });

  it("still forwards bearer traffic when a restoring page cannot answer in time", async () => {
    // The worker re-challenges after an idle restart, and iOS restarts service
    // workers constantly — so on iPhone this is the ordinary path, not a rare
    // one. A page returning from another app accepts the challenge and cannot
    // answer promptly, which denied sign-in with a 403 the person saw as
    // "You appear to be offline". Reported 2026-08-15.
    vi.useFakeTimers();
    try {
      const network = vi.fn(async () => makeResponse("protected response"));
      const harness = loadWorker(network);
      const restoring = webAuthWindowClient(
        harness,
        "restoring",
        "/app",
        "silent",
      );
      harness.state.windowClients.push(restoring);
      const request = makeRequest(
        "https://provider.example.test/auth/v1/otp",
        {
          headers: { Authorization: "Bearer header.payload.signature" },
          mode: "cors",
        },
      );

      const pending = dispatchFetch(harness, request, restoring.id);
      await vi.advanceTimersByTimeAsync(30_000);
      const result = await pending;

      // The client is a genuine same-origin customer page. Silence about its
      // visibility is not evidence of an attacker, and refusing here strands
      // the person with no way to recover except reinstalling.
      expect(result?.status).toBe(200);
      expect(network).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("survives a deploy that bumps the version under an open page", async () => {
    // The worker calls skipWaiting() and clients.claim(), so a new worker takes
    // over pages that are already open. `onWorkerChallenge` returns without
    // answering when the challenge carries a version the page does not
    // recognise, so a version bump reaches the worker as SILENCE, never as a
    // wrong answer.
    //
    // Before the silence fix that read as refusal, which means any
    // version-bumping deploy would have 403'd every credentialed request from
    // an open page until the person reloaded — the "I can't get into my
    // account" report, arriving for everyone at once.
    vi.useFakeTimers();
    try {
      const network = vi.fn(async () => makeResponse("protected response"));
      const harness = loadWorker(network);
      const openPage = webAuthWindowClient(harness, "open-page", "/app", "silent");
      harness.state.windowClients.push(openPage);
      const request = makeRequest("https://provider.example.test/auth/v1/token", {
        headers: { Authorization: "Bearer header.payload.signature" },
        mode: "cors",
      });

      const pending = dispatchFetch(harness, request, openPage.id);
      await vi.advanceTimersByTimeAsync(30_000);

      expect((await pending)?.status).toBe(200);
      expect(network).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("denies bearer traffic from missing, stale, and non-customer clients", async () => {
    const network = vi.fn(async () => makeResponse("must not run"));
    const harness = loadWorker(network);
    harness.state.windowClients.push(
      webAuthWindowClient(harness, "stale", "/app", "wrong"),
      webAuthWindowClient(harness, "console", "/console"),
    );
    const request = makeRequest("https://provider.example.test/rest/v1/profile", {
      headers: { Authorization: "Bearer header.payload.signature" },
      mode: "cors",
    });

    for (const clientId of [undefined, "missing", "stale", "console"]) {
      const result = await dispatchFetch(harness, request, clientId);
      expect(result?.status, String(clientId)).toBe(403);
      expect(result?.headers.get("cache-control"), String(clientId)).toBe(
        "private, no-store",
      );
      expect(await result?.text(), String(clientId)).toBe("");
    }
    expect(network).not.toHaveBeenCalled();
  });
});

describe("service-worker push privacy", () => {
  it("shows fixed neutral copy for only the bounded payload shape", async () => {
    const harness = loadWorker();
    const event = lifecycleEvent();
    harness.listeners.get("push")!({
      data: {
        json: () => ({ version: 1, kind: "prayer_reminder" }),
      },
      waitUntil: event.waitUntil,
    });
    await event.done();

    expect(harness.state.notifications).toEqual([
      {
        title: harness.policy.PUSH_TITLE,
        options: expect.objectContaining({
          body: harness.policy.PUSH_BODY,
          tag: "biblequest-reminder-prayer_reminder",
          data: { target: harness.policy.PUSH_TARGET },
        }),
      },
    ]);
    expect(JSON.stringify(harness.state.notifications)).not.toMatch(
      /journal|prayer text|scripture text|quest detail/i,
    );
  });

  it("ignores malformed, extra-field, and private-content payloads", () => {
    const harness = loadWorker();
    for (const value of [
      null,
      { version: 1, kind: "unknown" },
      { version: 1, kind: "daily_verse", body: "private" },
      { version: 2, kind: "daily_verse" },
    ]) {
      harness.listeners.get("push")!({
        data: { json: () => value },
        waitUntil() {},
      });
    }
    expect(harness.state.notifications).toHaveLength(0);
  });

  it("opens or focuses only the fixed same-origin app target", async () => {
    const harness = loadWorker();
    const close = vi.fn();
    const focus = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn().mockResolvedValue(undefined);
    harness.state.windowClients.push({
      url: `${ORIGIN}/app/prayer?private=ignored`,
      focus,
      navigate,
    });
    const event = lifecycleEvent();
    harness.listeners.get("notificationclick")!({
      notification: {
        tag: "biblequest-reminder-daily_verse",
        close,
      },
      waitUntil: event.waitUntil,
    });
    await event.done();

    expect(close).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/app");
    expect(focus).toHaveBeenCalledOnce();
    expect(harness.state.opened).toEqual([]);
  });
});

describe("service-worker lifecycle and upgrades", () => {
  it("installs the current shell and its core 2.5D art, omitting uncacheable responses", async () => {
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
    expect(harness.policy.CACHE_VERSION).toBe(
      observability.serviceWorkerVersion,
    );
    expect(shell.entries.size).toBe(harness.policy.PRECACHE_PATHS.length - 1);
    expect(await shell.match(`${ORIGIN}/onboarding`)).toBeUndefined();
    expect(await shell.match(`${ORIGIN}/offline`)).toBeUndefined();
    expect(
      await shell.match(`${ORIGIN}/art/2.5d/mascot-lamb.webp`)
    ).toBeDefined();
    expect(
      await shell.match(`${ORIGIN}/art/2.5d/tree-stage-19.webp`)
    ).toBeUndefined();
    expect(harness.state.skipped).toBe(true);
  });

  it("answers the bounded active-worker version challenge", () => {
    const harness = loadWorker();
    const postMessage = vi.fn();
    harness.listeners.get("message")!({
      data: { type: "BIBLEQUEST_SW_VERSION_REQUEST" },
      source: { postMessage },
      waitUntil() {},
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: "BIBLEQUEST_SW_VERSION_RESPONSE",
      version: observability.serviceWorkerVersion,
    });
  });

  it("deletes old and incompatible BibleQuest caches during activation", async () => {
    const harness = loadWorker();
    await harness.caches.open("biblequest-v6-shell");
    await harness.caches.open("biblequest-v6-runtime");
    await harness.caches.open("biblequest-v14-shell");
    await harness.caches.open("biblequest-v14-runtime");
    await harness.caches.open(harness.policy.SHELL_CACHE);
    await harness.caches.open(harness.policy.RUNTIME_CACHE);
    await harness.caches.open("another-app-runtime");

    const event = lifecycleEvent();
    harness.listeners.get("activate")!(event);
    await event.done();

    expect(harness.caches.deleted.sort()).toEqual([
      "biblequest-v14-runtime",
      "biblequest-v14-shell",
      "biblequest-v6-runtime",
      "biblequest-v6-shell",
    ]);
    expect((await harness.caches.keys()).sort()).toEqual([
      "another-app-runtime",
      `${observability.serviceWorkerVersion}-runtime`,
      `${observability.serviceWorkerVersion}-shell`,
    ]);
    expect(harness.state.claimed).toBe(true);
  });
});
