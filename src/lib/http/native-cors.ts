import "server-only";

import { isNativeAppOrigin, NATIVE_APP_ORIGIN } from "./native-origin";

/**
 * CORS decoration for the one reviewed native origin.
 *
 * Decoration, deliberately: the 403s in `hasSameOrigin` and the provider
 * request guard remain the enforcement boundary, and both already consult
 * `isNativeAppOrigin` — as does this layer, so the two can never disagree
 * about who a caller is. The dangerous CORS failure is not "browser blocks
 * the response"; it is "route accepts, mutation commits, browser discards
 * the response", which only the guards prevent.
 *
 * Every header value here is a source constant. The allowed origin is the
 * frozen `NATIVE_APP_ORIGIN` — never the request's own Origin header — so no
 * reflection path exists and no http(s) origin can ever be allowlisted.
 *
 * There is NO Access-Control-Allow-Credentials, permanently. Cookies are
 * measurably never sent cross-site from the WebView, so it would buy nothing —
 * and `capacitor://localhost` is the default origin of EVERY Capacitor iOS
 * app, so granting credentials here would extend a credentialed read to any
 * third-party WebView presenting it. Bearer-only, enforced a second time by
 * the browser.
 */

/**
 * `/api/billing/plans` sets `Cache-Control: public, max-age=300` — the one
 * shared-cacheable API response — while `next.config.ts` blankets `/api/:path*`
 * with `private, no-store`. Which one a given cache honors is unresolved, and
 * stamping CORS on a possibly shared-cacheable response is a poisoning hazard,
 * so the route is excluded rather than guessed about.
 */
const EXCLUDED_API_PATH = "/api/billing/plans";

const EXPOSED_RESPONSE_HEADERS =
  "X-BibleQuest-Avatar-Version, X-BibleQuest-Avatar-Updated-At";

/** True for API paths the native CORS decoration may touch. */
export function corsEligibleApiPath(pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return false;
  // Collapse duplicate and trailing slashes before comparing, so the
  // exclusion cannot be sidestepped by a spelling the router would normalize
  // (every collapsed spelling 308s or 404s and never serves the plans
  // payload; excluding them anyway keeps the comparison independent of
  // router behavior).
  const normalized = pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return normalized !== EXCLUDED_API_PATH;
}

function eligibleNativeRequest(request: Request): boolean {
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return false;
  }
  if (!corsEligibleApiPath(pathname)) return false;
  return isNativeAppOrigin(request);
}

/**
 * Answers a native preflight before routing. Next's automatic OPTIONS already
 * served every /api preflight unauthenticated and unmetered, so answering
 * early changes cost, not exposure — and a preflight carries no cookies, so
 * skipping the session refresh loses nothing.
 */
export function nativeCorsPreflightResponse(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  if (!eligibleNativeRequest(request)) return null;
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": NATIVE_APP_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
      // Set explicitly rather than trusting the next.config /api/:path* rule
      // to reach a proxy-produced response.
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * Decorates an actual response for the native origin. The avatar client reads
 * two custom response headers that cross-origin JavaScript cannot see unless
 * they are exposed here.
 */
export function applyNativeCorsHeaders(
  request: Request,
  response: Response,
): void {
  if (!eligibleNativeRequest(request)) return;
  response.headers.set("Access-Control-Allow-Origin", NATIVE_APP_ORIGIN);
  response.headers.set(
    "Access-Control-Expose-Headers",
    EXPOSED_RESPONSE_HEADERS,
  );
  const vary = response.headers.get("vary");
  if (!vary) {
    response.headers.set("Vary", "Origin");
  } else if (
    !vary
      .split(",")
      .some((value) => value.trim().toLowerCase() === "origin")
  ) {
    response.headers.append("Vary", "Origin");
  }
}
