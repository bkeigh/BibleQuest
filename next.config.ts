import type { NextConfig } from "next";

/**
 * Security headers (applied to every route via `headers()` below).
 *
 * ONE source of truth: these live here, not in vercel.json, so local `next dev`
 * and Vercel production stay in sync.
 *
 * The Content-Security-Policy is tuned to exactly the external origins the
 * client actually talks to (see the enumerated list in each directive):
 *   - Supabase auth + realtime  → https://*.supabase.co  wss://*.supabase.co
 *   - Plausible Events API       → https://plausible.io
 *   - RevenueCat Web Billing SDK → https://*.revenuecat.com (+ api.rc-backup.com)
 *   - Stripe (wrapped by RevenueCat Web Billing) → js.stripe.com / api.stripe.com
 *   - Fonts (Fraunces, Inter via next/font; Ithaca local) → self (all self-hosted)
 *   - Icons / OG image / next/image (local) → self
 *   - Avatars (URL.createObjectURL) → blob:; noise SVG background → data:
 *   - Service worker (/sw.js) + web manifest → self
 */
const isDev = process.env.NODE_ENV !== "production";

// Next.js App Router streams the RSC payload through inline <script> tags and
// injects inline <style> (next/font, Tailwind, framer-motion) — both need
// 'unsafe-inline' unless we wire nonces through middleware (future hardening).
// 'unsafe-eval' is added ONLY in dev for React Fast Refresh; prod stays strict.
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  "https://js.stripe.com", // Stripe.js, loaded by the RevenueCat Web Billing checkout
  isDev ? "'unsafe-eval'" : "",
]
  .filter(Boolean)
  .join(" ");

const connectSrc = [
  "'self'", // same-origin API routes, RSC/data fetches, analytics no-op
  "https://*.supabase.co", // Supabase auth (REST) + storage
  "wss://*.supabase.co", // Supabase realtime / auth token refresh sockets
  "https://plausible.io", // Plausible Events API (POST /api/event)
  "https://*.revenuecat.com", // RevenueCat SDK (offerings, customer info, purchase)
  "https://api.rc-backup.com", // RevenueCat failover host
  "https://api.stripe.com", // Stripe API (behind RevenueCat Web Billing)
  isDev ? "ws://localhost:*" : "", // webpack HMR socket in `next dev`
]
  .filter(Boolean)
  .join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'", // next/font + Tailwind + framer-motion inline styles
  "img-src 'self' data: blob: https://*.revenuecat.com", // self assets, data: SVG bg, blob: avatars, RC paywall art
  "font-src 'self'", // all fonts are self-hosted (next/font + local Ithaca)
  `connect-src ${connectSrc}`,
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com", // Stripe checkout / 3DS iframes
  "worker-src 'self' blob:", // service worker + any blob workers
  "manifest-src 'self'", // /manifest.webmanifest
  "media-src 'self' blob:",
  "object-src 'none'", // no <object>/<embed>/<applet>
  "base-uri 'self'", // lock <base> to same origin
  "form-action 'self'", // forms may only submit to same origin
  "frame-ancestors 'none'", // clickjacking protection (pairs with X-Frame-Options)
  "upgrade-insecure-requests",
].join("; ");

// Disable powerful features the app never uses; permit payment only for our
// origin and Stripe (Apple/Google Pay via the RevenueCat Web Billing flow).
const permissionsPolicy = [
  "accelerometer=()",
  "autoplay=()",
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
  'payment=(self "https://js.stripe.com")',
].join(", ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: permissionsPolicy },
];

const nextConfig: NextConfig = {
  // Keep the World English Bible JSON available to the server chapter loader
  // in production without bundling any of it into client code.
  outputFileTracingIncludes: {
    "/app/bible/**": ["./src/data/bible/**"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
