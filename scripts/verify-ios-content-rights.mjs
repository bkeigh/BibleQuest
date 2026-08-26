#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nativePublicMediaAllowlist } from "./lib/native-media.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const iosPublicRoot = path.join(repositoryRoot, "ios/App/App/public");
const generatedMediaRoot = path.join(iosPublicRoot, "_next/static/media");
const mediaExtension = /\.(?:gif|ico|jpe?g|png|svg|webp)$/i;

// Stops release preparation with one actionable rights-boundary error.
function fail(message) {
  console.error(`iOS content-rights verification failed: ${message}`);
  process.exit(1);
}

// Returns every file below a directory as a slash-normalized relative path.
function filesBelow(root) {
  if (!existsSync(root)) fail(`missing generated directory ${root}`);
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

// Produces the digest used for byte-for-byte source and bundle comparisons.
function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

// Requires two finite path sets to match without additions or omissions.
function assertSamePaths(actual, expected, label) {
  if (actual.join("\n") !== expected.join("\n")) {
    const expectedSet = new Set(expected);
    const actualSet = new Set(actual);
    const added = actual.filter((file) => !expectedSet.has(file));
    const missing = expected.filter((file) => !actualSet.has(file));
    fail(
      `${label} drifted; unexpected=[${added.join(", ")}], ` +
        `missing=[${missing.join(", ")}]`,
    );
  }
}

// Verifies each reviewed public image was copied into the native bundle intact.
const allowedPublicMedia = nativePublicMediaAllowlist(repositoryRoot);
const expectedPublicMedia = allowedPublicMedia
  .map((file) => file.replace(/^public\//, ""))
  .sort();
const bundledPublicMedia = filesBelow(iosPublicRoot)
  .filter((file) => !file.startsWith("_next/") && mediaExtension.test(file))
  .filter((file) => file !== "favicon.ico")
  .sort();
assertSamePaths(
  bundledPublicMedia,
  expectedPublicMedia,
  "reviewed public media",
);
for (const source of allowedPublicMedia) {
  const target = path.join(iosPublicRoot, source.replace(/^public\//, ""));
  if (sha256(path.join(repositoryRoot, source)) !== sha256(target)) {
    fail(`bundled public media differs from its reviewed source: ${source}`);
  }
}

// Requires both exported favicon copies to equal the checked-in app source.
const generatedMedia = filesBelow(generatedMediaRoot);
const generatedFavicons = generatedMedia.filter((file) => file.endsWith(".ico"));
const expectedFavicon = path.join(repositoryRoot, "src/app/favicon.ico");
const rootFavicon = path.join(iosPublicRoot, "favicon.ico");
if (generatedFavicons.length !== 1 || sha256(expectedFavicon) !== sha256(rootFavicon)) {
  fail("the exported root favicon does not match src/app/favicon.ico");
}
const generatedFavicon = path.join(generatedMediaRoot, generatedFavicons[0]);
if (sha256(expectedFavicon) !== sha256(generatedFavicon)) {
  fail("the generated hashed favicon does not match src/app/favicon.ico");
}

// Keeps the generated media directory limited to the reviewed font and icon types.
const fontFiles = generatedMedia.filter((file) => file.endsWith(".woff2"));
const expectedGeneratedMedia = [...fontFiles, ...generatedFavicons].sort();
assertSamePaths(generatedMedia, expectedGeneratedMedia, "generated media");
if (fontFiles.length !== 10) {
  fail(`expected 10 generated WOFF2 subsets, found ${fontFiles.length}`);
}

// Requires the native icon and splash source sets to remain finite and complete.
const nativeAssetGroups = [
  {
    root: "ios/App/App/AppIcon.icon/Assets",
    files: ["01-let-there-be-light.png", "2.5d-BQ-book.png", "book-open.png"],
  },
  {
    root: "ios/App/App/Assets.xcassets/Splash.imageset",
    files: ["book-open-256.png", "book-open-512.png", "book-open-768.png"],
  },
];
for (const group of nativeAssetGroups) {
  const actual = filesBelow(path.join(repositoryRoot, group.root))
    .filter((file) => mediaExtension.test(file))
    .sort();
  assertSamePaths(actual, [...group.files].sort(), group.root);
}

// Ensures the complete OFL notice is shipped byte-for-byte with the app.
const sourceNotices = path.join(repositoryRoot, "public/THIRD_PARTY_NOTICES.txt");
const bundledNotices = path.join(iosPublicRoot, "THIRD_PARTY_NOTICES.txt");
if (
  !existsSync(sourceNotices) ||
  !existsSync(bundledNotices) ||
  statSync(sourceNotices).size === 0 ||
  sha256(sourceNotices) !== sha256(bundledNotices)
) {
  fail("THIRD_PARTY_NOTICES.txt is missing or differs from its reviewed source");
}

// Emits one stable digest for the exact reviewable media/font/notices payload.
const reviewableFiles = [
  ...expectedPublicMedia.map((file) => path.join(iosPublicRoot, file)),
  rootFavicon,
  generatedFavicon,
  ...fontFiles.map((file) => path.join(generatedMediaRoot, file)),
  ...nativeAssetGroups.flatMap((group) =>
    group.files.map((file) => path.join(repositoryRoot, group.root, file)),
  ),
  bundledNotices,
];
const inventory = reviewableFiles
  .map((file) => `${path.relative(repositoryRoot, file)}\0${sha256(file)}`)
  .sort()
  .join("\n");
const inventorySha256 = createHash("sha256").update(inventory).digest("hex");
console.log(
  `iOS content-rights payload verified: ${allowedPublicMedia.length} public ` +
    `media, ${fontFiles.length} WOFF2 subsets, 2 favicons, 6 native assets, ` +
    `1 notice; inventory sha256=${inventorySha256}`,
);
