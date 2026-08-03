/**
 * Converts a generated dove concept into a strict 64px pixel-art master.
 *
 * The concept supplies composition only. This script owns the final palette,
 * alpha, outline thickness, and exact 2x enlargement to 128px production art.
 *
 * Usage:
 *   node scripts/build-dove-grid.mjs <concept.png> <master-64.png> <output-128.png>
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const LOGICAL_SIZE = 64;
const PRODUCTION_SIZE = 128;

const PALETTE = [
  [0, 0, 0, 255],
  [255, 250, 228, 255],
  [248, 233, 188, 255],
  [232, 184, 86, 255],
  [232, 91, 17, 255],
  [66, 68, 7, 255],
  [116, 112, 9, 255],
  [164, 153, 16, 255],
];

/** Identifies the removable magenta backdrop and its blended edge pixels. */
function isMagentaKey(r, g, b) {
  return r >= 115 && b >= 115 && g <= 90 && r + b >= g * 4;
}

/** Returns the squared RGB distance between one pixel and one palette entry. */
function colorDistance(r, g, b, color) {
  const red = r - color[0];
  const green = g - color[1];
  const blue = b - color[2];
  return red * red + green * green + blue * blue;
}

/** Maps one visible source pixel to the nearest approved palette entry. */
function nearestPaletteColor(r, g, b) {
  return PALETTE.reduce((best, color) =>
    colorDistance(r, g, b, color) < colorDistance(r, g, b, best)
      ? color
      : best
  );
}

/** Reports whether a logical silhouette cell touches transparent space. */
function isBoundary(mask, x, y) {
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    const nx = x + dx;
    const ny = y + dy;
    if (
      nx < 0 ||
      ny < 0 ||
      nx >= LOGICAL_SIZE ||
      ny >= LOGICAL_SIZE ||
      mask[ny * LOGICAL_SIZE + nx] === 0
    ) {
      return true;
    }
  }
  return false;
}

/** Fills isolated transparent pinholes without changing the outer silhouette. */
function fillPinholes(mask) {
  const output = Uint8Array.from(mask);
  for (let y = 1; y < LOGICAL_SIZE - 1; y += 1) {
    for (let x = 1; x < LOGICAL_SIZE - 1; x += 1) {
      const point = y * LOGICAL_SIZE + x;
      if (mask[point] !== 0) continue;
      const filledNeighbors = [
        point - 1,
        point + 1,
        point - LOGICAL_SIZE,
        point + LOGICAL_SIZE,
      ].filter((neighbor) => mask[neighbor] !== 0).length;
      if (filledNeighbors === 4) output[point] = 1;
    }
  }
  return output;
}

