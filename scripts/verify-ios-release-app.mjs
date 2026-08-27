#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nativePublicMediaAllowlist } from "./lib/native-media.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const RELEASE_IDENTITY_CONTRACT = "biblequest_ios_release_identity_v1";
const RELEASE_ORIGIN = "https://www.biblequest.co";
const mediaExtension = /\.(?:gif|ico|jpe?g|png|svg|webp)$/i;

// Stops artifact approval with one bounded, credential-free reason.
function fail(message) {
  throw new Error(message);
}

// Accepts only the finite command contract used by CI and release owners.
export function parseArguments(argumentsList) {
  const values = new Map();
  let allowUnsigned = false;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--allow-unsigned") {
      if (allowUnsigned) fail("--allow-unsigned may be supplied only once");
      allowUnsigned = true;
      continue;
    }
    if (
      !["--app", "--profile", "--expected-build", "--expected-source"].includes(
        argument,
      )
    ) {
      fail(`unsupported argument: ${argument}`);
    }
    if (values.has(argument)) fail(`${argument} may be supplied only once`);
    const value = argumentsList[index + 1];
    if (!value || value.startsWith("--")) fail(`${argument} requires a value`);
    values.set(argument, value);
    index += 1;
  }
  for (const required of [
    "--app",
    "--profile",
    "--expected-build",
    "--expected-source",
  ]) {
    if (!values.has(required)) fail(`${required} is required`);
  }
  const profile = values.get("--profile");
  if (!new Set(["guest", "account-release"]).has(profile)) {
    fail("--profile must be guest or account-release");
  }
  const expectedBuild = values.get("--expected-build");
  if (!/^[1-9][0-9]*$/.test(expectedBuild)) {
    fail("--expected-build must be a positive integer");
  }
  const expectedSource = values.get("--expected-source").toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(expectedSource)) {
    fail("--expected-source must be one full Git SHA");
  }
  return {
    app: values.get("--app"),
    profile,
    expectedBuild,
    expectedSource,
    allowUnsigned,
  };
}

// Returns every regular file below a directory as a normalized relative path.
function filesBelow(root) {
  if (!existsSync(root) || !lstatSync(root).isDirectory()) {
    fail(`required directory is missing: ${root}`);
  }
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      if (entry.isFile()) {
        files.push(path.relative(root, absolute).split(path.sep).join("/"));
      }
    }
  };
  visit(root);
  return files.sort();
}

// Hashes one file without emitting its potentially sensitive contents.
function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

// Requires two exact finite path sets without additions or omissions.
function assertSamePaths(actual, expected, label) {
  if (actual.join("\n") === expected.join("\n")) return;
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const unexpected = actual.filter((file) => !expectedSet.has(file));
  const missing = expected.filter((file) => !actualSet.has(file));
  fail(
    `${label} drifted; unexpected=[${unexpected.join(", ")}], ` +
      `missing=[${missing.join(", ")}]`,
  );
}

// Reads one compiled plist field through macOS's binary-safe plist utility.
function plistValue(plist, key, format = "raw") {
  try {
    return execFileSync(
      "/usr/bin/plutil",
      ["-extract", key, format, "-o", "-", plist],
      { encoding: "utf8" },
    ).trim();
  } catch {
    fail(`Info.plist is missing or has an invalid ${key}`);
  }
}

// Proves the immutable product identity and iPhone-only platform posture.
function verifyInfoPlist(appRoot, options) {
  const plist = path.join(appRoot, "Info.plist");
  if (plistValue(plist, "CFBundleIdentifier") !== "co.biblequest.app") {
    fail("CFBundleIdentifier is not co.biblequest.app");
  }
  if (plistValue(plist, "CFBundleShortVersionString") !== "1.2") {
    fail("CFBundleShortVersionString is not 1.2");
  }
  if (plistValue(plist, "CFBundleVersion") !== options.expectedBuild) {
    fail("CFBundleVersion does not match --expected-build");
  }
  if (plistValue(plist, "ITSAppUsesNonExemptEncryption") !== "false") {
    fail("ITSAppUsesNonExemptEncryption must be false");
  }
  if (plistValue(plist, "MinimumOSVersion") !== "15.0") {
    fail("MinimumOSVersion is not the reviewed 15.0 target");
  }
  const deviceFamily = JSON.parse(plistValue(plist, "UIDeviceFamily", "json"));
  if (JSON.stringify(deviceFamily) !== "[1]") {
    fail("UIDeviceFamily must contain iPhone only");
  }
  const platforms = JSON.parse(
    plistValue(plist, "CFBundleSupportedPlatforms", "json"),
  );
  const expectedPlatform = options.allowUnsigned ? "iPhoneSimulator" : "iPhoneOS";
  if (JSON.stringify(platforms) !== JSON.stringify([expectedPlatform])) {
    fail(`CFBundleSupportedPlatforms must contain only ${expectedPlatform}`);
  }
}

