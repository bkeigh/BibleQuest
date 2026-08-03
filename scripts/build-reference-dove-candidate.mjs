/**
 * Extracts the authored BibleQuest dove grid from its presentation canvas.
 *
 * The source is already pixel art. This processor samples its original
 * 32-by-27 logical cells, removes neutral presentation pixels, restores one
 * exact-black logical contour, and centers a crisp 3x copy on a 128px canvas.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const DOVE_REFERENCE_PATH =
  "/Users/brendankenney/Pictures/Assets-BibleQuest/UI-ASSETS/BQ-UI-Dove.png";

export const REFERENCE_DOVE_PALETTE = [
  [0, 0, 0, 255],
  [255, 250, 232, 255],
  [226, 210, 176, 255],
  [164, 143, 101, 255],
  [201, 137, 0, 255],
  [33, 54, 12, 255],
  [83, 112, 17, 255],
  [148, 177, 54, 255],
];

const LOGICAL_WIDTH = 32;
const LOGICAL_HEIGHT = 27;
const OUTPUT_SIZE = 128;
const SCALE = 3;

/** Returns the squared RGB distance between one pixel and one palette color. */
function colorDistance(red, green, blue, color) {
  const redDelta = red - color[0];
  const greenDelta = green - color[1];
  const blueDelta = blue - color[2];
  return (
    redDelta * redDelta +
    greenDelta * greenDelta +
    blueDelta * blueDelta
  );
}

/** Detects neutral presentation pixels without deleting the warm-white dove. */
function isPresentationPixel(red, green, blue) {
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  return maximum - minimum <= 8 && maximum > 30;
}

/** Flood-fills only neutral presentation cells connected to the outer canvas. */
function exteriorPresentationMask(sampled) {
  const cells = LOGICAL_WIDTH * LOGICAL_HEIGHT;
  const candidates = new Uint8Array(cells);
  const exterior = new Uint8Array(cells);
  const queue = new Int32Array(cells);
  let head = 0;
  let tail = 0;
  for (let point = 0; point < cells; point += 1) {
    const offset = point * 3;
    if (
      isPresentationPixel(
        sampled[offset],
        sampled[offset + 1],
        sampled[offset + 2]
      )
    ) {
      candidates[point] = 1;
    }
    const x = point % LOGICAL_WIDTH;
    const y = Math.floor(point / LOGICAL_WIDTH);
    if (
      candidates[point] &&
      (x === 0 ||
        y === 0 ||
        x === LOGICAL_WIDTH - 1 ||
        y === LOGICAL_HEIGHT - 1)
    ) {
      exterior[point] = 1;
      queue[tail] = point;
      tail += 1;
    }
  }
  while (head < tail) {
    const point = queue[head];
    head += 1;
    const x = point % LOGICAL_WIDTH;
    const y = Math.floor(point / LOGICAL_WIDTH);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const neighborX = x + dx;
        const neighborY = y + dy;
        if (
          neighborX < 0 ||
          neighborY < 0 ||
          neighborX >= LOGICAL_WIDTH ||
          neighborY >= LOGICAL_HEIGHT
        ) {
          continue;
        }
        const neighbor = neighborY * LOGICAL_WIDTH + neighborX;
        if (candidates[neighbor] && !exterior[neighbor]) {
          exterior[neighbor] = 1;
          queue[tail] = neighbor;
          tail += 1;
        }
      }
    }
  }
  return exterior;
}

/** Detects the authored near-black contour independently from dark olive. */
function isSourceBlack(red, green, blue) {
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  return maximum < 24 || (maximum < 90 && maximum - minimum <= 14);
}

/** Maps a visible source cell to the nearest nonblack approved palette color. */
function nearestFillColor(red, green, blue) {
  return REFERENCE_DOVE_PALETTE.slice(1).reduce((best, color) =>
    colorDistance(red, green, blue, color) <
    colorDistance(red, green, blue, best)
      ? color
      : best
  );
}

