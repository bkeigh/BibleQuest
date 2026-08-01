#!/usr/bin/env node
/**
 * Pads every production sprite back onto the shared 128x128 canvas.
 *
 * The pixel system is built on one promise: every sprite is authored on the
 * same square, so a small thing stays small beside a large one. Call sites
 * render into a fixed box with `object-contain`, which scales whatever it is
 * given to fill that box — so a sprite exported trimmed to its own content
 * bounds arrives at the same size as everything else, and a 52-pixel stone
 * ends up as visually heavy as a 101-pixel mountain.
 *
 * This only adds transparent margin. No resampling, no colour change: every
 * authored pixel survives byte-for-byte, which is what keeps the art crisp at
 * the integer scales the registry hands it.
 *
 * Idempotent — a file already on the canvas is left alone.
 *
 *   node scripts/normalize-pixel-canvas.mjs [--check]
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DIR = path.join(process.cwd(), "public", "pixel");
const CANVAS = 128;
const checkOnly = process.argv.includes("--check");

const files = (await readdir(DIR)).filter((name) => /\.(png|gif)$/i.test(name));
const resized = [];
const alreadyRight = [];
const tooLarge = [];

for (const name of files.sort()) {
  const file = path.join(DIR, name);
  const animated = name.toLowerCase().endsWith(".gif");
  const input = await readFile(file);
  const meta = await sharp(input, animated ? { animated: true } : undefined).metadata();
  // An animated GIF reports the height of the whole filmstrip; pageHeight is
  // the frame.
  const width = meta.width ?? 0;
  const height = (animated ? meta.pageHeight : meta.height) ?? 0;

  if (width === CANVAS && height === CANVAS) {
    alreadyRight.push(name);
    continue;
  }
  if (width > CANVAS || height > CANVAS) {
    tooLarge.push(`${name} (${width}x${height})`);
    continue;
  }

  const left = Math.floor((CANVAS - width) / 2);
  const top = Math.floor((CANVAS - height) / 2);
  const extend = {
    left,
    top,
    right: CANVAS - width - left,
    bottom: CANVAS - height - top,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  };

  if (!checkOnly) {
    const pipeline = sharp(input, animated ? { animated: true } : undefined).extend(extend);
    const output = animated
      ? await pipeline.gif().toBuffer()
      : await pipeline.png({ compressionLevel: 9 }).toBuffer();
    await writeFile(file, output);
  }
  resized.push(`${name} ${width}x${height} → ${CANVAS}x${CANVAS}`);
}

if (tooLarge.length > 0) {
  console.error(
    `These sprites are larger than the ${CANVAS}px canvas and need re-authoring:\n- ${tooLarge.join("\n- ")}`,
  );
  process.exitCode = 1;
}

console.log(`${alreadyRight.length} already on the canvas.`);
if (resized.length === 0) {
  console.log("Nothing to pad.");
} else if (checkOnly) {
  console.error(`${resized.length} sprites are off the canvas:\n- ${resized.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Padded ${resized.length}:\n- ${resized.join("\n- ")}`);
}