// Requires the archived privacy declaration to match its reviewed profile.
function verifyPrivacyManifest(appRoot, profile) {
  const sourceName =
    profile === "account-release"
      ? "PrivacyInfo.account-sync.xcprivacy"
      : "PrivacyInfo.guest.xcprivacy";
  const source = path.join(repositoryRoot, "ios/compliance", sourceName);
  const bundled = path.join(appRoot, "PrivacyInfo.xcprivacy");
  if (!existsSync(bundled) || sha256(source) !== sha256(bundled)) {
    fail(`archived PrivacyInfo.xcprivacy does not match ${sourceName}`);
  }
}

// Proves the payload's embedded profile, source SHA, and hosted origin.
function verifyReleaseIdentity(publicRoot, options) {
  const identityPath = path.join(publicRoot, "native-release-identity.json");
  let identity;
  try {
    identity = JSON.parse(readFileSync(identityPath, "utf8"));
  } catch {
    fail("native-release-identity.json is missing or invalid");
  }
  const keys = Object.keys(identity ?? {}).sort().join(",");
  const expectedProfile = options.profile === "guest" ? "release" : "account-release";
  if (
    keys !== "contract,hostedOrigin,profile,sourceSha" ||
    identity.contract !== RELEASE_IDENTITY_CONTRACT ||
    identity.profile !== expectedProfile ||
    identity.sourceSha !== options.expectedSource ||
    identity.hostedOrigin !== RELEASE_ORIGIN
  ) {
    fail("the embedded native release identity does not match this approval");
  }
}

