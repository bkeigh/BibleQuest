/**
 * The Content-Security-Policy for the native (static export) bundle.
 *
 * On web the policy is sent as a response header, built in next.config.ts.
 * A static export has no server, so no header is ever sent and the whole
 * policy would silently vanish from the iOS app — a real regression against
 * the web build. The native bundle therefore carries it in a
 * `<meta http-equiv="Content-Security-Policy">` tag instead.
 *
 * This is deliberately NOT wired into next.config.ts. That file imports
 * nothing from `src/` and does not use the `@/` path alias, so making it
 * depend on this module risks the web build, which must stay byte-identical.
 * `tests/native-csp.test.ts` calls next.config's own `headers()` and compares
 * the two directive sets, which catches drift without the coupling.
 *
 * Two directives from the web policy are intentionally absent:
 *   - `frame-ancestors` cannot be expressed via a meta tag at all.
 *   - `upgrade-insecure-requests` is meaningless for filesystem-served assets.
 * Framing is not a threat for a local bundle, and the WebView's own
 * `limitsNavigationsToAppBoundDomains` governs navigation.
 *
 * The Permissions-Policy header is likewise unavailable. It is replaced by
 * simply not declaring the matching usage-description keys in Info.plist —
 * iOS cannot grant a capability the app never asks for.
 */

export interface NativeCspOrigins {
  /** Supabase Auth + PostgREST. */
  supabaseOrigin?: string;
  /** The reviewed HTTPS origin serving the app's API routes. */
  hostedOrigin?: string;
}

/**
 * `'self'` means `capacitor://localhost` inside the bundle, so every remote
 * origin the app talks to has to be named explicitly — unlike on web, where
 * `'self'` already covers the API.
 */
export function nativeContentSecurityPolicy(
  origins: NativeCspOrigins = {},
): string {
  const connectSrc = [
    "'self'",
    origins.supabaseOrigin ?? "",
    origins.hostedOrigin ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    // Next streams the RSC payload through inline <script> tags. Capacitor's
    // native-bridge.js is served same-origin by the scheme handler, so 'self'
    // already covers the bridge — no gap: or ws: entries (those are Cordova).
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    // Capacitor.convertFileSrc() rewrites file URLs to same-origin paths.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    // The newsletter's third-party iframe is stripped from the native build.
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** Reads the build-time origins the native policy needs. */
export function nativeContentSecurityPolicyFromEnv(): string {
  return nativeContentSecurityPolicy({
    supabaseOrigin: safeOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hostedOrigin: safeOrigin(process.env.NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN),
  });
}

/** Accepts one exact HTTPS origin and drops anything decorated or malformed. */
function safeOrigin(value: string | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      return "";
    }
    return url.origin;
  } catch {
    return "";
  }
}
