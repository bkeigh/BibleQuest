#!/usr/bin/env node
/**
 * Fails closed on an account-enabled United States iOS release package.
 *
 * The account builder owns the prepared receipt. A release owner separately
 * supplies an attestation copied from the checked-in example; keeping those
 * inputs independent prevents a build flag from claiming App Store Connect or
 * provider facts that only a human can verify.
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policyPath = path.join(repo, "config/ios-account-us-release.json");
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".svg",
  ".txt",
  ".xml",
]);
const URL_LITERAL = /https?:\/\/[^\s"'`<>\\]+/g;
const HTML_NAVIGATION_LITERAL =
  /\b(?:href|action)\s*=\s*["'](https?:\/\/[^"'<>]+)["']/gi;
const SCRIPT_NAVIGATION_LITERAL =
  /\b(?:window\.open|location\.assign|Browser\.open)\s*\(\s*["'](https?:\/\/[^"']+)["']/g;
const COMMIT = /^[a-f0-9]{40}$/;

/** Markers that cannot exist in a reviewed public account artifact. */
const FORBIDDEN_MARKERS = [
  ["analytics transport", "plausible.io/api/event"],
  ["analytics transport", "google-analytics.com/g/collect"],
  ["analytics transport", "api.segment.io"],
  ["analytics transport", "api.mixpanel.com"],
  ["analytics transport", "app.posthog.com"],
  ["embedded Stripe form", "js.stripe.com/v3"],
  ["embedded Stripe form", "PaymentElement"],
  ["embedded Stripe form", "CardElement"],
  ["embedded Stripe form", "stripe.elements("],
  ["embedded Stripe form", "stripe.confirmPayment("],
  ["Vercel preview host", ".vercel.app"],
  ["staging host", "native-staging.biblequest.co"],
];

/** Secret-looking provider prefixes are forbidden even when a value is test-only. */
const SECRET_MARKERS = [
  /\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9]{8,}/,
  /\bpk_(?:test|live)_[A-Za-z0-9]{8,}/,
  /\bwhsec_[A-Za-z0-9]{8,}/,
  /\bservice_role\.[A-Za-z0-9_-]{8,}/,
];

