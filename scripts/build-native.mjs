#!/usr/bin/env node
/**
 * Builds the static bundle that ships inside the iOS app.
 *
 * Next has no way to exclude routes from `output: "export"` — the option is a
 * bare string union with no include/exclude sibling — so this stages a filtered
 * copy of the tree in `.native/`, removes the server-only surfaces, and builds
 * there. The canonical `pnpm build` is never touched: it stays byte-identical
 * for Vercel, Playwright, and the security-header contract test, all of which
 * need a server build that `next start` can serve.
 *
 * Output: `out-native/`, which capacitor.config.ts names as its webDir.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  findGuestAccountArtifactViolation,
  GUEST_FORBIDDEN_ACCOUNT_ARTIFACT_LITERALS,
} from "../src/lib/sync/guest-account-artifact-contract.mjs";
import {
  isPublicMediaPath,
  nativePublicMediaAllowlist,
} from "./lib/native-media.mjs";
import {
  GUEST_RELEASE_OVERLAYS,
  GUEST_RELEASE_PROVENANCE_CONTRACT,
} from "../src/lib/sync/guest-release-overlays.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = path.join(repo, ".native");
const output = path.join(repo, "out-native");
const RELEASE_ORIGIN = "https://www.biblequest.co";
const ACCOUNT_BETA_ORIGIN = "https://native-staging.biblequest.co";
const ACCOUNT_BETA_CONFIG_PATH = path.join(
  repo,
  "config/ios-account-beta.json",
);
const ACCOUNT_RELEASE_CONFIG_PATH = path.join(
  repo,
  "config/ios-account-release.json",
);
const ACCOUNT_BETA_ENV_PATH = path.join(repo, ".env.account-beta.local");
const ACCOUNT_RELEASE_ENV_PATH = path.join(
  repo,
  ".env.account-release.local",
);
const buildArguments = process.argv.slice(2);
const releaseBuild = buildArguments[0] === "--release";
const accountBetaBuild = buildArguments[0] === "--account-beta";
const accountReleaseBuild = buildArguments[0] === "--account-release";
let accountBetaSupabaseOrigin = "";
let accountReleaseSupabaseOrigin = "";
let accountReleasePublishableKeySha256 = "";

if (
  buildArguments.length > 1 ||
  (buildArguments.length === 1 &&
    !releaseBuild &&
    !accountBetaBuild &&
    !accountReleaseBuild)
) {
  fail(
    "use no build mode, --release, --account-beta, or --account-release exactly once.",
  );
}

/**
 * Pins every privacy- or identity-sensitive public value for the App Store
 * candidate. Process values deliberately override `.env.local`, so a previous
 * staging session cannot silently produce an account-enabled release binary.
 */
function pinReleaseEnvironment() {
  if (!releaseBuild) return;
  // Start from an empty public namespace so a future endpoint cannot leak in.
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("NEXT_PUBLIC_")) delete process.env[key];
  }
  const values = {
    NEXT_PUBLIC_APP_PLATFORM: "native",
    NEXT_PUBLIC_APP_URL: RELEASE_ORIGIN,
    NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN: RELEASE_ORIGIN,
    NEXT_PUBLIC_NATIVE_AUTH_CALLBACK_URL: "",
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED: "false",
    NEXT_PUBLIC_ACCOUNT_GATE_ENABLED: "false",
    NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED: "false",
    NEXT_PUBLIC_NATIVE_COMMERCE_ENABLED: "false",
    NEXT_PUBLIC_ANALYTICS_ENABLED: "false",
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "",
    NEXT_PUBLIC_PLAUSIBLE_HOST: "",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_GREEN_FEATURES_ENABLED: "true",
    NEXT_PUBLIC_GUIDED_SCRIPTURE_ENABLED: "true",
    NEXT_PUBLIC_PILGRIMAGES_ENABLED: "true",
    NEXT_PUBLIC_SCRIPTURE_GAMES_ENABLED: "true",
    NEXT_PUBLIC_SCRIPTURE_CONNECTIONS_ENABLED: "true",
    NEXT_PUBLIC_BIBLE_TIMELINE_ENABLED: "true",
    NEXT_PUBLIC_SEVEN_DAYS_MATCH_ENABLED: "true",
    NEXT_PUBLIC_RHYTHM_BUILDER_ENABLED: "true",
  };
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
  const installedPublicKeys = Object.keys(process.env)
    .filter((key) => key.startsWith("NEXT_PUBLIC_"))
    .sort();
  const reviewedPublicKeys = Object.keys(values).sort();
  if (installedPublicKeys.join("\n") !== reviewedPublicKeys.join("\n")) {
    fail("release builds must contain only the reviewed public environment.");
  }
}

