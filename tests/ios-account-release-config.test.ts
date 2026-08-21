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

interface ReleaseManifest {
  contract: string;
  reviewed: boolean;
  hostedOrigin: string;
  supabaseOrigin: string;
  supabasePublishableKeySha256: string;
}

interface CapturedEnvironment {
  mode: string;
  appUrl?: string;
  hostedOrigin?: string;
  supabaseOrigin?: string;
  publishableKeySha256: string;
  legacyAnonKey?: string;
  accountSyncEnabled?: string;
  accountGateEnabled?: string;
  nativeAvailabilityEnabled?: string;
  commerceEnabled?: string;
  analyticsEnabled?: string;
  stripePublishableKey?: string;
}

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const builderSource = readFileSync(
  path.join(repositoryRoot, "scripts/build-native.mjs"),
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
const fixtureKey = "sb_publishable_account_release_fixture_1234567890";
const fixtureFingerprint = createHash("sha256")
  .update(fixtureKey)
  .digest("hex");
const temporaryRoots: string[] = [];

/** Builds one exact Production manifest around a synthetic public key. */
function manifest(overrides: Partial<ReleaseManifest> = {}): ReleaseManifest {
  return {
    contract: "biblequest_ios_account_release_target_v1",
    reviewed: true,
    hostedOrigin: "https://www.biblequest.co",
    supabaseOrigin: "https://iacnjqnssovaaojswjoh.supabase.co",
    supabasePublishableKeySha256: fixtureFingerprint,
    ...overrides,
  };
}

/** Stops before filesystem staging and emits only public posture fingerprints. */
function instrumentedBuilder(): string {
  const marker = "\nstageTree();\n";
  if (!builderSource.includes(marker)) {
    throw new Error("Native builder execution seam changed.");
  }
  const capture = [
    "const capturedEnvironment = {",
    '  mode: releaseBuild ? "release" : accountBetaBuild ? "account-beta" : accountReleaseBuild ? "account-release" : "custom",',
    "  appUrl: process.env.NEXT_PUBLIC_APP_URL,",
    "  hostedOrigin: process.env.NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN,",
    "  supabaseOrigin: process.env.NEXT_PUBLIC_SUPABASE_URL,",
    '  publishableKeySha256: createHash("sha256").update(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").digest("hex"),',
    "  legacyAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,",
    "  accountSyncEnabled: process.env.NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED,",
    "  accountGateEnabled: process.env.NEXT_PUBLIC_ACCOUNT_GATE_ENABLED,",
    "  nativeAvailabilityEnabled: process.env.NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED,",
    "  commerceEnabled: process.env.NEXT_PUBLIC_NATIVE_COMMERCE_ENABLED,",
    "  analyticsEnabled: process.env.NEXT_PUBLIC_ANALYTICS_ENABLED,",
    "  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,",
    "};",
    'process.stdout.write(JSON.stringify(capturedEnvironment) + "\\n");',
    "process.exit(0);",
  ].join("\n");
  return builderSource.replace(marker, `\n${capture}\n`);
}

/** Runs the real account-release parser in an isolated poisoned environment. */
function runBuilder(
  releaseManifest: ReleaseManifest,
  options: {
    key?: string;
    extraEnv?: string;
    mode?: "--account-release" | null;
  } = {},
): { root: string; result: SpawnSyncReturns<string> } {
  const root = mkdtempSync(path.join(tmpdir(), "biblequest-ios-release-"));
  temporaryRoots.push(root);
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  mkdirSync(path.join(root, "config"), { recursive: true });
  mkdirSync(path.join(root, "src/lib/sync"), { recursive: true });
  writeFileSync(
    path.join(root, "scripts/build-native.mjs"),
    instrumentedBuilder(),
  );
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
    path.join(root, "config/ios-account-release.json"),
    `${JSON.stringify(releaseManifest, null, 2)}\n`,
  );
  writeFileSync(
    path.join(root, ".env.account-release.local"),
    `BIBLEQUEST_IOS_ACCOUNT_RELEASE_PUBLISHABLE_KEY=${
      options.key ?? fixtureKey
    }\n${options.extraEnv ?? ""}`,
  );
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NEXT_PUBLIC_APP_PLATFORM: options.mode === null ? "native" : "web",
    NEXT_PUBLIC_APP_URL:
      options.mode === null
        ? "https://www.biblequest.co"
        : "https://preview.example",
    NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN:
      options.mode === null
        ? "https://www.biblequest.co"
        : "https://preview.example",
    NEXT_PUBLIC_SUPABASE_URL:
      options.mode === null
        ? "https://iacnjqnssovaaojswjoh.supabase.co"
        : "https://zzzzzzzzzzzzzzzzzzzz.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "preview-poison",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-poison",
    NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED: "false",
    NEXT_PUBLIC_ACCOUNT_GATE_ENABLED: "true",
    NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED: "false",
    NEXT_PUBLIC_NATIVE_COMMERCE_ENABLED: "true",
    NEXT_PUBLIC_ANALYTICS_ENABLED: "true",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_poison",
  };
  delete environment.BIBLEQUEST_IOS_ACCOUNT_RELEASE_PUBLISHABLE_KEY;
  const result = spawnSync(
    process.execPath,
    [
      "--env-file-if-exists=.env.account-release.local",
      "scripts/build-native.mjs",
      ...(options.mode === null
        ? []
        : [options.mode ?? "--account-release"]),
    ],
    { cwd: root, encoding: "utf8", env: environment },
  );
  return { root, result };
}