/** Reports whether one visible logical cell touches transparency. */
function isLogicalBoundary(mask, x, y) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighborX = x + dx;
      const neighborY = y + dy;
      if (
        neighborX < 0 ||
        neighborY < 0 ||
        neighborX >= LOGICAL_WIDTH ||
        neighborY >= LOGICAL_HEIGHT ||
        mask[neighborY * LOGICAL_WIDTH + neighborX] === 0
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Samples and cleans the reference into its original logical dove cells. */
async function extractLogicalDove(referencePath) {
  const trimmed = await sharp(referencePath)
    .trim({
      background: { r: 255, g: 255, b: 255 },
      threshold: 12,
    })
    .png()
    .toBuffer();
  const sampled = await sharp(trimmed)
    .resize(LOGICAL_WIDTH, LOGICAL_HEIGHT, {
      fit: "fill",
      kernel: sharp.kernel.nearest,
    })
    .removeAlpha()
    .raw()
    .toBuffer();
  const presentation = exteriorPresentationMask(sampled);
  const mask = new Uint8Array(LOGICAL_WIDTH * LOGICAL_HEIGHT);
  const logical = Buffer.alloc(LOGICAL_WIDTH * LOGICAL_HEIGHT * 4);
  for (let point = 0; point < mask.length; point += 1) {
    const sourceOffset = point * 3;
    const outputOffset = point * 4;
    const red = sampled[sourceOffset];
    const green = sampled[sourceOffset + 1];
    const blue = sampled[sourceOffset + 2];
    if (presentation[point]) continue;
    mask[point] = 1;
    let color = isSourceBlack(red, green, blue)
      ? REFERENCE_DOVE_PALETTE[0]
      : nearestFillColor(red, green, blue);
    const x = point % LOGICAL_WIDTH;
    const greenIndex = REFERENCE_DOVE_PALETTE.indexOf(color);
    if (x < 21 && greenIndex >= 5) {
      color = Math.min(red, green, blue) < 130
        ? REFERENCE_DOVE_PALETTE[3]
        : REFERENCE_DOVE_PALETTE[2];
    }
    logical.set(color, outputOffset);
  }

  for (let y = 0; y < LOGICAL_HEIGHT; y += 1) {
    for (let x = 0; x < LOGICAL_WIDTH; x += 1) {
      const point = y * LOGICAL_WIDTH + x;
      if (!mask[point] || !isLogicalBoundary(mask, x, y)) continue;
      logical.set(REFERENCE_DOVE_PALETTE[0], point * 4);
    }
  }
  return logical;
}

/** Builds the transparent native-128 dove candidate from the reference grid. */
export async function buildReferenceDoveCandidate(
  referencePath = DOVE_REFERENCE_PATH
) {
  const logical = await extractLogicalDove(referencePath);
  const spriteWidth = LOGICAL_WIDTH * SCALE;
  const spriteHeight = LOGICAL_HEIGHT * SCALE;
  const sprite = await sharp(logical, {
    raw: {
      width: LOGICAL_WIDTH,
      height: LOGICAL_HEIGHT,
      channels: 4,
    },
  })
    .resize(spriteWidth, spriteHeight, {
      fit: "fill",
      kernel: sharp.kernel.nearest,
    })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: OUTPUT_SIZE,
      height: OUTPUT_SIZE,
      channels: 4,
      background: [0, 0, 0, 0],
    },
  })
    .composite([
      {
        input: sprite,
        left: Math.floor((OUTPUT_SIZE - spriteWidth) / 2),
        top: Math.floor((OUTPUT_SIZE - spriteHeight) / 2),
      },
    ])
    .raw()
    .toBuffer();
}

/** Writes an optional standalone candidate when the module is run directly. */
async function main() {
  const [output, referencePath = DOVE_REFERENCE_PATH] = process.argv.slice(2);
  if (!output) {
    throw new Error(
      "Usage: node scripts/build-reference-dove-candidate.mjs <output.png> [reference.png]"
    );
  }
  const candidate = await buildReferenceDoveCandidate(referencePath);
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await sharp(candidate, {
    raw: { width: OUTPUT_SIZE, height: OUTPUT_SIZE, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(output);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await main();
}