/** Removes disconnected sampling noise while retaining the complete dove. */
function keepLargestComponent(mask) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (visited[start] || mask[start] === 0) continue;
    const component = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length > 0) {
      const point = stack.pop();
      component.push(point);
      const x = point % LOGICAL_SIZE;
      const y = Math.floor(point / LOGICAL_SIZE);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (
            nx < 0 ||
            ny < 0 ||
            nx >= LOGICAL_SIZE ||
            ny >= LOGICAL_SIZE
          ) {
            continue;
          }
          const next = ny * LOGICAL_SIZE + nx;
          if (!visited[next] && mask[next] !== 0) {
            visited[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    components.push(component);
  }
  components.sort((left, right) => right.length - left.length);
  const output = new Uint8Array(mask.length);
  for (const point of components[0] ?? []) output[point] = 1;
  return output;
}

/** Chooses a nearby fill color when thinning an accidentally doubled outline. */
function neighboringFillColor(pixels, mask, x, y) {
  const counts = new Map();
  for (let radius = 1; radius <= 2; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (
          nx < 0 ||
          ny < 0 ||
          nx >= LOGICAL_SIZE ||
          ny >= LOGICAL_SIZE
        ) {
          continue;
        }
        const point = ny * LOGICAL_SIZE + nx;
        const offset = point * 4;
        if (
          mask[point] === 0 ||
          (pixels[offset] === 0 &&
            pixels[offset + 1] === 0 &&
            pixels[offset + 2] === 0)
        ) {
          continue;
        }
        const key = `${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    if (counts.size > 0) break;
  }
  const [winner = "255,250,228"] = [...counts.entries()].sort(
    (left, right) => right[1] - left[1]
  )[0] ?? [];
  return [...winner.split(",").map(Number), 255];
}

/** Removes isolated interior black noise while preserving the dove's eye. */
function removeInteriorBlackNoise(pixels, mask, boundary) {
  const visited = new Uint8Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    const startOffset = start * 4;
    const startsBlack =
      mask[start] !== 0 &&
      boundary[start] === 0 &&
      pixels[startOffset] === 0 &&
      pixels[startOffset + 1] === 0 &&
      pixels[startOffset + 2] === 0;
    if (visited[start] || !startsBlack) continue;
    const component = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length > 0) {
      const point = stack.pop();
      component.push(point);
      const x = point % LOGICAL_SIZE;
      const y = Math.floor(point / LOGICAL_SIZE);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (
            nx < 0 ||
            ny < 0 ||
            nx >= LOGICAL_SIZE ||
            ny >= LOGICAL_SIZE
          ) {
            continue;
          }
          const next = ny * LOGICAL_SIZE + nx;
          const offset = next * 4;
          const nextBlack =
            mask[next] !== 0 &&
            boundary[next] === 0 &&
            pixels[offset] === 0 &&
            pixels[offset + 1] === 0 &&
            pixels[offset + 2] === 0;
          if (!visited[next] && nextBlack) {
            visited[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    const point = component[0];
    const x = point % LOGICAL_SIZE;
    const y = Math.floor(point / LOGICAL_SIZE);
    const isEye = component.length === 1 && x >= 35 && x <= 40 && y <= 29;
    if (component.length > 1 || isEye) continue;
    pixels.set(neighboringFillColor(pixels, mask, x, y), point * 4);
  }
}

/** Rebuilds the sampled concept using binary alpha and a one-cell contour. */
function constructLogicalSprite(sampled) {
  const pixels = Buffer.alloc(LOGICAL_SIZE * LOGICAL_SIZE * 4);
  const initialMask = new Uint8Array(LOGICAL_SIZE * LOGICAL_SIZE);
  for (let point = 0; point < initialMask.length; point += 1) {
    const offset = point * 4;
    const r = sampled[offset];
    const g = sampled[offset + 1];
    const b = sampled[offset + 2];
    if (isMagentaKey(r, g, b)) continue;
    initialMask[point] = 1;
    let color = nearestPaletteColor(r, g, b);
    const x = point % LOGICAL_SIZE;
    const green =
      color === PALETTE[5] || color === PALETTE[6] || color === PALETTE[7];
    if (green && x < 45) color = PALETTE[3];
    pixels.set(color, offset);
  }

  const mask = keepLargestComponent(fillPinholes(initialMask));
  const boundary = new Uint8Array(mask.length);
  for (let y = 0; y < LOGICAL_SIZE; y += 1) {
    for (let x = 0; x < LOGICAL_SIZE; x += 1) {
      const point = y * LOGICAL_SIZE + x;
      if (mask[point] !== 0 && isBoundary(mask, x, y)) boundary[point] = 1;
    }
  }

  for (let y = 0; y < LOGICAL_SIZE; y += 1) {
    for (let x = 0; x < LOGICAL_SIZE; x += 1) {
      const point = y * LOGICAL_SIZE + x;
      const offset = point * 4;
      if (mask[point] === 0) {
        pixels.fill(0, offset, offset + 4);
        continue;
      }
      const black =
        pixels[offset] === 0 &&
        pixels[offset + 1] === 0 &&
        pixels[offset + 2] === 0;
      const touchesBoundary = [
        point - 1,
        point + 1,
        point - LOGICAL_SIZE,
        point + LOGICAL_SIZE,
      ].some((neighbor) => boundary[neighbor] !== 0);
      if (black && boundary[point] === 0 && touchesBoundary) {
        pixels.set(neighboringFillColor(pixels, mask, x, y), offset);
      }
      if (boundary[point] !== 0) pixels.set(PALETTE[0], offset);
    }
  }
  removeInteriorBlackNoise(pixels, mask, boundary);
  return pixels;
}

/** Writes the logical master and its exact nearest-neighbor production copy. */
async function buildDoveGrid(input, masterOutput, productionOutput) {
  const sampled = await sharp(input)
    .resize(LOGICAL_SIZE, LOGICAL_SIZE, {
      fit: "fill",
      kernel: sharp.kernel.nearest,
    })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const logical = constructLogicalSprite(sampled);
  await Promise.all([
    mkdir(path.dirname(masterOutput), { recursive: true }),
    mkdir(path.dirname(productionOutput), { recursive: true }),
  ]);
  await sharp(logical, {
    raw: {
      width: LOGICAL_SIZE,
      height: LOGICAL_SIZE,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9 })
    .toFile(masterOutput);
  await sharp(logical, {
    raw: {
      width: LOGICAL_SIZE,
      height: LOGICAL_SIZE,
      channels: 4,
    },
  })
    .resize(PRODUCTION_SIZE, PRODUCTION_SIZE, {
      fit: "fill",
      kernel: sharp.kernel.nearest,
    })
    .png({ compressionLevel: 9 })
    .toFile(productionOutput);
}

const [input, masterOutput, productionOutput] = process.argv.slice(2);
if (!input || !masterOutput || !productionOutput) {
  throw new Error(
    "Usage: node scripts/build-dove-grid.mjs <concept.png> <master-64.png> <output-128.png>"
  );
}

await buildDoveGrid(input, masterOutput, productionOutput);
