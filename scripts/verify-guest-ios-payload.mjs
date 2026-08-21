#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findGuestAccountArtifactViolation } from "../src/lib/sync/guest-account-artifact-contract.mjs";
import {
  GUEST_RELEASE_OVERLAYS,
  GUEST_RELEASE_PROVENANCE_CONTRACT,
} from "../src/lib/sync/guest-release-overlays.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagedOutput = path.join(repo, ".native/out");
const output = path.join(repo, "out-native");
const publicPayload = path.join(repo, "ios/App/App/public");
const provenancePath = path.join(repo, ".native/guest-release-provenance.json");
const selectedPrivacy = path.join(repo, "ios/App/App/PrivacyInfo.xcprivacy");
const guestPrivacy = path.join(
  repo,
  "ios/compliance/PrivacyInfo.guest.xcprivacy",
);
const CAPACITOR_GENERATED_EXTRAS = Object.freeze([
  "cordova.js",
  "cordova_plugins.js",
]);

/** Walks one generated tree and returns normalized relative paths. */
function filesBelow(root, directory = root) {
  const files = new Map();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      fail(
        `generated tree contains a symbolic link at ${path.relative(root, target)}`,
      );
    } else if (entry.isDirectory()) {
      for (const [relative, nested] of filesBelow(root, target)) {
        files.set(relative, nested);
      }
    } else if (entry.isFile()) {
      files.set(path.relative(root, target).split(path.sep).join("/"), target);
    }
  }
  return files;
}

/** Proves the builder completed the reviewed release-only staging path. */
function verifyGuestReleaseProvenance() {
  let record;
  try {
    record = JSON.parse(readFileSync(provenancePath, "utf8"));
  } catch {
    fail("guest release provenance is missing or invalid");
  }
  const exactKeys = ["contract", "mode", "overlayCount"];
  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record) ||
    Object.keys(record).sort().join("\n") !== exactKeys.sort().join("\n") ||
    record.contract !== GUEST_RELEASE_PROVENANCE_CONTRACT ||
    record.mode !== "release" ||
    record.overlayCount !== GUEST_RELEASE_OVERLAYS.length
  ) {
    fail("guest release provenance does not match the reviewed build path");
  }
}

/** Proves every staged account boundary is the reviewed guest implementation. */
function verifyGuestOverlays() {
  for (const [source, destination] of GUEST_RELEASE_OVERLAYS) {
    try {
      if (
        sha256(path.join(repo, source)) !==
        sha256(path.join(repo, ".native", destination))
      ) {
        fail(`the staged guest overlay changed ${destination}`);
      }
    } catch {
      fail(`the staged guest overlay is missing ${destination}`);
    }
  }
}

/** Produces a stable digest without exposing generated file contents. */
function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** Stops preparation before Xcode can archive an unreviewed guest web payload. */
function fail(message) {
  process.stderr.write(`\n[ios:guest-payload] ${message}\n\n`);
  process.exit(1);
}

/** Scans every output byte, including Capacitor's two generated bridge files. */
function verifyOperationalMarkersAbsent(files, label) {
  for (const [relative, file] of files) {
    const violation = findGuestAccountArtifactViolation(
      readFileSync(file).toString("utf8"),
    );
    if (violation) {
      fail(`${label} contains forbidden account machinery (${violation}) in ${relative}`);
    }
  }
}

/** Proves Capacitor copied the reviewed web payload without changing a byte. */
function verifyMirroredPayload(outputFiles, publicFiles) {
  for (const [relative, source] of outputFiles) {
    const copied = publicFiles.get(relative);
    if (!copied) fail(`the iOS payload is missing ${relative}`);
    if (sha256(source) !== sha256(copied)) {
      fail(`the iOS payload changed ${relative}`);
    }
  }
  const extras = [...publicFiles.keys()]
    .filter((relative) => !outputFiles.has(relative))
    .sort();
  if (
    extras.length !== CAPACITOR_GENERATED_EXTRAS.length ||
    extras.some((relative, index) => relative !== CAPACITOR_GENERATED_EXTRAS[index])
  ) {
    fail("the iOS payload contains an unreviewed generated file");
  }
}

/** Proves the published web tree is exactly the one built in guest staging. */
function verifyPublishedStage(stagedFiles, outputFiles) {
  for (const [relative, source] of stagedFiles) {
    const published = outputFiles.get(relative);
    if (!published) fail(`the published native output is missing ${relative}`);
    if (sha256(source) !== sha256(published)) {
      fail(`the published native output changed ${relative}`);
    }
  }
  if (stagedFiles.size !== outputFiles.size) {
    fail("the published native output contains an unreviewed file");
  }
}

/** Verifies the copied guest web payload and its selected privacy manifest. */
function main() {
  let stagedFiles;
  let outputFiles;
  let publicFiles;
  try {
    stagedFiles = filesBelow(stagedOutput);
    outputFiles = filesBelow(output);
    publicFiles = filesBelow(publicPayload);
  } catch {
    fail("run the full guest iOS preparation command before verification");
  }
  if (stagedFiles.size === 0 || outputFiles.size === 0 || publicFiles.size === 0) {
    fail("the guest web payload is empty");
  }
  verifyGuestReleaseProvenance();
  verifyGuestOverlays();
  verifyPublishedStage(stagedFiles, outputFiles);
  verifyMirroredPayload(outputFiles, publicFiles);
  verifyOperationalMarkersAbsent(outputFiles, "native output");
  verifyOperationalMarkersAbsent(publicFiles, "copied iOS payload");
  if (sha256(selectedPrivacy) !== sha256(guestPrivacy)) {
    fail("the selected iOS privacy manifest is not the reviewed guest manifest");
  }
  process.stdout.write(
    `[ios:guest-payload] verified release provenance, ${GUEST_RELEASE_OVERLAYS.length} guest overlays, ${outputFiles.size} mirrored web files, ${CAPACITOR_GENERATED_EXTRAS.length} reviewed Capacitor bridge files, no emitted web account machinery, and the guest privacy manifest; native Swift is outside this web-payload check\n`,
  );
}

main();
