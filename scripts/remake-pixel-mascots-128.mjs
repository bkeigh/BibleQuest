#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SOURCE_DIR = "/Users/brendankenney/Development/BibleQuest/public/pixel";
const OUTPUT_DIR =
  "/Users/brendankenney/Pictures/Assets-BibleQuest/.pixel-remake-work/mascots";
const REVIEW_DIR = path.join(OUTPUT_DIR, "_review");
const SIZE = 128;

const PNG_NAMES = [
  "dove.png",
  "mascot-campfire.png",
  "mascot-key.png",
  "mascot-lamb.png",
  "mascot-lantern.png",
  "mascot-map.png",
  "mascot-scroll.png",
  "mascot-sprout.png",
];

const GIF_NAMES = [
  "mascot-campfire-burn.gif",
  "mascot-lamb-walk.gif",
];

// This compact shared palette removes near-duplicate colors while retaining the warm BibleQuest identity.
const PALETTE = [
  [0x00, 0x00, 0x00],
  [0x31, 0x15, 0x04],
  [0x5e, 0x2c, 0x01],
  [0x7a, 0x3e, 0x03],
  [0x95, 0x51, 0x07],
  [0xb1, 0x66, 0x0f],
  [0xd1, 0x4d, 0x01],
  [0xf2, 0x94, 0x07],
  [0xf9, 0xad, 0x0f],
  [0xfd, 0xd8, 0x35],
  [0xdf, 0x98, 0x3e],
  [0xf7, 0xcd, 0x86],
  [0xfe, 0xf5, 0xd4],
  [0x27, 0x4e, 0x02],
  [0x63, 0x77, 0x07],
  [0x9a, 0xa6, 0x2a],
];

// This converts sRGB channel values into linear-light values for perceptual palette matching.
function linearize(channel) {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

// This converts an RGB triplet to CIE Lab so nearby warm tones are consolidated predictably.
function rgbToLab([red, green, blue]) {
  const r = linearize(red);
  const g = linearize(green);
  const b = linearize(blue);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const pivot = (value) =>
    value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const fx = pivot(x);
  const fy = pivot(y);
  const fz = pivot(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const PALETTE_LAB = PALETTE.map(rgbToLab);

// This maps a source color to the nearest canonical palette entry without dithering.
function nearestPaletteColor(red, green, blue) {
  if (red < 20 && green < 20 && blue < 20) return PALETTE[0];
  const [l, a, b] = rgbToLab([red, green, blue]);
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < PALETTE_LAB.length; index += 1) {
    const [pl, pa, pb] = PALETTE_LAB[index];
    const distance = (l - pl) ** 2 + (a - pa) ** 2 + (b - pb) ** 2;
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return PALETTE[best];
}

// This returns the four cardinal neighbors used to define a crisp exterior contour.
function cardinalNeighbors(x, y) {
  return [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];
}

// This fills only one-pixel alpha pinholes surrounded by the subject, leaving intentional openings intact.
function fillSinglePixelPinholes(data) {
  const output = Buffer.from(data);
  for (let y = 1; y < SIZE - 1; y += 1) {
    for (let x = 1; x < SIZE - 1; x += 1) {
      const index = (y * SIZE + x) * 4;
      if (data[index + 3] !== 0) continue;
      const opaqueCardinals = cardinalNeighbors(x, y).filter(([nx, ny]) => {
        return data[(ny * SIZE + nx) * 4 + 3] === 255;
      });
      if (opaqueCardinals.length !== 4) continue;
      output[index] = 0;
      output[index + 1] = 0;
      output[index + 2] = 0;
      output[index + 3] = 255;
    }
  }
  return output;
}

// This remaps colors and mathematically guarantees a one-pixel exact-black exterior boundary.
function cleanFrame(input) {
  const binary = Buffer.from(input);
  for (let index = 0; index < binary.length; index += 4) {
    const alpha = binary[index + 3] >= 128 ? 255 : 0;
    binary[index + 3] = alpha;
    if (alpha === 0) {
      binary[index] = 0;
      binary[index + 1] = 0;
      binary[index + 2] = 0;
    }
  }

  const repaired = fillSinglePixelPinholes(binary);
  const output = Buffer.from(repaired);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const index = (y * SIZE + x) * 4;
      if (repaired[index + 3] === 0) continue;
      const isBoundary = cardinalNeighbors(x, y).some(([nx, ny]) => {
        return (
          nx < 0 ||
          ny < 0 ||
          nx >= SIZE ||
          ny >= SIZE ||
          repaired[(ny * SIZE + nx) * 4 + 3] === 0
        );
      });
      const [red, green, blue] = isBoundary
        ? PALETTE[0]
        : nearestPaletteColor(
            repaired[index],
            repaired[index + 1],
            repaired[index + 2],
          );
      output[index] = red;
      output[index + 1] = green;
      output[index + 2] = blue;
      output[index + 3] = 255;
    }
  }
  return output;
}

// This calculates a reproducible SHA-256 digest without changing source metadata.
async function sha256(filePath) {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

// This counts colors, alpha values, coverage, and exterior outline compliance for QA.
function inspectFrame(data) {
  const colors = new Set();
  const alphas = new Set();
  let opaquePixels = 0;
  let boundaryPixels = 0;
  let blackBoundaryPixels = 0;
  let touchesBorder = false;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const index = (y * SIZE + x) * 4;
      const alpha = data[index + 3];
      alphas.add(alpha);
      if (alpha === 0) continue;
      opaquePixels += 1;
      colors.add(`${data[index]},${data[index + 1]},${data[index + 2]}`);
      if (x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1) {
        touchesBorder = true;
      }
      const isBoundary = cardinalNeighbors(x, y).some(([nx, ny]) => {
        return (
          nx < 0 ||
          ny < 0 ||
          nx >= SIZE ||
          ny >= SIZE ||
          data[(ny * SIZE + nx) * 4 + 3] === 0
        );
      });
      if (!isBoundary) continue;
      boundaryPixels += 1;
      if (
        data[index] === 0 &&
        data[index + 1] === 0 &&
        data[index + 2] === 0
      ) {
        blackBoundaryPixels += 1;
      }
    }
  }
  return {
    colors: colors.size,
    alphaValues: [...alphas].sort((a, b) => a - b),
    opaquePixels,
    boundaryPixels,
    blackBoundaryPixels,
    blackBoundaryRatio:
      boundaryPixels === 0 ? 1 : blackBoundaryPixels / boundaryPixels,
    transparentOuterBorder: !touchesBorder,
  };
}

