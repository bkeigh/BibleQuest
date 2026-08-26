import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

interface AccountBetaManifest {
  contract: string;
  reviewed: boolean;
  hostedOrigin: string;
  supabaseOrigin: string;
  supabasePublishableKeySha256: string;
}

interface CapturedEnvironment {
  mode: "release" | "account-beta" | "custom";
  appPlatform?: string;
  appUrl?: string;
  hostedOrigin?: string;
  nativeAuthCallbackUrl?: string;
  supabaseOrigin?: string;
  supabasePublishableKeyPresent: boolean;
  supabasePublishableKeySha256: string;
  legacyAnonKey?: string;
  accountSyncEnabled?: string;
  accountGateEnabled?: string;
  nativeAccountBetaEnabled?: string;
  nativeCommerceEnabled?: string;
  analyticsEnabled?: string;
  plausibleDomain?: string;
  plausibleHost?: string;
  stripePublishableKey?: string;
  unknownPublicValue?: string;
}

interface BuilderRun {
  root: string;
  result: SpawnSyncReturns<string>;
}

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const builderSource = readFileSync(
  path.join(repositoryRoot, "scripts/build-native.mjs"),
  "utf8",
);
const nativeMediaSource = readFileSync(
  path.join(repositoryRoot, "scripts/lib/native-media.mjs"),
  "utf8",
);
const nativeAccountMarkerSource = readFileSync(
  path.join(repositoryRoot, "src/lib/sync/native-account-markers.mjs"),
  "utf8",
);
const guestAccountArtifactContractSource = readFileSync(
  path.join(
    repositoryRoot,
    "src/lib/sync/guest-account-artifact-contract.mjs",
  ),
  "utf8",
);
const guestReleaseOverlaySource = readFileSync(
  path.join(repositoryRoot, "src/lib/sync/guest-release-overlays.mjs"),
  "utf8",
);
const reviewedSupabaseOrigin =
  "https://abcdefghijklmnopqrst.supabase.co";
const reviewedPublishableKey =
  "sb_publishable_account_beta_test_fixture_1234567890";
const reviewedPublishableKeySha256 = createHash("sha256")
  .update(reviewedPublishableKey)
  .digest("hex");
const temporaryRoots: string[] = [];

/** Build a complete reviewed manifest using non-routable test-only identity. */
function reviewedManifest(
  overrides: Partial<AccountBetaManifest> = {},
): AccountBetaManifest {
  return {
    contract: "biblequest_ios_account_beta_target_v1",
    reviewed: true,
    hostedOrigin: "https://native-staging.biblequest.co",
    supabaseOrigin: reviewedSupabaseOrigin,
    supabasePublishableKeySha256: reviewedPublishableKeySha256,
    ...overrides,
  };
}

/** Stop immediately after profile validation and print only public posture. */
function instrumentedBuilder(): string {
  const marker = "\nstageTree();\n";
  if (!builderSource.includes(marker)) {
    throw new Error("Native builder execution seam changed.");
  }
  const capture = [
    "const capturedEnvironment = {",
    '  mode: releaseBuild ? "release" : accountBetaBuild ? "account-beta" : "custom",',
    "  appPlatform: process.env.NEXT_PUBLIC_APP_PLATFORM,",
    "  appUrl: process.env.NEXT_PUBLIC_APP_URL,",
    "  hostedOrigin: process.env.NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN,",
    "  nativeAuthCallbackUrl: process.env.NEXT_PUBLIC_NATIVE_AUTH_CALLBACK_URL,",
    "  supabaseOrigin: process.env.NEXT_PUBLIC_SUPABASE_URL,",
    "  supabasePublishableKeyPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),",
    '  supabasePublishableKeySha256: createHash("sha256").update(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").digest("hex"),',
    "  legacyAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,",
    "  accountSyncEnabled: process.env.NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED,",
    "  accountGateEnabled: process.env.NEXT_PUBLIC_ACCOUNT_GATE_ENABLED,",
    "  nativeAccountBetaEnabled: process.env.NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED,",
    "  nativeCommerceEnabled: process.env.NEXT_PUBLIC_NATIVE_COMMERCE_ENABLED,",
    "  analyticsEnabled: process.env.NEXT_PUBLIC_ANALYTICS_ENABLED,",
    "  plausibleDomain: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN,",
    "  plausibleHost: process.env.NEXT_PUBLIC_PLAUSIBLE_HOST,",
    "  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,",
    "  unknownPublicValue: process.env.NEXT_PUBLIC_FUTURE_ACCOUNT_ENDPOINT,",
    "};",
    'process.stdout.write(JSON.stringify(capturedEnvironment) + "\\n");',
    "process.exit(0);",
  ].join("\n");
  return builderSource.replace(marker, `\n${capture}\n`);
}

