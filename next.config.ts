import type { NextConfig } from "next";

/**
 * Security headers (applied to every route via `headers()` below).
 *
 * ONE source of truth: these live here, not in vercel.json, so local `next dev`
 * and Vercel production stay in sync.
 *
 * The Content-Security-Policy is tuned to exactly the external origins the
 * client actually talks to (see the enumerated list in each directive):
 *   - Supabase auth + PostgREST sync → exact configured HTTPS origin
 *   - Plausible Events API       → configured HTTPS origin, when enabled
 *   - Stripe Checkout/Portal → top-level hosted redirects, no CSP source needed
 *   - Tally waitlist widget + iframe → exact HTTPS origin during pre-launch
 *   - Fonts (Fraunces, Inter via next/font; Ithaca local) → self (all self-hosted)
 *   - Icons / OG image / next/image (local) → self
 *   - Avatars (URL.createObjectURL) → blob:; noise SVG background → data:
 *   - Service worker (/sw.js) + web manifest → self
 */
const isProduction = process.env.NODE_ENV === "production";

// Next.js App Router streams the RSC payload through inline <script> tags and
// injects inline <style> (next/font, Tailwind, framer-motion) — both need
// 'unsafe-inline' unless we wire nonces through the request proxy (future hardening).
// 'unsafe-eval' is added ONLY in dev for React Fast Refresh; prod stays strict.
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  "https://tally.so",
  !isProduction ? "'unsafe-eval'" : "",
]
  .filter(Boolean)
  .join(" ");

function analyticsConnectOrigin(): string {
  if (process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "true") return "";
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (
    !domain ||
    domain !== domain.trim() ||
    domain.length > 253 ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(domain) ||
    domain.includes("..")
  ) {
    return "";
  }
  try {
    const host = new URL(
      process.env.NEXT_PUBLIC_PLAUSIBLE_HOST || "https://plausible.io"
    );
    if (
      host.protocol !== "https:" ||
      host.username ||
      host.password ||
      host.search ||
      host.hash ||
      (host.pathname !== "/" && host.pathname !== "")
    ) {
      return "";
    }
    return host.origin;
  } catch {
    return "";
  }
}

const plausibleOrigin = analyticsConnectOrigin();

function supabaseConnectOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured) return "";

  try {
    const url = new URL(configured);
    const localDevelopmentOrigin =
      !isProduction &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !localDevelopmentOrigin) ||
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

const supabaseOrigin = supabaseConnectOrigin();

const connectSrc = [
  "'self'", // same-origin API routes, RSC/data fetches, analytics no-op
  supabaseOrigin, // exact configured Supabase Auth + PostgREST origin
  plausibleOrigin, // one direct Plausible Events API transport, if configured
  !isProduction ? "ws://localhost:*" : "", // HMR socket in `next dev`
]
  .filter(Boolean)
  .join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'", // next/font + Tailwind + framer-motion inline styles
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src ${connectSrc}`,
  "frame-src 'self' https://tally.so",
  "worker-src 'self' blob:", // service worker + any blob workers
  "manifest-src 'self'", // /manifest.webmanifest
  "media-src 'self' blob:",
  "object-src 'none'", // no <object>/<embed>/<applet>
  "base-uri 'self'", // lock <base> to same origin
  "form-action 'self'", // forms may only submit to same origin
  // Keep framing locked down to BibleQuest itself and Winterhill's two canonical
  // hostnames so the studio portfolio can offer an interactive project preview.
  "frame-ancestors 'self' https://winterhill.studio https://www.winterhill.studio",
  isProduction ? "upgrade-insecure-requests" : "",
]
  .filter(Boolean)
  .join("; ");

// Disable powerful features the app never uses. Hosted Stripe pages run under
// Stripe's own origin and never need Payment Request access on BibleQuest.
const permissionsPolicy = [
  "accelerometer=()",
  // Silent, same-origin wallpaper loops may autoplay; audio remains absent.
  "autoplay=(self)",
  "browsing-topics=()",
  "camera=()",
  "display-capture=()",
  "encrypted-media=()",
  "geolocation=()",
  "gyroscope=()",
  "interest-cohort=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "usb=()",
  "payment=()",
].join(", ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  ...(isProduction
    ? [
        {
          // Six months is meaningful transport pinning without committing
          // unaudited subdomains or the registrable domain to preload.
          key: "Strict-Transport-Security",
          value: "max-age=15552000",
        },
      ]
    : []),
  // CSP frame-ancestors above provides the allowlist. X-Frame-Options cannot
  // express multiple approved origins and would override the portfolio embed.
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: permissionsPolicy },
];

const privateNoStoreHeader = {
  key: "Cache-Control",
  value: "private, no-store",
};

const nextConfig: NextConfig = {
  // Avoid exposing framework identity on every response.
  poweredByHeader: false,
  // This repository can sit beneath unrelated lockfiles on a workstation.
  // Pin Turbopack to the actual app root so dev tracing and diagnostics do not
  // silently widen to a parent directory.
  turbopack: { root: process.cwd() },
  // Live header tests use an isolated dev output directory so they never stop
  // or overwrite a developer's existing `next dev` process in this checkout.
  ...(process.env.BIBLEQUEST_HEADER_TEST_DIST_DIR
    ? { distDir: process.env.BIBLEQUEST_HEADER_TEST_DIST_DIR }
    : {}),
  // Keep the World English Bible JSON available to the server chapter loader
  // in production without bundling any of it into client code.
  outputFileTracingIncludes: {
    "/app/bible/**": ["./src/data/bible/**"],
    "/verse/**": ["./src/data/bible/**"],
  },
  async headers() {
    return [
      {
        // Let browsers revalidate the worker on every visit. Cache Storage has
        // a separate explicit version lifecycle in public/sw.js.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Posters and the one selected loop may use the HTTP cache, while the
        // service worker deliberately avoids storing large range responses.
        source: "/wallpapers/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/auth/:path*",
        headers: [privateNoStoreHeader],
      },
      {
        source: "/app/account",
        headers: [privateNoStoreHeader],
      },
      {
        source: "/api/:path*",
        headers: [privateNoStoreHeader],
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