/** Reads only the exact reviewed Production account target. */
function accountReleaseConfiguration() {
  let value;
  try {
    value = JSON.parse(readFileSync(ACCOUNT_RELEASE_CONFIG_PATH, "utf8"));
  } catch {
    fail("the checked-in iOS account-release target manifest is invalid.");
  }
  const keys = Object.keys(value ?? {}).sort().join(",");
  if (
    keys !==
      "contract,hostedOrigin,reviewed,supabaseOrigin,supabasePublishableKeySha256" ||
    value.contract !== "biblequest_ios_account_release_target_v1" ||
    value.reviewed !== true ||
    value.hostedOrigin !== RELEASE_ORIGIN ||
    value.supabaseOrigin !==
      "https://iacnjqnssovaaojswjoh.supabase.co" ||
    typeof value.supabasePublishableKeySha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.supabasePublishableKeySha256)
  ) {
    fail("the reviewed iOS account-release Production target is incomplete.");
  }
  try {
    const url = new URL(value.supabaseOrigin);
    if (
      url.protocol !== "https:" ||
      url.origin !== value.supabaseOrigin ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error("unsafe target");
    }
  } catch {
    fail("the reviewed iOS account-release Supabase origin is invalid.");
  }
  return value;
}

/** Accepts only one modern public key matching the reviewed fingerprint. */
function accountReleasePublishableKey(expectedSha256) {
  const key =
    process.env.BIBLEQUEST_IOS_ACCOUNT_RELEASE_PUBLISHABLE_KEY?.trim();
  if (
    !key ||
    key.length > 2_048 ||
    /\s/.test(key) ||
    !key.startsWith("sb_publishable_")
  ) {
    fail(
      "BIBLEQUEST_IOS_ACCOUNT_RELEASE_PUBLISHABLE_KEY must be one modern " +
        "Supabase publishable key in .env.account-release.local.",
    );
  }
  const actualSha256 = createHash("sha256").update(key).digest("hex");
  if (actualSha256 !== expectedSha256) {
    fail("the account-release public key does not match the reviewed target.");
  }
  return key;
}

/** Rejects every release env assignment except its one public key. */
function validateAccountReleaseEnvironmentFile() {
  let contents;
  try {
    contents = readFileSync(ACCOUNT_RELEASE_ENV_PATH, "utf8");
  } catch {
    fail(".env.account-release.local must contain only the public release key.");
  }
  const assignments = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (
    assignments.length !== 1 ||
    !/^BIBLEQUEST_IOS_ACCOUNT_RELEASE_PUBLISHABLE_KEY=[^\s"']+$/.test(
      assignments[0],
    )
  ) {
    fail(".env.account-release.local must contain only the public release key.");
  }
}

/** Pins account sync to Production while leaving acquisition and telemetry off. */
function pinAccountReleaseEnvironment() {
  if (!accountReleaseBuild) return;
  const configuration = accountReleaseConfiguration();
  validateAccountReleaseEnvironmentFile();
  accountReleaseSupabaseOrigin = configuration.supabaseOrigin;
  accountReleasePublishableKeySha256 =
    configuration.supabasePublishableKeySha256;
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("NEXT_PUBLIC_")) delete process.env[key];
  }
  const values = {
    NEXT_PUBLIC_APP_PLATFORM: "native",
    NEXT_PUBLIC_APP_URL: RELEASE_ORIGIN,
    NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN: RELEASE_ORIGIN,
    NEXT_PUBLIC_NATIVE_AUTH_CALLBACK_URL: "",
    NEXT_PUBLIC_SUPABASE_URL: accountReleaseSupabaseOrigin,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: accountReleasePublishableKey(
      accountReleasePublishableKeySha256,
    ),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED: "true",
    NEXT_PUBLIC_ACCOUNT_GATE_ENABLED: "false",
    NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED: "true",
    NEXT_PUBLIC_NATIVE_COMMERCE_ENABLED: "false",
    NEXT_PUBLIC_ANALYTICS_ENABLED: "false",
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "",
    NEXT_PUBLIC_PLAUSIBLE_HOST: "",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_GREEN_FEATURES_ENABLED: "true",
    NEXT_PUBLIC_GUIDED_SCRIPTURE_ENABLED: "true",
    NEXT_PUBLIC_PILGRIMAGES_ENABLED: "true",
    NEXT_PUBLIC_SCRIPTURE_GAMES_ENABLED: "true",
    NEXT_PUBLIC_SCRIPTURE_CONNECTIONS_ENABLED: "true",
    NEXT_PUBLIC_BIBLE_TIMELINE_ENABLED: "true",
    NEXT_PUBLIC_SEVEN_DAYS_MATCH_ENABLED: "true",
    NEXT_PUBLIC_RHYTHM_BUILDER_ENABLED: "true",
  };
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
}