/** Run the real profile parser against an isolated manifest and env files. */
function runBuilder(
  manifest: AccountBetaManifest,
  options: {
    accountKey?: string;
    extraAccountEnv?: string;
    envFile?: ".env.account-beta.local" | ".env.local";
    mode?: "--account-beta" | "--release";
  } = {},
): BuilderRun {
  const root = mkdtempSync(path.join(tmpdir(), "biblequest-ios-beta-"));
  temporaryRoots.push(root);
  mkdirSync(path.join(root, "scripts/lib"), { recursive: true });
  mkdirSync(path.join(root, "config"), { recursive: true });
  mkdirSync(path.join(root, "src/lib/sync"), { recursive: true });
  writeFileSync(
    path.join(root, "scripts/build-native.mjs"),
    instrumentedBuilder(),
  );
  writeFileSync(path.join(root, "scripts/lib/native-media.mjs"), nativeMediaSource);
  writeFileSync(
    path.join(root, "src/lib/sync/native-account-markers.mjs"),
    nativeAccountMarkerSource,
  );
  writeFileSync(
    path.join(root, "src/lib/sync/guest-account-artifact-contract.mjs"),
    guestAccountArtifactContractSource,
  );
  writeFileSync(
    path.join(root, "src/lib/sync/guest-release-overlays.mjs"),
    guestReleaseOverlaySource,
  );
  writeFileSync(
    path.join(root, "config/ios-account-beta.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  writeFileSync(
    path.join(root, ".env.account-beta.local"),
    `BIBLEQUEST_IOS_ACCOUNT_BETA_PUBLISHABLE_KEY=${
      options.accountKey ?? reviewedPublishableKey
    }\n${options.extraAccountEnv ?? ""}`,
  );
  writeFileSync(
    path.join(root, ".env.local"),
    [
      "NEXT_PUBLIC_APP_PLATFORM=web",
      "NEXT_PUBLIC_APP_URL=https://www.biblequest.co",
      "NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN=https://www.biblequest.co",
      "NEXT_PUBLIC_SUPABASE_URL=https://iacnjqnssovaaojswjoh.supabase.co",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=production-poison",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=legacy-poison",
      "NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED=false",
      "NEXT_PUBLIC_ACCOUNT_GATE_ENABLED=true",
      "NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED=false",
      "NEXT_PUBLIC_NATIVE_COMMERCE_ENABLED=true",
      "NEXT_PUBLIC_ANALYTICS_ENABLED=true",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_poison",
      "NEXT_PUBLIC_FUTURE_ACCOUNT_ENDPOINT=https://future.example",
      "",
    ].join("\n"),
  );

  // Poison inherited public values too; an approved profile must replace them.
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NEXT_PUBLIC_APP_PLATFORM: "web",
    NEXT_PUBLIC_APP_URL: "https://arbitrary.example",
    NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN: "https://arbitrary.example",
    NEXT_PUBLIC_SUPABASE_URL:
      "https://zzzzzzzzzzzzzzzzzzzz.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "arbitrary-poison",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-poison",
    NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED: "false",
    NEXT_PUBLIC_ACCOUNT_GATE_ENABLED: "true",
    NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED: "false",
    NEXT_PUBLIC_NATIVE_COMMERCE_ENABLED: "true",
    NEXT_PUBLIC_ANALYTICS_ENABLED: "true",
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "analytics.example",
    NEXT_PUBLIC_PLAUSIBLE_HOST: "https://analytics.example",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_poison",
    NEXT_PUBLIC_FUTURE_ACCOUNT_ENDPOINT: "https://future.example",
  };
  delete environment.BIBLEQUEST_IOS_ACCOUNT_BETA_PUBLISHABLE_KEY;

  const envFile = options.envFile ?? ".env.account-beta.local";
  const mode = options.mode ?? "--account-beta";
  const result = spawnSync(
    process.execPath,
    [
      `--env-file-if-exists=${envFile}`,
      "scripts/build-native.mjs",
      mode,
    ],
    { cwd: root, encoding: "utf8", env: environment },
  );
  return { root, result };
}

