/**
 * Installs the approved BibleQuest 2.5D masters as optimized runtime artwork.
 *
 * Usage:
 *   node scripts/install-2_5d-art.mjs [source-directory]
 */
import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

// Resolve the reviewed library while allowing another machine to supply it.
const sourceRoot = path.resolve(
  process.argv[2] ?? path.join(os.homedir(), "Pictures/Assets-BibleQuest/2.5D"),
);

// Keep generated runtime files inside one explicit public subtree.
const outputRoot = path.resolve("public/art/2.5d");
const candleOutputRoot = path.join(outputRoot, "candles");

// Lock the production catalogue to the reviewed static library size.
const EXPECTED_STATIC_ASSETS = 58;

// Convert a small batch in parallel so a full catalogue rebuild stays practical
// without opening all high-resolution masters in memory at once.
const CONVERSION_CONCURRENCY = 4;

// Install only the six intentional candle loops; character GIFs never ship.
const CANDLE_ANIMATIONS = [
  "candle",
  "candle-small",
  "candle-steady",
  "candle-sparks",
  "candle-halo",
  "candle-unlit",
];

// Rebuild only the known destination so stale pixel-era files cannot linger.
await rm(outputRoot, { recursive: true, force: true });
await mkdir(candleOutputRoot, { recursive: true });

// Discover root-level transparent masters while excluding review material.
const staticFiles = (await readdir(sourceRoot, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".png"))
  .map((entry) => entry.name)
  .sort();

if (staticFiles.length !== EXPECTED_STATIC_ASSETS) {
  throw new Error(
    `Expected ${EXPECTED_STATIC_ASSETS} static PNG masters, found ${staticFiles.length}`,
  );
}

// Resize high-resolution masters once and preserve soft alpha in compact WebP.
for (let start = 0; start < staticFiles.length; start += CONVERSION_CONCURRENCY) {
  const batch = staticFiles.slice(start, start + CONVERSION_CONCURRENCY);
  await Promise.all(
    batch.map((file) => {
      const input = path.join(sourceRoot, file);
      const output = path.join(outputRoot, file.replace(/\.png$/, ".webp"));
      return sharp(input)
        .resize(512, 512, {
          fit: "fill",
          kernel: sharp.kernel.lanczos3,
        })
        .webp({
          quality: 94,
          alphaQuality: 100,
          effort: 6,
          smartSubsample: true,
        })
        .toFile(output);
    }),
  );
}

// Copy the reviewed sixteen-frame candle loops byte-for-byte.
for (const name of CANDLE_ANIMATIONS) {
  const input = path.join(
    sourceRoot,
    "animations",
    "candles",
    name,
    `${name}.gif`,
  );
  await copyFile(input, path.join(candleOutputRoot, `${name}.gif`));
}

// Record enough provenance to make later visual upgrades reproducible.
await writeFile(
  path.join(outputRoot, "manifest.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      style: "hand-painted-2.5d",
      sourceLibrary: "Assets-BibleQuest/2.5D",
      staticFormat: "webp",
      staticCanvas: { width: 512, height: 512 },
      staticAssets: staticFiles.map((file) => file.replace(/\.png$/, ".webp")),
      animations: CANDLE_ANIMATIONS.map((name) => `candles/${name}.gif`),
      animationContract: {
        frames: 16,
        frameDurationMs: 100,
        loopDurationMs: 1600,
        loop: "infinite",
      },
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  `Installed ${staticFiles.length} static 2.5D assets and ${CANDLE_ANIMATIONS.length} candle loops in ${outputRoot}`,
);