/** Reads only a complete, explicitly reviewed staging-target manifest. */
function accountBetaConfiguration() {
  let value;
  try {
    value = JSON.parse(readFileSync(ACCOUNT_BETA_CONFIG_PATH, "utf8"));
  } catch {
    fail("the checked-in iOS account-beta target manifest is invalid.");
  }
  const keys = Object.keys(value ?? {}).sort().join(",");
  if (
    keys !==
      "contract,hostedOrigin,reviewed,supabaseOrigin,supabasePublishableKeySha256" ||
    value.contract !== "biblequest_ios_account_beta_target_v1" ||
    value.reviewed !== true ||
    value.hostedOrigin !== ACCOUNT_BETA_ORIGIN ||
    typeof value.supabaseOrigin !== "string" ||
    typeof value.supabasePublishableKeySha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.supabasePublishableKeySha256)
  ) {
    fail(
      "no reviewed iOS account-beta backend is pinned; complete " +
        "config/ios-account-beta.json after the staging review.",
    );
  }
  try {
    const url = new URL(value.supabaseOrigin);
    if (
      url.protocol !== "https:" ||
      !/^[a-z]{20}\.supabase\.co$/.test(url.hostname) ||
      url.origin !== value.supabaseOrigin ||
      [
        "iacnjqnssovaaojswjoh.supabase.co",
        "yjwlunqssyztxkedstjb.supabase.co",
        "lorqiyzrfmpvvcvsvghc.supabase.co",
      ].includes(url.hostname)
    ) {
      throw new Error("unsafe target");
    }
  } catch {
    fail("the reviewed iOS account-beta Supabase origin is invalid.");
  }
  return value;
}

/** Accepts only the fingerprinted public key from the dedicated beta file. */
function accountBetaPublishableKey(expectedSha256) {
  const key = process.env.BIBLEQUEST_IOS_ACCOUNT_BETA_PUBLISHABLE_KEY?.trim();
  if (!key || key.length > 2_048 || /\s/.test(key)) {
    fail(
      "BIBLEQUEST_IOS_ACCOUNT_BETA_PUBLISHABLE_KEY is required in " +
        ".env.account-beta.local.",
    );
  }
  if (key.startsWith("sb_secret_")) {
    fail("the account-beta build accepts only a Supabase publishable key.");
  }
  let publishable = key.startsWith("sb_publishable_");
  if (!publishable) {
    // Legacy anon JWTs remain supported, but every other JWT role is rejected.
    try {
      const parts = key.split(".");
      if (parts.length !== 3) throw new Error("not a JWT");
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf8"),
      );
      publishable = payload?.role === "anon";
    } catch {
      publishable = false;
    }
  }
  if (!publishable) {
    fail("the account-beta Supabase key is not a publishable or anon key.");
  }
  const actualSha256 = createHash("sha256").update(key).digest("hex");
  if (actualSha256 !== expectedSha256) {
    fail("the account-beta Supabase key does not match the reviewed target.");
  }
  return key;
}

/** Reject every beta env-file assignment except the fingerprinted public key. */
function validateAccountBetaEnvironmentFile() {
  let contents;
  try {
    contents = readFileSync(ACCOUNT_BETA_ENV_PATH, "utf8");
  } catch {
    fail(".env.account-beta.local must contain only the public beta key.");
  }
  const assignments = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (
    assignments.length !== 1 ||
    !/^BIBLEQUEST_IOS_ACCOUNT_BETA_PUBLISHABLE_KEY=[^\s"']+$/.test(
      assignments[0],
    )
  ) {
    fail(".env.account-beta.local must contain only the public beta key.");
  }
}

/** Pins the one reviewed non-production account target and minimum flags. */
function pinAccountBetaEnvironment() {
  if (!accountBetaBuild) return;
  const configuration = accountBetaConfiguration();
  validateAccountBetaEnvironmentFile();
  accountBetaSupabaseOrigin = configuration.supabaseOrigin;
  // Remove arbitrary inherited public values before adding the reviewed set.
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("NEXT_PUBLIC_")) delete process.env[key];
  }
  const values = {
    NEXT_PUBLIC_APP_PLATFORM: "native",
    NEXT_PUBLIC_APP_URL: ACCOUNT_BETA_ORIGIN,
    NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN: ACCOUNT_BETA_ORIGIN,
    NEXT_PUBLIC_NATIVE_AUTH_CALLBACK_URL: "",
    NEXT_PUBLIC_SUPABASE_URL: accountBetaSupabaseOrigin,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: accountBetaPublishableKey(
      configuration.supabasePublishableKeySha256,
    ),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED: "true",
    NEXT_PUBLIC_ACCOUNT_GATE_ENABLED: "false",
    NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED: "true",
    NEXT_PUBLIC_NATIVE_COMMERCE_ENABLED: "false",
    NEXT_PUBLIC_ANALYTICS_ENABLED: "false",
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "",
    NEXT_PUBLIC_PLAUSIBLE_HOST: "",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_GREEN_FEATURES_ENABLED: "true",
    NEXT_PUBLIC_GUIDED_SCRIPTURE_ENABLED: "true",
    NEXT_PUBLIC_PILGRIMAGES_ENABLED: "true",
    NEXT_PUBLIC_SCRIPTURE_GAMES_ENABLED: "true",
    NEXT_PUBLIC_SCRIPTURE_CONNECTIONS_ENABLED: "true",
    NEXT_PUBLIC_BIBLE_TIMELINE_ENABLED: "true",
    NEXT_PUBLIC_SEVEN_DAYS_MATCH_ENABLED: "true",
    NEXT_PUBLIC_RHYTHM_BUILDER_ENABLED: "true",
  };
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
}