/** Decode the one sanitized posture record emitted by the test harness. */
function capturedEnvironment(result: SpawnSyncReturns<string>) {
  expect(result.status, result.stderr).toBe(0);
  const lines = result.stdout.trim().split("\n");
  return JSON.parse(lines[lines.length - 1]) as CapturedEnvironment;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("deterministic iOS account-beta preparation", () => {
  it("preserves the guest preparation command and strips every account-traffic flag", () => {
    const scripts = (
      JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8")) as {
        scripts: Record<string, string>;
      }
    ).scripts;

    expect(scripts["build:native:release"]).toBe(
      "node --env-file-if-exists=.env.local scripts/build-native.mjs --release",
    );
    expect(scripts["ios:release:prepare"]).toBe(
      "node scripts/select-ios-privacy-manifest.mjs --guest && pnpm build:native:release && pnpm exec cap sync ios && node scripts/verify-guest-ios-payload.mjs && node scripts/verify-ios-content-rights.mjs",
    );
    expect(scripts["build:native:account-beta"]).toBe(
      "node --env-file-if-exists=.env.account-beta.local scripts/build-native.mjs --account-beta",
    );
    expect(scripts["ios:account-beta:prepare"]).toBe(
      "node scripts/select-ios-privacy-manifest.mjs --account-sync && pnpm build:native:account-beta && pnpm exec cap sync ios",
    );

    const { result } = runBuilder(reviewedManifest(), {
      envFile: ".env.local",
      mode: "--release",
    });
    const releaseEnvironment = capturedEnvironment(result);
    expect(releaseEnvironment).not.toHaveProperty("unknownPublicValue");
    expect(releaseEnvironment).toMatchObject({
      mode: "release",
      appPlatform: "native",
      appUrl: "https://www.biblequest.co",
      hostedOrigin: "https://www.biblequest.co",
      nativeAuthCallbackUrl: "",
      supabaseOrigin: "",
      supabasePublishableKeyPresent: false,
      legacyAnonKey: "",
      accountSyncEnabled: "false",
      accountGateEnabled: "false",
      nativeAccountBetaEnabled: "false",
      nativeCommerceEnabled: "false",
      analyticsEnabled: "false",
      plausibleDomain: "",
      plausibleHost: "",
      stripePublishableKey: "",
    });
  });

  it("fails before staging while the checked-in target remains unreviewed", () => {
    const checkedIn = JSON.parse(
      readFileSync(
        path.join(repositoryRoot, "config/ios-account-beta.json"),
        "utf8",
      ),
    ) as AccountBetaManifest;

    expect(checkedIn).toEqual({
      contract: "biblequest_ios_account_beta_target_v1",
      reviewed: false,
      hostedOrigin: "https://native-staging.biblequest.co",
      supabaseOrigin: "",
      supabasePublishableKeySha256: "",
    });
    const { root, result } = runBuilder(checkedIn);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "no reviewed iOS account-beta backend is pinned",
    );
    expect(existsSync(path.join(root, ".native"))).toBe(false);
  });

  it("ignores arbitrary and .env.local targets in favor of one reviewed fixture", () => {
    const { result } = runBuilder(reviewedManifest());

    expect(capturedEnvironment(result)).toEqual({
      mode: "account-beta",
      appPlatform: "native",
      appUrl: "https://native-staging.biblequest.co",
      hostedOrigin: "https://native-staging.biblequest.co",
      nativeAuthCallbackUrl: "",
      supabaseOrigin: reviewedSupabaseOrigin,
      supabasePublishableKeyPresent: true,
      supabasePublishableKeySha256: reviewedPublishableKeySha256,
      legacyAnonKey: "",
      accountSyncEnabled: "true",
      accountGateEnabled: "false",
      nativeAccountBetaEnabled: "true",
      nativeCommerceEnabled: "false",
      analyticsEnabled: "false",
      plausibleDomain: "",
      plausibleHost: "",
      stripePublishableKey: "",
    });
  });

  it.each([
    ["production", "https://iacnjqnssovaaojswjoh.supabase.co"],
    ["historical staging", "https://yjwlunqssyztxkedstjb.supabase.co"],
    ["deleted disposable", "https://lorqiyzrfmpvvcvsvghc.supabase.co"],
    ["arbitrary host", "https://account-beta.example.com"],
  ])("rejects the %s backend", (_label, supabaseOrigin) => {
    const { root, result } = runBuilder(
      reviewedManifest({ supabaseOrigin }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "the reviewed iOS account-beta Supabase origin is invalid",
    );
    expect(existsSync(path.join(root, ".native"))).toBe(false);
  });

  it("rejects a public key that does not match the reviewed fingerprint", () => {
    const { root, result } = runBuilder(reviewedManifest(), {
      accountKey: "sb_publishable_different_test_fixture_0987654321",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "the account-beta Supabase key does not match the reviewed target",
    );
    expect(existsSync(path.join(root, ".native"))).toBe(false);
  });

  it("rejects any second account-beta env-file assignment", () => {
    const { root, result } = runBuilder(reviewedManifest(), {
      extraAccountEnv: "NEXT_PUBLIC_SUPABASE_URL=https://arbitrary.example\n",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      ".env.account-beta.local must contain only the public beta key",
    );
    expect(existsSync(path.join(root, ".native"))).toBe(false);
  });
});
