import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor 8 configuration for the BibleQuest iOS app.
 *
 * The app ships as a LOCAL bundle: `pnpm build:native` produces a static
 * export in `out-native/`, and `cap sync` copies it into the binary. There is
 * deliberately no `server.url` here — pointing the WebView at the hosted site
 * would make this a thin shell, which App Store guidelines 4.2 (minimum
 * functionality) and 2.5.2 (self-contained code) reject, and which
 * docs/IOS_RELEASE_READINESS.md names as its first hard release stop.
 */
const config: CapacitorConfig = {
  appId: "co.biblequest.app",
  appName: "BibleQuest",
  webDir: "out-native",
  // Matches the Paper theme background so the WebView never flashes white
  // behind the app shell on launch or during rubber-band overscroll.
  backgroundColor: "#faf6ec",
  server: {
    /**
     * The iOS origin is `capacitor://localhost` — Capacitor's default, left
     * explicit here so it is never changed casually.
     *
     * FROZEN. Do not change this after the first TestFlight build. The WebView
     * origin is the partition key for localStorage and IndexedDB, and
     * BibleQuest keeps the entire user journey in the `biblequest:v1` local
     * storage blob. Switching the scheme later would orphan every existing
     * user's prayers, reflections and quest history with no migration path.
     *
     * `iosScheme` is deliberately NOT set. It cannot be `https`: WKWebView
     * already handles that scheme, so `setURLSchemeHandler` refuses it and
     * Capacitor silently falls back to `capacitor` (verified on device — a
     * config of `iosScheme: "https"` still reported origin
     * `capacitor://localhost`). Only custom schemes are selectable, and a
     * custom one here would collide confusingly with the `biblequest://`
     * scheme reserved for the auth callback in src/lib/platform/auth.ts.
     *
     * Consequence for later work: the origin's protocol is `capacitor:`, so
     * `hasSameOrigin()` in src/lib/http/request.ts rejects it on the protocol
     * branch, not just the origin branch. Native API auth must account for
     * both.
     */
    hostname: "localhost",
    androidScheme: "https",
  },
  ios: {
    // CSS safe-area utilities own every edge; UIKit insets would apply the
    // same top and bottom clearance twice around the WebView content.
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
    // TextZoom needs the mobile content mode on iPad; iPhone is unchanged.
    preferredContentMode: "mobile",
  },
  plugins: {
    LocalNotifications: {
      // Foreground reminders stay visible but never play attention-grabbing
      // audio. Scheduled payloads also omit prayer, journal and Scripture text.
      presentationOptions: ["banner", "list"],
    },
    SplashScreen: {
      // The splash is hidden explicitly once the journey restore settles, so
      // it covers the repair rather than revealing an empty journey that then
      // pops back. A clean iOS simulator needed 41 seconds to reach its first
      // meaningful WebKit paint, so the native catastrophic fallback must be
      // comfortably longer than that measured cold-start interval. Healthy
      // launches still hide this immediately from NativeJourneyGuard.
      launchAutoHide: true,
      launchShowDuration: 60_000,
      backgroundColor: "#faf6ec",
      // Keep startup focused on the reviewed artwork, with no native spinner
      // competing with the matching in-app restore screen.
      showSpinner: false,
    },
    /**
     * Left disabled on purpose. CapacitorHttp patches fetch/XHR onto native
     * URLSession and bypasses WebView CORS, which is only useful once the app
     * makes cross-origin API calls — and its fetch patch has known rough edges
     * with FormData/blob bodies, which is exactly the avatar upload path.
     * Revisit when native session transport lands.
     */
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