function log(message) {
  process.stdout.write(`[build:native] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`\n[build:native] ${message}\n\n`);
  process.exit(1);
}

/**
 * These two are a hard precondition, not a convention.
 *
 * `platformRuntime()` throws unless both are present and the origin is a bare
 * HTTPS origin, and it is called at module scope by the billing code — a bad
 * value white-screens the app on load rather than failing at render. The same
 * pair also routes the translation fetch and keeps the verse Share sheet from
 * throwing, since `buildPublicUrl` rejects a `capacitor:` origin.
 */
function requiredEnvironment() {
  const target = process.env.NEXT_PUBLIC_APP_PLATFORM?.trim();
  if (target !== "native") {
    fail(
      `NEXT_PUBLIC_APP_PLATFORM must be "native" for this build (got ${
        target ? `"${target}"` : "nothing"
      }).\n` +
        "Set it in .env.local, or run:\n" +
        "  NEXT_PUBLIC_APP_PLATFORM=native \\\n" +
        "  NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN=https://www.biblequest.co \\\n" +
        "  pnpm build:native",
    );
  }

  const origin = process.env.NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN?.trim();
  if (!origin) {
    fail(
      "NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN is required for a native build.\n" +
        "It must be one bare HTTPS origin, e.g. https://www.biblequest.co",
    );
  }
  try {
    const url = new URL(origin);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      throw new Error("decorated");
    }
  } catch {
    fail(
      `NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN must be one bare HTTPS origin with no ` +
        `path, query, fragment or credentials (got "${origin}").`,
    );
  }
  if (releaseBuild && origin !== RELEASE_ORIGIN) {
    fail(`release builds must use ${RELEASE_ORIGIN} (got "${origin}").`);
  }
  if (
    releaseBuild &&
    (process.env.NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED !== "false" ||
      process.env.NEXT_PUBLIC_ACCOUNT_GATE_ENABLED !== "false" ||
      process.env.NEXT_PUBLIC_NATIVE_COMMERCE_ENABLED !== "false" ||
      process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "false")
  ) {
    fail(
      "release builds must keep account sync, account gates, native commerce, and analytics off.",
    );
  }
  if (
    accountBetaBuild &&
    (origin !== ACCOUNT_BETA_ORIGIN ||
      process.env.NEXT_PUBLIC_APP_URL !== ACCOUNT_BETA_ORIGIN ||
      process.env.NEXT_PUBLIC_SUPABASE_URL !== accountBetaSupabaseOrigin ||
      process.env.NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED !== "true" ||
      process.env.NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED !== "true" ||
      process.env.NEXT_PUBLIC_NATIVE_COMMERCE_ENABLED !== "false" ||
      process.env.NEXT_PUBLIC_ACCOUNT_GATE_ENABLED !== "false" ||
      process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "false" ||
      process.env.NEXT_PUBLIC_NATIVE_AUTH_CALLBACK_URL !== "" ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== "" ||
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY !== "")
  ) {
    fail("account-beta builds must use the pinned staging-only posture.");
  }
  if (
    accountReleaseBuild &&
    (origin !== RELEASE_ORIGIN ||
      process.env.NEXT_PUBLIC_APP_URL !== RELEASE_ORIGIN ||
      process.env.NEXT_PUBLIC_SUPABASE_URL !== accountReleaseSupabaseOrigin ||
      process.env.NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED !== "true" ||
      process.env.NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED !== "true" ||
      process.env.NEXT_PUBLIC_NATIVE_COMMERCE_ENABLED !== "false" ||
      process.env.NEXT_PUBLIC_ACCOUNT_GATE_ENABLED !== "false" ||
      process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "false" ||
      process.env.NEXT_PUBLIC_NATIVE_AUTH_CALLBACK_URL !== "" ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== "" ||
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY !== "")
  ) {
    fail("account-release builds must use the pinned Production-only posture.");
  }
  if (
    !accountReleaseBuild &&
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ===
      "https://iacnjqnssovaaojswjoh.supabase.co"
  ) {
    fail("only --account-release may target the Production Supabase project.");
  }
  return { target, origin };
}

/**
 * Surfaces that cannot exist in a static export, with the reason each one goes.
 * Anything removed here is unreachable in the native app by design.
 */
const REMOVE = [
  ["src/app/api", "route handlers cannot be statically exported"],
  ["src/app/auth", "the OAuth callback is a server route handler"],
  ["src/app/console", "operator console — server-rendered, and not a consumer surface"],
  [
    "src/components/console",
    "console-only components; they import the deleted server actions",
  ],
  ["src/app/(marketing)", "public marketing site; the app bundle ships only /app"],
  ["src/app/offline", "service workers cannot load from Capacitor's custom scheme"],
  [
    "src/components/marketing",
    "marketing-only components, unreachable once the marketing group is gone",
  ],
  ["src/proxy.ts", "middleware does not run in an export"],
  [
    "src/app/sitemap.ts",
    "a sitemap addresses crawlers; nothing crawls a local app bundle",
  ],
  [
    "src/app/robots.ts",
    "likewise robots.txt — and both need force-static under export",
  ],
  [
    "src/app/manifest.ts",
    "the PWA install manifest; iOS identity comes from Info.plist. Removing the " +
      "file also drops the <link rel=\"manifest\"> Next injects for it",
  ],
  [
    "src/app/app/bible/[book]/[chapter]",
    "replaced by the flat reader at /app/bible/read (see lib/bible/links.ts)",
  ],
  [
    "src/app/app/reflection",
    "legacy redirect routes; reads searchParams, and the native app has no legacy URLs",
  ],
  [
    "src/app/app/plus",
    "web membership acquisition; native builds have no audited StoreKit path",
  ],
  [
    "src/app/app/games/store",
    "web arcade checkout; native builds have no audited StoreKit path",
  ],
];

/**
 * `/` is served by the marketing group, which is removed above. Without a root
 * page the export emits no out/index.html and the WebView loads a blank screen
 * — a failure that looks like a Capacitor misconfiguration and is easy to burn
 * a day on.
 */
const ROOT_PAGE = `import { redirect } from "next/navigation";

/**
 * GENERATED by scripts/build-native.mjs — not part of the web app.
 *
 * The native bundle has no marketing site, so the WebView's entry point sends
 * straight into the app shell.
 *
 * This must stay a Next \`redirect()\`, which resolves through the client
 * router. A hard \`window.location\` navigation to "/app" does NOT work: the
 * export emits "app.html", and Capacitor's asset handler will not resolve the
 * extensionless path for a document request — the WebView lands on a blank
 * screen. Navigating to "/app.html" instead would make \`usePathname()\` return
 * "/app.html", breaking every exact pathname comparison in the shell.
 *
 * The consequence is that this page never renders the root layout, so its
 * index.html carries no CSP meta tag. \`injectLaunchCsp()\` below repairs that
 * after the export.
 */
export default function NativeRootPage() {
  redirect("/app");
}
`;

/**
 * Onboarding reads `?error=` from the auth callback, which a static export
 * hard-errors on. That callback is a server route that does not exist in this
 * bundle, so on native there is never an auth failure to report.
 */
const ONBOARDING_PAGE = `import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { SyncManager } from "@/components/app-shell/SyncManager";
import { OnboardingAccountRestoreGate } from "@/components/onboarding/OnboardingGate";
import { privateRouteMetadata } from "@/lib/metadata";

export const metadata = privateRouteMetadata("Welcome", "/onboarding");

/**
 * GENERATED by scripts/build-native.mjs — not part of the web app.
 *
 * The web page reads an auth-failure reason from searchParams. Static export
 * forbids that, and the /auth/callback route that produces it is not in this
 * bundle, so there is nothing to read.
 */
export default function OnboardingPage() {
  return (
    <>
      <SyncManager />
      <OnboardingAccountRestoreGate>
        <OnboardingFlow authFailure={null} />
      </OnboardingAccountRestoreGate>
    </>
  );
}
`;

const NATIVE_NEXT_CONFIG = `import path from "node:path";
import type { NextConfig } from "next";

/**
 * GENERATED by scripts/build-native.mjs — not part of the web app.
 *
 * \`trailingSlash\` is deliberately NOT set. It is often recommended for
 * Capacitor so the export emits \`app/quests/index.html\` instead of
 * \`app/quests.html\`, but Capacitor's iOS handler resolves the extensionless
 * form on its own, and enabling it makes \`usePathname()\` return
 * \`/app/quests/\` — which silently breaks every exact pathname comparison in
 * the app: tab highlighting in BottomNav, chrome hiding in AppShell, the
 * reflections tab in PrayerScreen, and the onboarding launch gate, which hangs
 * forever on "Restoring your journey…". Verified on device.
 *
 * No headers() — a filesystem-served bundle sends none. The CSP is emitted as
 * a meta tag from src/app/layout.tsx instead (see lib/security/csp.ts).
 *
 * No basePath or assetPrefix — Next emits absolute /_next/... paths, which the
 * scheme handler serves from the webDir root. Either option would break that.
 */
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  poweredByHeader: false,
  // Keep Turbopack inside the repository while allowing the staged dependency symlink.
  turbopack: { root: path.resolve(process.cwd(), "..") },
};

export default nextConfig;
`;

function stageTree() {
  log("staging a filtered copy of the tree in .native/");
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });

  execFileSync(
    "rsync",
    [
      "-a",
      "--delete",
      "--exclude=node_modules/",
      "--exclude=.git/",
      "--exclude=.next/",
      "--exclude=.native/",
      "--exclude=out/",
      "--exclude=out-native/",
      "--exclude=ios/",
      "--exclude=.codex-worktrees/",
      "--exclude=coverage/",
      "--exclude=test-results/",
      "--exclude=playwright-report/",
      "--exclude=.next-header-*/",
      "--exclude=*.tsbuildinfo",
      "--exclude=.DS_Store",
      // Secrets must not be duplicated into the staged copy. The build still
      // gets what it needs: package.json loads .env.local into this process
      // via --env-file-if-exists, and that environment is forwarded to
      // `next build` below.
      "--exclude=.env",
      "--exclude=.env.*",
      // Agent worktrees are full second copies of the repository.
      "--exclude=/.claude/",
      "--exclude=/output/",
      // Web-only acquisition media and service-worker code cannot execute in
      // the local Capacitor scheme and should not inflate the signed binary.
      "--exclude=/public/marketing/",
      "--exclude=/public/sw.js",
      // Wallpaper videos are unreachable because native omits the Plus picker.
      // The finite still-image set is enforced after staging below.
      "--exclude=/public/wallpapers/*/loop.mp4",
      `${repo}/`,
      `${stage}/`,
    ],
    { stdio: "inherit" },
  );

  // Symlinked rather than copied: it is the largest thing in the repo and the
  // staged build resolves through it identically.
  symlinkSync(path.join(repo, "node_modules"), path.join(stage, "node_modules"));
}

/** Removes every public picture that is not reachable from a native route. */
function pruneNativePublicMedia() {
  const allowed = new Set(nativePublicMediaAllowlist(stage));
  let removed = 0;
  for (const file of generatedFiles(path.join(stage, "public"))) {
    const relative = path.relative(stage, file).split(path.sep).join("/");
    if (isPublicMediaPath(relative) && !allowed.has(relative)) {
      rmSync(file);
      removed += 1;
    }
  }
  const retained = generatedFiles(path.join(stage, "public"))
    .map((file) => path.relative(stage, file).split(path.sep).join("/"))
    .filter(isPublicMediaPath)
    .sort();
  if (retained.join("\n") !== [...allowed].sort().join("\n")) {
    fail("the staged native media set does not match its reviewed allowlist.");
  }
  log(`retained ${retained.length} reviewed public media files; removed ${removed}`);
}

function pruneServerSurfaces() {
  for (const [relative, reason] of REMOVE) {
    const target = path.join(stage, relative);
    if (!existsSync(target)) {
      fail(
        `expected to remove ${relative} but it does not exist.\n` +
          "The staged tree no longer matches this script — update REMOVE in scripts/build-native.mjs.",
      );
    }
    rmSync(target, { recursive: true, force: true });
    log(`removed ${relative} — ${reason}`);
  }

  writeFileSync(path.join(stage, "src/app/page.tsx"), ROOT_PAGE);
  writeFileSync(path.join(stage, "src/app/onboarding/page.tsx"), ONBOARDING_PAGE);
  writeFileSync(path.join(stage, "next.config.ts"), NATIVE_NEXT_CONFIG);
}

/** Replaces account modules with audited fail-closed guest implementations. */
function stageGuestAccountContainment() {
  if (!releaseBuild) return;
  for (const [source, destination] of GUEST_RELEASE_OVERLAYS) {
    cpSync(path.join(stage, source), path.join(stage, destination));
  }
  log("staged fail-closed guest account modules");
}

function build() {
  log("running next build with output:\"export\"");
  execFileSync(
    path.join(repo, "node_modules/.bin/next"),
    ["build"],
    { cwd: stage, stdio: "inherit", env: process.env },
  );
}

/** Fails the build if a web-only acquisition route re-enters the app bundle. */
function verifyCommerceRoutesPruned() {
  for (const route of ["app/plus", "app/games/store"]) {
    const exported = path.join(stage, "out", route);
    if (
      existsSync(`${exported}.html`) ||
      existsSync(`${exported}.txt`) ||
      existsSync(exported)
    ) {
      fail(`web-only commerce route was exported into the native bundle: /${route}`);
    }
  }
  log("verified web-only commerce routes are absent");
}

/** Walks generated output without shell globs so release checks are portable. */
function generatedFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...generatedFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

/** Rejects server credentials from every generated native artifact. */
function verifyNoPrivilegedSupabaseCredentials() {
  const jwtPattern =
    /[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g;
  for (const file of generatedFiles(path.join(stage, "out"))) {
    const contents = readFileSync(file, "utf8");
    if (/sb_secret_[A-Za-z0-9._-]{20,}/.test(contents)) {
      fail("native output contains a Supabase secret key.");
    }
    for (const candidate of contents.match(jwtPattern) ?? []) {
      try {
        const payload = JSON.parse(
          Buffer.from(candidate.split(".")[1], "base64url").toString("utf8"),
        );
        if (payload?.role === "service_role") {
          fail("native output contains a service-role credential.");
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("service-role")) {
          throw error;
        }
      }
    }
  }
  log("verified native output contains no privileged Supabase credential");
}

/** Keeps the deterministic guest artifact free of Supabase client config. */
function verifyGuestSupabaseAbsence() {
  if (!releaseBuild) return;
  for (const file of generatedFiles(path.join(stage, "out"))) {
    const contents = readFileSync(file, "utf8");
    if (
      /https:\/\/[a-z]{20}\.supabase\.co/.test(contents) ||
      /sb_publishable_[A-Za-z0-9._-]{20,}/.test(contents)
    ) {
      fail("guest release output contains Supabase client configuration.");
    }
  }
  log("verified guest release output contains no Supabase client config");
}

/** Rejects executable customer-auth, remote-sync, and remote-avatar markers. */
function verifyGuestAccountMarkersAbsent() {
  if (!releaseBuild) return;
  for (const file of generatedFiles(path.join(stage, "out"))) {
    const contents = readFileSync(file, "utf8");
    const violation = findGuestAccountArtifactViolation(contents);
    if (violation) {
      fail(
        `guest release output contains forbidden account machinery (${violation}) in ${path.relative(
          path.join(stage, "out"),
          file,
        )}`,
      );
    }
  }
  log(
    `verified guest release output contains none of ${GUEST_FORBIDDEN_ACCOUNT_ARTIFACT_LITERALS.length} reviewed operational markers`,
  );
}

/** Fails if a release artifact retains a disposable or protected host. */
function verifyReleaseOrigin() {
  if (!releaseBuild && !accountReleaseBuild) return;
  const releaseMarker = Buffer.from(RELEASE_ORIGIN);
  const forbiddenMarkers = [
    "native-staging.biblequest.co",
    ".vercel.app",
  ].map((value) => Buffer.from(value));
  let releaseReferences = 0;

  for (const file of generatedFiles(path.join(stage, "out"))) {
    const contents = readFileSync(file);
    if (contents.includes(releaseMarker)) releaseReferences += 1;
    for (const marker of forbiddenMarkers) {
      if (contents.includes(marker)) {
        fail(
          `release output contains forbidden host marker in ${path.relative(
            path.join(stage, "out"),
            file,
          )}`,
        );
      }
    }
  }

  if (releaseReferences === 0) {
    fail(`release output does not contain the required origin ${RELEASE_ORIGIN}.`);
  }
  log(`verified production origin in ${releaseReferences} generated files`);
}

/** Requires one reviewed Production project and one reviewed public key. */
function verifyAccountReleaseTarget() {
  if (!accountReleaseBuild) return;
  const publicKeyDigests = new Set();
  let originReferences = 0;
  for (const file of generatedFiles(path.join(stage, "out"))) {
    const contents = readFileSync(file, "utf8");
    const origins =
      contents.match(/https:\/\/[a-z]{20}\.supabase\.co/g) ?? [];
    if (origins.some((origin) => origin !== accountReleaseSupabaseOrigin)) {
      fail("account-release output contains a non-Production Supabase origin.");
    }
    if (contents.includes(accountReleaseSupabaseOrigin)) {
      originReferences += 1;
    }
    for (const key of contents.match(/sb_publishable_[A-Za-z0-9._-]+/g) ?? []) {
      publicKeyDigests.add(createHash("sha256").update(key).digest("hex"));
    }
  }
  if (
    originReferences === 0 ||
    publicKeyDigests.size !== 1 ||
    !publicKeyDigests.has(accountReleasePublishableKeySha256)
  ) {
    fail("account-release output does not contain exactly its reviewed public target.");
  }
  log("verified the one reviewed Production Supabase client target");
}

/** Fails if the beta artifact drifts to production or a disposable preview. */
function verifyAccountBetaOrigin() {
  if (!accountBetaBuild) return;
  const requiredMarkers = [
    ACCOUNT_BETA_ORIGIN,
    accountBetaSupabaseOrigin,
  ].map((value) => Buffer.from(value));
  const forbiddenMarkers = [
    "iacnjqnssovaaojswjoh.supabase.co",
    "yjwlunqssyztxkedstjb.supabase.co",
    "lorqiyzrfmpvvcvsvghc.supabase.co",
    ".vercel.app",
  ].map((value) => Buffer.from(value));
  const references = new Array(requiredMarkers.length).fill(0);

  for (const file of generatedFiles(path.join(stage, "out"))) {
    const contents = readFileSync(file);
    const discoveredSupabaseOrigins = contents
      .toString("utf8")
      .match(/https:\/\/[a-z]{20}\.supabase\.co/g) ?? [];
    if (
      discoveredSupabaseOrigins.some(
        (origin) => origin !== accountBetaSupabaseOrigin,
      )
    ) {
      fail(
        `account-beta output contains a non-allowlisted Supabase origin in ${path.relative(
          path.join(stage, "out"),
          file,
        )}`,
      );
    }
    requiredMarkers.forEach((marker, index) => {
      if (contents.includes(marker)) references[index] += 1;
    });
    for (const marker of forbiddenMarkers) {
      if (contents.includes(marker)) {
        fail(
          `account-beta output contains a forbidden host marker in ${path.relative(
            path.join(stage, "out"),
            file,
          )}`,
        );
      }
    }
  }

  if (references.some((count) => count === 0)) {
    fail("account-beta output is missing its pinned staging origins.");
  }
  log("verified the pinned non-production account-beta origins");
}

/**
 * Copies the Content-Security-Policy meta tag onto the launch document.
 *
 * The root page is a `redirect()` (see ROOT_PAGE for why it has to be), so its
 * index.html never renders the root layout and therefore never receives the
 * meta tag. A filesystem-served bundle gets no response headers, so without
 * this the very first document the WebView parses would have no policy at all.
 *
 * The tag is lifted verbatim from a page that DID render the layout, so the two
 * can never drift apart.
 */
function injectLaunchCsp(indexPath) {
  const launch = readFileSync(indexPath, "utf8");
  if (launch.includes('http-equiv="Content-Security-Policy"')) return;

  const rendered = path.join(stage, "out/app.html");
  if (!existsSync(rendered)) {
    fail(
      "cannot source a CSP meta tag: out/app.html is missing.\n" +
        "The /app route is the shell every launch redirects into; if it did not\n" +
        "build, the bundle is broken regardless of the policy.",
    );
  }

  const tag = /<meta http-equiv="Content-Security-Policy"[^>]*>/.exec(
    readFileSync(rendered, "utf8"),
  )?.[0];
  if (!tag) {
    fail(
      "out/app.html carries no Content-Security-Policy meta tag.\n" +
        "src/app/layout.tsx should emit one whenever the platform target is native —\n" +
        "check that NEXT_PUBLIC_APP_PLATFORM reached the build.",
    );
  }

  if (!launch.includes("<head>")) {
    fail("out/index.html has no <head> to insert the policy into.");
  }
  writeFileSync(indexPath, launch.replace("<head>", `<head>${tag}`));
  log("injected the CSP meta tag into the launch document");
}

function publish() {
  const index = path.join(stage, "out/index.html");
  if (!existsSync(index)) {
    fail(
      "the export produced no out/index.html.\n" +
        "Capacitor loads the webDir root, so the WebView would show a blank screen.\n" +
        "The generated root page at src/app/page.tsx is what should emit it.",
    );
  }

  injectLaunchCsp(index);

  rmSync(output, { recursive: true, force: true });
  cpSync(path.join(stage, "out"), output, { recursive: true });
  log(`wrote ${path.relative(repo, output)}/`);
}

/** Records that the complete release path staged every reviewed guest overlay. */
function writeGuestReleaseProvenance() {
  if (!releaseBuild) return;
  const record = {
    contract: GUEST_RELEASE_PROVENANCE_CONTRACT,
    mode: "release",
    overlayCount: GUEST_RELEASE_OVERLAYS.length,
  };
  writeFileSync(
    path.join(stage, "guest-release-provenance.json"),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  log("recorded guest release provenance");
}

pinReleaseEnvironment();
pinAccountBetaEnvironment();
pinAccountReleaseEnvironment();
const { origin } = requiredEnvironment();
const mode = releaseBuild
  ? "release"
  : accountBetaBuild
    ? "account-beta"
    : accountReleaseBuild
      ? "account-release"
      : "custom";
log(`mode=${mode} target=native hostedOrigin=${origin}`);
stageTree();
pruneNativePublicMedia();
pruneServerSurfaces();
stageGuestAccountContainment();
build();
verifyCommerceRoutesPruned();
verifyNoPrivilegedSupabaseCredentials();
verifyGuestSupabaseAbsence();
verifyGuestAccountMarkersAbsent();
verifyReleaseOrigin();
verifyAccountReleaseTarget();
verifyAccountBetaOrigin();
publish();
writeGuestReleaseProvenance();
log("done — run `pnpm exec cap sync ios` to copy it into the app");