// Verifies every public image, font subset, favicon, and license notice in-app.
function verifyReviewableContent(publicRoot) {
  const allowed = nativePublicMediaAllowlist(repositoryRoot);
  const expectedMedia = allowed
    .map((file) => file.replace(/^public\//, ""))
    .sort();
  const bundledMedia = filesBelow(publicRoot)
    .filter((file) => !file.startsWith("_next/") && mediaExtension.test(file))
    .filter((file) => file !== "favicon.ico")
    .sort();
  assertSamePaths(bundledMedia, expectedMedia, "archived public media");
  for (const source of allowed) {
    const bundled = path.join(publicRoot, source.replace(/^public\//, ""));
    if (sha256(path.join(repositoryRoot, source)) !== sha256(bundled)) {
      fail(`archived public media differs from its source: ${source}`);
    }
  }

  const generatedRoot = path.join(publicRoot, "_next/static/media");
  const generated = filesBelow(generatedRoot);
  const fonts = generated.filter((file) => file.endsWith(".woff2"));
  const favicons = generated.filter((file) => file.endsWith(".ico"));
  assertSamePaths(generated, [...fonts, ...favicons].sort(), "archived generated media");
  if (fonts.length !== 10 || favicons.length !== 1) {
    fail("archived generated media must contain 10 WOFF2 subsets and one favicon");
  }

  const sourceFavicon = path.join(repositoryRoot, "src/app/favicon.ico");
  if (
    sha256(sourceFavicon) !== sha256(path.join(publicRoot, "favicon.ico")) ||
    sha256(sourceFavicon) !== sha256(path.join(generatedRoot, favicons[0]))
  ) {
    fail("archived favicon copies do not match src/app/favicon.ico");
  }
  const sourceNotices = path.join(repositoryRoot, "public/THIRD_PARTY_NOTICES.txt");
  const bundledNotices = path.join(publicRoot, "THIRD_PARTY_NOTICES.txt");
  if (!existsSync(bundledNotices) || sha256(sourceNotices) !== sha256(bundledNotices)) {
    fail("archived third-party notices do not match the reviewed source");
  }
}

// Rejects privileged credentials, unreviewed hosts, and profile target drift.
function verifyPublicConfiguration(publicRoot, profile) {
  const target = JSON.parse(
    readFileSync(path.join(repositoryRoot, "config/ios-account-release.json"), "utf8"),
  );
  const supabaseOrigins = new Set();
  const publicKeyDigests = new Set();
  let releaseOriginReferences = 0;
  const jwtPattern =
    /[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g;
  for (const relative of filesBelow(publicRoot)) {
    const contents = readFileSync(path.join(publicRoot, relative));
    const text = contents.toString("utf8");
    if (contents.includes(Buffer.from(RELEASE_ORIGIN))) releaseOriginReferences += 1;
    for (const marker of [
      "native-staging.biblequest.co",
      ".vercel.app",
      "plausible.io",
    ]) {
      if (contents.includes(Buffer.from(marker))) {
        fail(`archived public payload contains forbidden host marker: ${marker}`);
      }
    }
    if (/sb_secret_[A-Za-z0-9._-]{20,}/.test(text)) {
      fail("archived public payload contains a Supabase secret key");
    }
    for (const origin of text.match(/https:\/\/[a-z]{20}\.supabase\.co/g) ?? []) {
      supabaseOrigins.add(origin);
    }
    for (const key of text.match(/sb_publishable_[A-Za-z0-9._-]+/g) ?? []) {
      publicKeyDigests.add(createHash("sha256").update(key).digest("hex"));
    }
    for (const candidate of text.match(jwtPattern) ?? []) {
      try {
        const payload = JSON.parse(
          Buffer.from(candidate.split(".")[1], "base64url").toString("utf8"),
        );
        if (payload?.role === "service_role") {
          fail("archived public payload contains a service-role credential");
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("service-role")) {
          throw error;
        }
      }
    }
  }
  if (releaseOriginReferences === 0) {
    fail("archived public payload is missing the Production hosted origin");
  }
  if (profile === "guest") {
    if (supabaseOrigins.size !== 0 || publicKeyDigests.size !== 0) {
      fail("guest archive contains Supabase client configuration");
    }
    return;
  }
  if (
    supabaseOrigins.size !== 1 ||
    !supabaseOrigins.has(target.supabaseOrigin) ||
    publicKeyDigests.size !== 1 ||
    !publicKeyDigests.has(target.supabasePublishableKeySha256)
  ) {
    fail("account archive does not contain exactly the reviewed public target");
  }
}

// Keeps the compiled bridge limited to the seven reviewed native plugins.
function verifyCapacitorConfiguration(appRoot) {
  let config;
  try {
    config = JSON.parse(
      readFileSync(path.join(appRoot, "capacitor.config.json"), "utf8"),
    );
  } catch {
    fail("archived capacitor.config.json is missing or invalid");
  }
  const expectedPlugins = [
    "FilesystemPlugin",
    "KeyboardPlugin",
    "LocalNotificationsPlugin",
    "SecureStorage",
    "SplashScreenPlugin",
    "StatusBarPlugin",
    "TextZoomPlugin",
  ];
  const actualPlugins = [...(config.packageClassList ?? [])].sort();
  if (
    config.appId !== "co.biblequest.app" ||
    config.appName !== "BibleQuest" ||
    config.server?.url ||
    config.plugins?.CapacitorHttp?.enabled !== false ||
    JSON.stringify(actualPlugins) !== JSON.stringify(expectedPlugins)
  ) {
    fail("archived Capacitor identity or plugin set has drifted");
  }
}

// Requires a valid device signature and rejects remote-push/debug entitlements.
function verifySignature(appRoot, allowUnsigned) {
  if (allowUnsigned) return;
  const verification = spawnSync(
    "/usr/bin/codesign",
    ["--verify", "--deep", "--strict", appRoot],
    { encoding: "utf8" },
  );
  if (verification.status !== 0) fail("the archived app signature is invalid");
  const disclosure = spawnSync(
    "/usr/bin/codesign",
    ["-d", "--entitlements", ":-", appRoot],
    { encoding: "utf8" },
  );
  if (disclosure.status !== 0) fail("the archived app entitlements are unreadable");
  const entitlements = `${disclosure.stdout}\n${disclosure.stderr}`;
  if (
    entitlements.includes("aps-environment") ||
    /<key>get-task-allow<\/key>\s*<true\/>/.test(entitlements)
  ) {
    fail("the archived app contains remote-push or debug entitlements");
  }
}

// Produces one deterministic tree digest including files and symbolic links.
function appTreeDigest(appRoot) {
  const records = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(appRoot, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) visit(absolute);
      if (entry.isFile()) records.push(`${relative}\0file\0${sha256(absolute)}`);
      if (entry.isSymbolicLink()) {
        records.push(`${relative}\0link\0${readlinkSync(absolute)}`);
      }
    }
  };
  visit(appRoot);
  const inventory = records.sort().join("\n");
  return {
    files: records.length,
    sha256: createHash("sha256").update(inventory).digest("hex"),
  };
}

// Runs the complete exact-artifact gate and prints only approval-safe evidence.
export function verifyReleaseApp(options) {
  const requested = path.resolve(options.app);
  if (!existsSync(requested) || !lstatSync(requested).isDirectory()) {
    fail("--app must identify an extracted .app directory");
  }
  const appRoot = realpathSync(requested);
  if (path.extname(appRoot) !== ".app") {
    fail("--app must identify an extracted .app directory");
  }
  const publicRoot = path.join(appRoot, "public");
  verifyInfoPlist(appRoot, options);
  verifyPrivacyManifest(appRoot, options.profile);
  verifyReleaseIdentity(publicRoot, options);
  verifyReviewableContent(publicRoot);
  verifyPublicConfiguration(publicRoot, options.profile);
  verifyCapacitorConfiguration(appRoot);
  verifySignature(appRoot, options.allowUnsigned);
  const tree = appTreeDigest(appRoot);
  return { appRoot, tree };
}

// Keeps imports side-effect free while retaining a direct executable entry point.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = verifyReleaseApp(options);
    console.log(
      `iOS ${options.profile} app verified: version=1.2 ` +
        `build=${options.expectedBuild} source=${options.expectedSource} ` +
        `signed=${!options.allowUnsigned} files=${result.tree.files} ` +
        `treeSha256=${result.tree.sha256}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown failure";
    console.error(`iOS release app verification failed: ${message}`);
    process.exitCode = 1;
  }
}