/** Decodes the one sanitized posture record from the instrumented builder. */
function captured(result: SpawnSyncReturns<string>): CapturedEnvironment {
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "{}");
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("deterministic iOS Production account release", () => {
  it("provides a distinct preparation command beside guest and beta", () => {
    const scripts = (
      JSON.parse(readFileSync("package.json", "utf8")) as {
        scripts: Record<string, string>;
      }
    ).scripts;
    expect(scripts["build:native:account-release"]).toBe(
      "node --env-file-if-exists=.env.account-release.local scripts/build-native.mjs --account-release",
    );
    expect(scripts["ios:account-release:prepare"]).toBe(
      "node scripts/select-ios-privacy-manifest.mjs --account-sync && pnpm build:native:account-release && pnpm exec cap sync ios",
    );
    expect(scripts["build:native:release"]).toContain("--release");
    expect(scripts["build:native:account-beta"]).toContain("--account-beta");
  });

  it("overrides arbitrary targets with the reviewed Production-only posture", () => {
    const { result } = runBuilder(manifest());
    expect(captured(result)).toEqual({
      mode: "account-release",
      appUrl: "https://www.biblequest.co",
      hostedOrigin: "https://www.biblequest.co",
      supabaseOrigin: "https://iacnjqnssovaaojswjoh.supabase.co",
      publishableKeySha256: fixtureFingerprint,
      legacyAnonKey: "",
      accountSyncEnabled: "true",
      accountGateEnabled: "false",
      nativeAvailabilityEnabled: "true",
      commerceEnabled: "false",
      analyticsEnabled: "false",
      stripePublishableKey: "",
    });
  });

  it.each([
    ["preview project", "https://zzzzzzzzzzzzzzzzzzzz.supabase.co"],
    ["staging project", "https://abcdefghijklmnopqrst.supabase.co"],
    ["decorated Production URL", "https://iacnjqnssovaaojswjoh.supabase.co/path"],
  ])("rejects a %s", (_label, supabaseOrigin) => {
    const { root, result } = runBuilder(manifest({ supabaseOrigin }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "the reviewed iOS account-release Production target is incomplete",
    );
    expect(existsSync(path.join(root, ".native"))).toBe(false);
  });

  it.each([
    ["secret", "sb_secret_fixture_value_1234567890"],
    ["legacy JWT", "fixture.legacy.anon"],
    ["wrong publishable", "sb_publishable_wrong_fixture_0987654321"],
  ])("rejects a %s key", (_label, key) => {
    const { root, result } = runBuilder(manifest(), { key });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /must be one modern Supabase publishable key|does not match the reviewed target/,
    );
    expect(existsSync(path.join(root, ".native"))).toBe(false);
  });

  it("rejects a second release env assignment", () => {
    const { root, result } = runBuilder(manifest(), {
      extraEnv: "NEXT_PUBLIC_SUPABASE_URL=https://preview.example\n",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      ".env.account-release.local must contain only the public release key",
    );
    expect(existsSync(path.join(root, ".native"))).toBe(false);
  });

  it("rejects an arbitrary custom build aimed at Production", () => {
    const { root, result } = runBuilder(manifest(), { mode: null });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "only --account-release may target the Production Supabase project",
    );
    expect(existsSync(path.join(root, ".native"))).toBe(false);
  });

  it("declares account data without adding excluded release surfaces", () => {
    const accountPrivacy = readFileSync(
      "ios/compliance/PrivacyInfo.account-sync.xcprivacy",
      "utf8",
    );
    const guestPrivacy = readFileSync(
      "ios/compliance/PrivacyInfo.guest.xcprivacy",
      "utf8",
    );
    for (const dataType of [
      "Name",
      "EmailAddress",
      "PhotosorVideos",
      "SensitiveInfo",
      "OtherUserContent",
      "UserID",
      "ProductInteraction",
    ]) {
      expect(accountPrivacy).toContain(
        `NSPrivacyCollectedDataType${dataType}`,
      );
    }
    expect(accountPrivacy).not.toContain(
      "NSPrivacyCollectedDataTypePurchaseHistory",
    );
    expect(accountPrivacy).toMatch(
      /<key>NSPrivacyTracking<\/key>\s*<false\/>/,
    );
    expect(guestPrivacy).toMatch(
      /<key>NSPrivacyCollectedDataTypes<\/key>\s*<array\/>/,
    );
    expect(readFileSync("ios/App/App/PrivacyInfo.xcprivacy", "utf8")).toBe(
      accountPrivacy,
    );
  });
});
