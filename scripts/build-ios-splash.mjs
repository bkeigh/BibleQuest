#!/usr/bin/env node

/**
 * Builds the iOS launch-screen image set from the reviewed open-book artwork.
 *
 * The storyboard owns the parchment background and responsive 256pt frame, so
 * these files contain only transparent artwork at the three device scales.
 */
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const root = process.cwd();
const source = path.join(root, "public/art/2.5d/book-open.webp");
const outputDir = path.join(
  root,
  "ios/App/App/Assets.xcassets/Splash.imageset",
);
const checkOnly = process.argv.includes("--check");

const targets = [
  { file: "book-open-256.png", size: 256 },
  { file: "book-open-512.png", size: 512 },
  { file: "book-open-768.png", size: 768 },
];

const retired = [
  "splash-2732x2732.png",
  "splash-2732x2732-1.png",
  "splash-2732x2732-2.png",
];

/** Produces one transparent, palette-optimized scale from the checked-in art. */
async function render(size) {
  return sharp(source)
    .resize(size, size, {
      fit: "contain",
      kernel: sharp.kernel.lanczos3,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    // A 256-color adaptive palette preserves the illustrated source while
    // avoiding roughly half a megabyte of redundant true-color launch data.
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: true,
      quality: 100,
      colors: 256,
      dither: 0.5,
      effort: 10,
    })
    .toBuffer();
}

/** Reports a deterministic mismatch without rewriting a release checkout. */
async function verify(file, expected) {
  let actual;
  try {
    actual = await readFile(file);
  } catch {
    throw new Error(`Missing generated iOS splash asset: ${path.basename(file)}`);
  }
  if (!actual.equals(expected)) {
    throw new Error(`Stale generated iOS splash asset: ${path.basename(file)}`);
  }
}

await mkdir(outputDir, { recursive: true });
for (const { file, size } of targets) {
  const output = path.join(outputDir, file);
  const bytes = await render(size);
  if (checkOnly) {
    await verify(output, bytes);
  } else {
    await writeFile(output, bytes);
  }
}

for (const file of retired) {
  const output = path.join(outputDir, file);
  if (checkOnly) {
    try {
      await access(output);
      throw new Error(`Retired Capacitor splash asset remains: ${file}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  } else {
    await unlink(output).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}

process.stdout.write(
  checkOnly
    ? "iOS open-book splash assets are current\n"
    : "iOS open-book splash assets regenerated\n",
);