// This rebuilds one still directly from its native 128×128 raster.
async function rebuildPng(name) {
  const sourcePath = path.join(SOURCE_DIR, name);
  const outputPath = path.join(OUTPUT_DIR, name);
  const metadata = await sharp(sourcePath).metadata();
  if (metadata.width !== SIZE || metadata.height !== SIZE) {
    throw new Error(`${name} is not a native ${SIZE}x${SIZE} source`);
  }
  const { data } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = cleanFrame(data);
  await sharp(output, {
    raw: { width: SIZE, height: SIZE, channels: 4 },
  })
    .png({ palette: true, colors: 16, dither: 0, effort: 10 })
    .toFile(outputPath);
  const decoded = await sharp(outputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    name,
    sourceSha256: await sha256(sourcePath),
    outputSha256: await sha256(outputPath),
    width: SIZE,
    height: SIZE,
    frames: 1,
    qa: inspectFrame(decoded.data),
  };
}

// This rebuilds every GIF frame on the same fixed canvas and encodes full frames with one shared palette.
async function rebuildGif(name) {
  const sourcePath = path.join(SOURCE_DIR, name);
  const outputPath = path.join(OUTPUT_DIR, name);
  const metadata = await sharp(sourcePath, { animated: true }).metadata();
  if (
    metadata.width !== SIZE ||
    metadata.pageHeight !== SIZE ||
    !metadata.pages
  ) {
    throw new Error(`${name} does not contain native ${SIZE}x${SIZE} frames`);
  }
  const { data } = await sharp(sourcePath, { animated: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const frames = [];
  for (let frame = 0; frame < metadata.pages; frame += 1) {
    const start = frame * SIZE * SIZE * 4;
    const end = start + SIZE * SIZE * 4;
    frames.push(cleanFrame(data.subarray(start, end)));
  }
  const stacked = Buffer.concat(frames);
  await sharp(stacked, {
    raw: {
      width: SIZE,
      height: SIZE * frames.length,
      channels: 4,
      pageHeight: SIZE,
    },
  })
    .gif({
      colors: 16,
      effort: 10,
      dither: 0,
      loop: metadata.loop ?? 0,
      delay: metadata.delay ?? 150,
      reuse: true,
    })
    .toFile(outputPath);

  const rebuiltMetadata = await sharp(outputPath, {
    animated: true,
  }).metadata();
  const rebuilt = await sharp(outputPath, { animated: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const frameQa = [];
  for (let frame = 0; frame < rebuiltMetadata.pages; frame += 1) {
    const start = frame * SIZE * SIZE * 4;
    const end = start + SIZE * SIZE * 4;
    frameQa.push(inspectFrame(rebuilt.data.subarray(start, end)));
  }
  return {
    name,
    sourceSha256: await sha256(sourcePath),
    outputSha256: await sha256(outputPath),
    width: rebuiltMetadata.width,
    height: rebuiltMetadata.pageHeight,
    frames: rebuiltMetadata.pages,
    delayMs: rebuiltMetadata.delay,
    loop: rebuiltMetadata.loop,
    registration: "fixed 128x128 frame origin; no frame translation applied",
    qa: frameQa,
  };
}

// This makes a nearest-neighbor review sheet with source and remake columns.
async function buildReviewSheet() {
  const tileSize = 256;
  const gap = 16;
  const rowHeight = tileSize + gap;
  const width = tileSize * 2 + gap * 3;
  const height = PNG_NAMES.length * rowHeight + gap;
  const composites = [];
  for (let row = 0; row < PNG_NAMES.length; row += 1) {
    const name = PNG_NAMES[row];
    const source = await sharp(path.join(SOURCE_DIR, name))
      .resize(tileSize, tileSize, { kernel: "nearest" })
      .png()
      .toBuffer();
    const output = await sharp(path.join(OUTPUT_DIR, name))
      .resize(tileSize, tileSize, { kernel: "nearest" })
      .png()
      .toBuffer();
    composites.push(
      { input: source, left: gap, top: gap + row * rowHeight },
      {
        input: output,
        left: tileSize + gap * 2,
        top: gap + row * rowHeight,
      },
    );
  }
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 58, g: 78, b: 86, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(REVIEW_DIR, "mascots-source-left-remake-right.png"));
}

// This lays every rebuilt animation frame on one strip so registration and intended motion are easy to review.
async function buildGifContactSheet(name) {
  const filePath = path.join(OUTPUT_DIR, name);
  const metadata = await sharp(filePath, { animated: true }).metadata();
  const { data } = await sharp(filePath, { animated: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const scale = 2;
  const tileSize = SIZE * scale;
  const gap = 8;
  const composites = [];
  for (let frame = 0; frame < metadata.pages; frame += 1) {
    const start = frame * SIZE * SIZE * 4;
    const end = start + SIZE * SIZE * 4;
    const tile = await sharp(Buffer.from(data.subarray(start, end)), {
      raw: { width: SIZE, height: SIZE, channels: 4 },
    })
      .resize(tileSize, tileSize, { kernel: "nearest" })
      .png()
      .toBuffer();
    composites.push({
      input: tile,
      left: gap + frame * (tileSize + gap),
      top: gap,
    });
  }
  await sharp({
    create: {
      width: gap + metadata.pages * (tileSize + gap),
      height: tileSize + gap * 2,
      channels: 4,
      background: { r: 58, g: 78, b: 86, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(REVIEW_DIR, name.replace(".gif", "-frames.png")));
}

// This verifies the assigned catalogue before producing any output.
async function validateInputs() {
  const names = new Set(await readdir(SOURCE_DIR));
  for (const expected of [...PNG_NAMES, ...GIF_NAMES]) {
    if (!names.has(expected)) throw new Error(`Missing source asset: ${expected}`);
  }
}

// This runs the complete direct-grid rebuild and writes a machine-readable QA report.
async function main() {
  await validateInputs();
  await mkdir(REVIEW_DIR, { recursive: true });
  const results = [];
  for (const name of PNG_NAMES) results.push(await rebuildPng(name));
  for (const name of GIF_NAMES) results.push(await rebuildGif(name));
  await buildReviewSheet();
  for (const name of GIF_NAMES) await buildGifContactSheet(name);
  const report = {
    method:
      "Direct native 128x128 RGBA remap; no resize, resampling, model generation, or compression from a larger canvas.",
    palette:
      "One shared 16-color BibleQuest palette, exact-black exterior contour, no dithering.",
    outputDirectory: OUTPUT_DIR,
    files: results.length,
    pngs: PNG_NAMES.length,
    gifs: GIF_NAMES.length,
    results,
  };
  await writeFile(
    path.join(REVIEW_DIR, "mascots-qa.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

await main();
