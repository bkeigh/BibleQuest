/**
 * Lightweight abuse guard for unauthenticated online-Scripture requests.
 *
 * BibleQuest supports guest reading, so these routes cannot require an account.
 * Fetch Metadata blocks browser hot-linking, while a bounded per-IP window
 * limits scraping/quota exhaustion within each reused serverless instance.
 * Production should still mirror these limits in Vercel Firewall for a
 * deployment-wide counter; this local guard is the fail-closed application
 * layer and also protects development/preview deployments.
 */

interface RateWindow {
  count: number;
  resetAt: number;
}

interface GuardStore {
  windows: Map<string, RateWindow>;
  lastSweepAt: number;
}

export interface ProviderGuardPolicy {
  limit: number;
  windowMs: number;
}

const STORE_KEY = "__biblequestProviderRequestGuard";
const MAX_WINDOWS = 5_000;
const SWEEP_INTERVAL_MS = 60_000;

type GlobalWithGuard = typeof globalThis & {
  __biblequestProviderRequestGuard?: GuardStore;
};

function store(): GuardStore {
  const root = globalThis as GlobalWithGuard;
  root[STORE_KEY] ??= { windows: new Map(), lastSweepAt: 0 };
  return root[STORE_KEY];
}

function noStoreJson(
  body: { error: string },
  init: { status: number; headers?: Record<string, string> },
): Response {
  return Response.json(body, {
    status: init.status,
    headers: {
      "Cache-Control": "private, no-store",
      ...init.headers,
    },
  });
}

function requestIp(request: Request): string {
  // Vercel overwrites x-forwarded-for with the public client IP, preventing a
  // caller from choosing its own bucket. Local/non-Vercel requests share the
  // conservative `unknown` bucket instead of trusting arbitrary headers.
  const onVercel = process.env.VERCEL === "1";
  if (!onVercel) return "unknown";
  return (request.headers.get("x-forwarded-for") ?? "unknown")
    .split(",", 1)[0]
    .trim()
    .slice(0, 128) || "unknown";
}

function sweepExpiredWindows(state: GuardStore, now: number) {
  if (
    state.windows.size < MAX_WINDOWS &&
    now - state.lastSweepAt < SWEEP_INTERVAL_MS
  ) {
    return;
  }
  for (const [key, window] of state.windows) {
    if (window.resetAt <= now) state.windows.delete(key);
  }
  // Bound memory even during a many-IP burst. Map iteration is insertion order,
  // so discard the oldest remaining windows first.
  while (state.windows.size >= MAX_WINDOWS) {
    const oldest = state.windows.keys().next().value as string | undefined;
    if (!oldest) break;
    state.windows.delete(oldest);
  }
  state.lastSweepAt = now;
}

function crossSiteBrowserRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  // App fetches are same-origin even when BibleQuest itself is embedded. Block
  // direct navigations and same-site/cross-site browser callers when the browser
  // supplies Fetch Metadata. Non-browser clients fall through to rate limiting.
  if (fetchSite && fetchSite !== "same-origin") return true;

  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin !== new URL(request.url).origin;
  } catch {
    return true;
  }
}

/** Returns a blocking response, or null when the provider request may proceed. */
export function guardProviderRequest(
  request: Request,
  scope: string,
  policy: ProviderGuardPolicy | readonly ProviderGuardPolicy[],
  now = Date.now(),
): Response | null {
  if (crossSiteBrowserRequest(request)) {
    return noStoreJson({ error: "forbidden" }, { status: 403 });
  }

  return rateLimitProviderRequest(request, scope, policy, now);
}

/**
 * Guards a route whose scope already names the authenticated account.
 *
 * The bucket key deliberately omits the request IP: for a metered paid
 * provider the budget belongs to the account, and mixing the IP in lets one
 * caller reset their own ceiling just by changing networks. Guest routes keep
 * using `guardProviderRequest`, where the IP is the only identity available.
 */
export function guardIdentifiedRequest(
  request: Request,
  scope: string,
  policy: ProviderGuardPolicy | readonly ProviderGuardPolicy[],
  now = Date.now(),
): Response | null {
  if (crossSiteBrowserRequest(request)) {
    return noStoreJson({ error: "forbidden" }, { status: 403 });
  }

  return rateLimitProviderRequest(request, scope, policy, now, false);
}

/**
 * Apply only the bounded per-IP windows. Public Scripture share pages must
 * allow top-level cross-site navigation, so their proxy cannot use the Fetch
 * Metadata rejection that protects same-origin JSON endpoints.
 */
export function rateLimitProviderRequest(
  request: Request,
  scope: string,
  policy: ProviderGuardPolicy | readonly ProviderGuardPolicy[],
  now = Date.now(),
  bucketByIp = true,
): Response | null {
  const state = store();
  sweepExpiredWindows(state, now);
  const ip = bucketByIp ? requestIp(request) : "identified";
  const policies = Array.isArray(policy) ? policy : [policy];
  for (const [index, currentPolicy] of policies.entries()) {
    const key = `${scope}:${index}:${ip}`;
    const current = state.windows.get(key);
    const window =
      current && current.resetAt > now
        ? current
        : { count: 0, resetAt: now + currentPolicy.windowMs };
    window.count += 1;
    state.windows.set(key, window);

    if (window.count > currentPolicy.limit) {
      const retryAfter = Math.max(
        1,
        Math.ceil((window.resetAt - now) / 1_000),
      );
      return noStoreJson(
        { error: "rate_limited" },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        },
      );
    }
  }
  return null;
}