/** Reads JSON without ever echoing its potentially private contents. */
function readJson(file, issues, label) {
  if (!file || !existsSync(file)) {
    issues.push(`${label} is missing at ${file || "(not provided)"}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    issues.push(`${label} is not valid JSON`);
    return null;
  }
}

/** Parses only the explicit path switches used by the release command. */
function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--artifact", "--privacy", "--attestation"].includes(argument)) {
      throw new Error(`unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a path`);
    }
    values[argument.slice(2)] = path.resolve(value);
    index += 1;
  }
  return values;
}

/** Walks only regular prepared-artifact files and ignores symlink targets. */
function artifactFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...artifactFiles(target));
    else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(target);
    }
  }
  return files;
}

/** Converts a URL literal to one comparison-safe HTTP origin. */
function literalOrigin(value) {
  const candidate = value.replace(/[),.;\]}]+$/, "");
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/** Reveals common build-time slash escaping before marker and URL scans. */
function normalizedArtifactText(value) {
  return value
    .replaceAll("\\/", "/")
    .replace(/\\u002f/gi, "/")
    .replace(/\\x2f/gi, "/")
    .replace(/&#x2f;|&#47;/gi, "/");
}

/** Accepts one undecorated HTTPS origin and no wildcard-like placeholders. */
function exactHttpsOrigin(value) {
  if (typeof value !== "string" || value.includes("*") || /pending/i.test(value)) {
    return null;
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.origin !== value ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/** Compares an array as an exact set while rejecting duplicates. */
function exactSet(value, expected) {
  if (!Array.isArray(value) || new Set(value).size !== value.length) return false;
  return value.length === expected.length && expected.every((item) => value.includes(item));
}

/** Validates the receipt emitted by the separate account preparation path. */
function checkReceipt(receipt, policy, issues) {
  if (!receipt) return;
  if (receipt.schemaVersion !== policy.schemaVersion) {
    issues.push("prepared receipt schema does not match the release policy");
  }
  if (receipt.profile !== policy.profile) {
    issues.push("prepared receipt is not the account-enabled US profile");
  }
  if (!COMMIT.test(receipt.commit ?? "")) {
    issues.push("prepared receipt has no full commit SHA");
  }
  if (receipt.accountEnabled !== true) {
    issues.push("prepared receipt does not enable accounts");
  }
  if (receipt.privacyProfile !== policy.privacyAnswersProfile) {
    issues.push("prepared receipt still uses guest privacy answers");
  }
  if (receipt.analyticsEnabled !== false) {
    issues.push("prepared receipt does not pin analytics off");
  }
  if (receipt.aiEnabled !== false) {
    issues.push("prepared receipt does not pin AI off");
  }
  if (receipt.backendEnvironment !== "reviewed-production") {
    issues.push("prepared receipt is not bound to the reviewed production backend");
  }
  if (exactHttpsOrigin(receipt.backendOrigin) !== "https://www.biblequest.co") {
    issues.push("prepared receipt has the wrong BibleQuest backend origin");
  }
  if (!exactHttpsOrigin(receipt.supabaseOrigin)) {
    issues.push("prepared receipt has no exact production Supabase origin");
  }

  const commerce = receipt.commerce ?? {};
  if (commerce.purchaseUIEnabled !== true) {
    issues.push("prepared receipt does not identify the reviewed purchase UI");
  }
  if (commerce.storefrontSource !== "StoreKit.Storefront.current.countryCode") {
    issues.push("purchase eligibility is not sourced only from StoreKit storefront state");
  }
  if (!exactSet(commerce.eligibleCountryCodes, policy.requiredStorefronts)) {
    issues.push("purchase UI is not limited to the United States storefront");
  }
  if (commerce.failClosed !== true || commerce.usesIpLocaleOrUserCountry !== false) {
    issues.push("purchase storefront eligibility does not fail closed");
  }
  if (commerce.storeKitPurchasing !== false) {
    issues.push("the account-US profile must not use StoreKit purchasing");
  }
  if (
    commerce.checkoutPresentation !== "system-browser" ||
    commerce.embeddedPaymentForm !== false
  ) {
    issues.push("Stripe Checkout is not constrained to the system browser");
  }
  if (commerce.entitlementAuthority !== "server") {
    issues.push("the prepared receipt does not keep Plus server-authoritative");
  }
  if (!Array.isArray(receipt.externalNavigationOrigins)) {
    issues.push("prepared receipt has no external navigation origin contract");
  } else {
    if (
      new Set(receipt.externalNavigationOrigins).size !==
      receipt.externalNavigationOrigins.length
    ) {
      issues.push("prepared receipt has duplicate external navigation origins");
    }
    for (const value of receipt.externalNavigationOrigins) {
      if (!exactHttpsOrigin(value)) {
        issues.push("prepared receipt has a non-exact external navigation origin");
      }
    }
    for (const required of policy.requiredExternalOrigins) {
      if (!receipt.externalNavigationOrigins.includes(required)) {
        issues.push(`prepared receipt omits required navigation origin: ${required}`);
      }
    }
  }
}

/** Validates facts that cannot be derived from the binary or repository. */
function checkAttestation(attestation, receipt, policy, issues) {
  if (!attestation) return new Set();
  if (
    attestation.schemaVersion !== policy.schemaVersion ||
    attestation.profile !== policy.profile
  ) {
    issues.push("release attestation does not match the account-US policy");
  }
  if (!COMMIT.test(attestation.commit ?? "") || attestation.commit !== receipt?.commit) {
    issues.push("release attestation and prepared receipt do not name the same commit");
  }

  const appStore = attestation.appStoreConnect ?? {};
  if (!exactSet(appStore.storefronts, policy.requiredStorefronts)) {
    issues.push("App Store Connect availability is not United States only");
  }
  if (appStore.automaticallyIncludeFutureStorefronts !== false) {
    issues.push("future App Store storefronts are not explicitly excluded");
  }
  if (appStore.privacyAnswersProfile !== policy.privacyAnswersProfile) {
    issues.push("App Store Connect still uses guest privacy answers");
  }
  if (appStore.manualRelease !== true) {
    issues.push("App Store Connect is not set to manual release");
  }

  const providers = attestation.providers ?? {};
  if (providers.stripeMode !== "live") {
    issues.push("Stripe live-mode release objects have not been confirmed");
  }
  if (providers.stripeTestObjectsSeparated !== true) {
    issues.push("Stripe test and production object separation is not attested");
  }
  for (const field of [
    "supabasePlan",
    "supabaseBackupRetentionDays",
    "supabaseLogRetentionDays",
  ]) {
    if (
      providers[field] === undefined ||
      providers[field] === null ||
      String(providers[field]).trim() === "" ||
      /pending/i.test(String(providers[field]))
    ) {
      issues.push(`provider retention fact is unresolved: ${field}`);
    }
  }

  for (const check of policy.requiredReviewChecks) {
    if (attestation.review?.[check] !== true) {
      issues.push(`manual release check is incomplete: ${check}`);
    }
  }

  const origins = new Set();
  if (!Array.isArray(attestation.reviewedExternalOrigins)) {
    issues.push("reviewed external origin allowlist is missing");
  } else {
    for (const value of attestation.reviewedExternalOrigins) {
      const origin = exactHttpsOrigin(value);
      if (!origin) issues.push("reviewed external origin is not one exact HTTPS origin");
      else origins.add(origin);
    }
    if (origins.size !== attestation.reviewedExternalOrigins.length) {
      issues.push("reviewed external origin allowlist contains duplicates");
    }
  }
  for (const required of [
    ...policy.requiredExternalOrigins,
    ...(receipt?.externalNavigationOrigins ?? []),
    receipt?.supabaseOrigin,
  ].filter(Boolean)) {
    if (!origins.has(required)) {
      issues.push(`required external origin has not been reviewed: ${required}`);
    }
  }
  return origins;
}

/** Checks the selected manifest, not the dormant account template. */
function checkPrivacyManifest(file, policy, issues) {
  if (!file || !existsSync(file)) {
    issues.push(`selected privacy manifest is missing at ${file || "(not provided)"}`);
    return;
  }
  const manifest = readFileSync(file, "utf8");
  if (!/<key>NSPrivacyTracking<\/key>\s*<false\/>/.test(manifest)) {
    issues.push("selected privacy manifest does not pin tracking false");
  }
  if (/shipping build is\s+guest-only/i.test(manifest)) {
    issues.push("selected privacy manifest still describes a guest-only build");
  }
  for (const dataType of policy.requiredPrivacyDataTypes) {
    const marker = `<string>${dataType}</string>`;
    const index = manifest.indexOf(marker);
    if (index === -1) {
      issues.push(`selected privacy manifest omits ${dataType}`);
      continue;
    }
    const start = manifest.lastIndexOf("<dict>", index);
    const end = manifest.indexOf("</dict>", index);
    const block = start >= 0 && end >= 0 ? manifest.slice(start, end) : "";
    if (!/<key>NSPrivacyCollectedDataTypeLinked<\/key>\s*<true\/>/.test(block)) {
      issues.push(`${dataType} is not declared linked to the account`);
    }
    if (!/<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<false\/>/.test(block)) {
      issues.push(`${dataType} is not declared tracking-free`);
    }
    if (!block.includes("NSPrivacyCollectedDataTypePurposeAppFunctionality")) {
      issues.push(`${dataType} has no App Functionality purpose`);
    }
  }
  if (
    !manifest.includes("NSPrivacyAccessedAPICategoryFileTimestamp") ||
    !manifest.includes("C617.1")
  ) {
    issues.push("selected privacy manifest lost the native file-timestamp reason");
  }
}

/** Scans the prepared static payload for forbidden behavior and new origins. */
function checkArtifact(directory, reviewedOrigins, issues) {
  if (!directory || !existsSync(directory) || !statSync(directory).isDirectory()) {
    issues.push(`prepared artifact directory is missing at ${directory || "(not provided)"}`);
    return { files: 0, origins: new Set() };
  }
  const discoveredOrigins = new Set();
  const navigationOrigins = new Set();
  const files = artifactFiles(directory);
  for (const file of files) {
    const relative = path.relative(directory, file);
    const contents = normalizedArtifactText(readFileSync(file, "utf8"));
    const lower = contents.toLowerCase();
    for (const [label, marker] of FORBIDDEN_MARKERS) {
      if (lower.includes(marker.toLowerCase())) {
        issues.push(`${label} marker found in ${relative}`);
      }
    }
    for (const secret of SECRET_MARKERS) {
      if (secret.test(contents)) issues.push(`provider secret marker found in ${relative}`);
    }
    for (const literal of contents.match(URL_LITERAL) ?? []) {
      const origin = literalOrigin(literal);
      if (origin) discoveredOrigins.add(origin);
    }
    if (path.extname(file) === ".html") {
      for (const match of contents.matchAll(HTML_NAVIGATION_LITERAL)) {
        const origin = literalOrigin(match[1]);
        if (origin) navigationOrigins.add(origin);
      }
    }
    if ([".js", ".mjs"].includes(path.extname(file))) {
      for (const match of contents.matchAll(SCRIPT_NAVIGATION_LITERAL)) {
        const origin = literalOrigin(match[1]);
        if (origin) navigationOrigins.add(origin);
      }
    }
  }

  for (const origin of discoveredOrigins) {
    const host = new URL(origin).hostname.toLowerCase();
    if (host.includes("staging") || host.includes("preview") || host.endsWith(".vercel.app")) {
      issues.push(`staging or preview origin found in artifact: ${origin}`);
    }
  }
  for (const origin of navigationOrigins) {
    if (!reviewedOrigins.has(origin)) {
      issues.push(`artifact contains an unreviewed external origin: ${origin}`);
    }
  }
  return { files: files.length, origins: discoveredOrigins };
}

/** Runs every automated and human-evidence gate for one prepared release. */
export function checkAccountUsRelease({ artifact, privacy, attestation }) {
  const issues = [];
  const policy = readJson(policyPath, issues, "release policy");
  if (!policy) return { issues, files: 0, origins: 0 };
  const receiptPath = artifact
    ? path.join(artifact, policy.receiptFile)
    : path.join(repo, "out-native", policy.receiptFile);
  const receipt = readJson(receiptPath, issues, "prepared receipt");
  const ownerAttestation = readJson(attestation, issues, "release attestation");
  checkReceipt(receipt, policy, issues);
  const reviewedOrigins = checkAttestation(
    ownerAttestation,
    receipt,
    policy,
    issues,
  );
  checkPrivacyManifest(privacy, policy, issues);
  const scan = checkArtifact(artifact, reviewedOrigins, issues);
  return { issues, files: scan.files, origins: scan.origins.size };
}

/** Provides one stable command for CI and the manual release checklist. */
function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[ios-account-us-release] HOLD\n- ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const result = checkAccountUsRelease(options);
  if (result.issues.length > 0) {
    process.stderr.write(
      `[ios-account-us-release] HOLD (${result.issues.length} issue${
        result.issues.length === 1 ? "" : "s"
      })\n${result.issues.map((issue) => `- ${issue}`).join("\n")}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `[ios-account-us-release] PASS files=${result.files} origins=${result.origins}\n`,
  );
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main();
}
