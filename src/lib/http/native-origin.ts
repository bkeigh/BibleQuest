import "server-only";

/**
 * The one place that decides whether a request came from the iOS app.
 *
 * Every origin guard, and the CORS layer, must route through this. Two
 * separately-located checks disagreeing about who a caller is has been the
 * source of real vulnerabilities; a single exported decision cannot drift.
 *
 * The origin VALUE is a source constant, never an environment variable, so no
 * environment setting can widen the allowlist. The env latch is a boolean only,
 * server-only (no NEXT_PUBLIC_, which would be inlined into the client bundle
 * and frozen per build artifact), and fails closed on anything but the exact
 * string "true" — the same shape as `consoleAuthEnabled`.
 */

/**
 * MEASURED on device, not assumed: the Capacitor iOS WebView sends exactly this
 * as its `Origin` on a cross-origin fetch. It is NOT the string "null".
 *
 * Frozen alongside `server.hostname` in capacitor.config.ts. Changing either
 * without the other silently locks the app out of its own API.
 */
export const NATIVE_APP_ORIGIN = "capacitor://localhost";

/**
 * Never compare this through `new URL(...).origin`.
 *
 * `capacitor:` is a non-special scheme, and every non-special scheme serialises
 * to the four-character string "null" — so `new URL("capacitor://localhost")
 * .origin === new URL("foo://bar").origin` is true, as is any
 * `chrome-extension://…`. A URL-derived comparison is therefore a wildcard for
 * every custom scheme a browser or extension can present. Raw string only.
 */
function normalizedOriginHeader(request: Request): string | null {
  const raw = request.headers.get("origin");
  if (!raw) return null;
  // ASCII-lowercase only: a non-special scheme does NOT case-normalise its
  // host through the URL parser, so the raw header is the sole source of truth.
  return raw.trim().toLowerCase();
}

/** True only when the native API allowance is deliberately enabled. */
export function nativeApiOriginEnabled(
  raw = process.env.BIBLEQUEST_NATIVE_API_ORIGIN_ENABLED,
): boolean {
  return raw === "true";
}

/**
 * True when this request presents the reviewed native origin AND the allowance
 * is enabled. Callers must treat a true result as "not a browser same-origin
 * request" — it carries no authentication weight on its own, because any
 * non-browser client can set an Origin header freely. It only widens which
 * origins may proceed to the real authentication check.
 */
export function isNativeAppOrigin(request: Request): boolean {
  if (!nativeApiOriginEnabled()) return false;
  return normalizedOriginHeader(request) === NATIVE_APP_ORIGIN;
}
