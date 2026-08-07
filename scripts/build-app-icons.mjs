#!/usr/bin/env node

/**
 * Regenerates the web/PWA icon set from the iOS Icon Composer source.
 *
 * `ios/App/App/AppIcon.icon` is the single source of truth for app identity:
 * Xcode 26 compiles it natively for iOS (including the tinted, dark and glass
 * variants), but the web manifest needs flat PNGs, and the largest raster iOS
 * embeds is 180px — too small for a 512px maskable icon. So the flat set is
 * recomposited here from the same layer art rather than upscaled.
 *
 * The gradient endpoints are sampled from Xcode's own compiled output, so the
 * web icons match what ships on the phone. Re-sample them if the .icon's fill
 * changes:
 *   xcrun actool <the .icon> --compile <dir> --app-icon AppIcon ...
 *
 * Usage: node scripts/build-app-icons.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const repo = process.cwd();
const SOURCE_LAYER = path.join(
  repo,
  "ios/App/App/AppIcon.icon/Assets/2.5d-BQ-book.png",
);
const OUT_DIR = path.join(repo, "public/icons");

/** Sampled from Xcode's compiled AppIcon: a vertical parchment gradient. */
const GRADIENT_TOP = "#f9e7c9";
const GRADIENT_BOTTOM = "#e1cead";

/** From icon.json: the book layer sits at 0.95 scale, nudged left and up. */
const LAYER_SCALE = 0.95;
const LAYER_DX = -3.08;
const LAYER_DY = -39.37;

/** Maskable icons must keep their art inside the safe circle iOS/Android crop to. */
const MASKABLE_SAFE_SCALE = 0.72;

function gradientSquare(size) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bq" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${GRADIENT_TOP}"/>
      <stop offset="100%" stop-color="${GRADIENT_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bq)"/>
</svg>`,
  );
}

/** Composes the flat icon at one edge length, optionally inset for masking. */
async function composeIcon(size, artScale) {
  const canvas = 1024;
  const artSize = Math.round(canvas * artScale);
  const art = await sharp(SOURCE_LAYER)
    .resize(artSize, artSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();
  const scaleRatio = artScale / LAYER_SCALE;
  const composed = await sharp(gradientSquare(canvas))
    .composite([
      {
        input: art,
        left: Math.round((canvas - artSize) / 2 + LAYER_DX * scaleRatio),
        top: Math.round((canvas - artSize) / 2 + LAYER_DY * scaleRatio),
      },
    ])
    .png()
    .toBuffer();
  return sharp(composed).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
}

const TARGETS = [
  { file: "icon-512.png", size: 512, artScale: LAYER_SCALE },
  { file: "icon-192.png", size: 192, artScale: LAYER_SCALE },
  { file: "apple-touch-icon.png", size: 180, artScale: LAYER_SCALE },
  { file: "favicon-48.png", size: 48, artScale: LAYER_SCALE },
  {
    file: "icon-maskable-512.png",
    size: 512,
    artScale: MASKABLE_SAFE_SCALE,
  },
];

await mkdir(OUT_DIR, { recursive: true });
for (const { file, size, artScale } of TARGETS) {
  const bytes = await composeIcon(size, artScale);
  await writeFile(path.join(OUT_DIR, file), bytes);
  process.stdout.write(`  wrote ${file} (${size}px, art ${artScale})\n`);
}
process.stdout.write("app icons regenerated from ios/App/App/AppIcon.icon\n");
