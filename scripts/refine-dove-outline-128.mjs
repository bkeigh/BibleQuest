/**
 * Rebuilds only the dove's exterior contour on its native 128x128 grid.
 *
 * The existing interior drawing and palette remain intact. Boundary black is
 * restored to the nearest local fill color before one external eight-connected
 * black contour is added, avoiding diagonal holes and consumed interior detail.
 */
import path from "node:path";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const SIZE = 128;
const CHANNELS = 4;
const BLACK = [0, 0, 0, 255];
const SOURCE =
  "/Users/brendankenney/Development/BibleQuest/public/pixel/dove.png";
const OUTPUT =
  process.argv[2] ??
  "/Users/brendankenney/Pictures/Assets-BibleQuest/pixel/_review/dove-outline-v2.png";

/** Returns the flat RGBA byte offset for one pixel coordinate. */
function offsetOf(x, y) {
  return (y * SIZE + x) * CHANNELS;
}

/** Reports whether a coordinate remains inside the authored canvas. */
function isInside(x, y) {
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE;
}

/** Reports whether one pixel is exact opaque black. */
function isBlack(pixels, x, y) {
  const offset = offsetOf(x, y);
  return (
    pixels[offset] === 0 &&
    pixels[offset + 1] === 0 &&
    pixels[offset + 2] === 0 &&
    pixels[offset + 3] === 255
  );
}

/** Reports whether one opaque pixel touches transparency in eight directions. */
function touchesTransparency(pixels, x, y) {
  for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
    for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
      if (deltaX === 0 && deltaY === 0) continue;
      const nextX = x + deltaX;
      const nextY = y + deltaY;
      if (!isInside(nextX, nextY)) return true;
      if (pixels[offsetOf(nextX, nextY) + 3] === 0) return true;
    }
  }
  return false;
}

/** Finds the locally dominant non-black fill nearest to an outline pixel. */
function nearestFill(pixels, x, y) {
  for (let radius = 1; radius <= 6; radius += 1) {
    const colors = new Map();
    for (let nextY = y - radius; nextY <= y + radius; nextY += 1) {
      for (let nextX = x - radius; nextX <= x + radius; nextX += 1) {
        if (!isInside(nextX, nextY)) continue;
        if (
          Math.max(Math.abs(nextX - x), Math.abs(nextY - y)) !== radius
        ) {
          continue;
        }
        const offset = offsetOf(nextX, nextY);
        if (pixels[offset + 3] === 0 || isBlack(pixels, nextX, nextY)) {
          continue;
        }
        const key = `${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`;
        colors.set(key, (colors.get(key) ?? 0) + 1);
      }
    }
    if (colors.size > 0) {
      const [color] = [...colors.entries()].sort(
        (left, right) => right[1] - left[1]
      )[0];
      return [...color.split(",").map(Number), 255];
    }
  }
  return [255, 250, 228, 255];
}

/** Replaces the old inward exterior black with local subject colors. */
function restoreBoundaryFill(source) {
  const restored = Buffer.from(source);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (
        !isBlack(source, x, y) ||
        !touchesTransparency(source, x, y)
      ) {
        continue;
      }
      const replacement = nearestFill(source, x, y);
      const offset = offsetOf(x, y);
      for (let channel = 0; channel < CHANNELS; channel += 1) {
        restored[offset + channel] = replacement[channel];
      }
    }
  }
  return restored;
}

/** Adds one external black pixel around every eight-connected silhouette edge. */
function addExternalContour(restored, original) {
  const output = Buffer.from(restored);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const offset = offsetOf(x, y);
      if (original[offset + 3] !== 0) continue;
      let adjacent = false;
      for (let deltaY = -1; deltaY <= 1 && !adjacent; deltaY += 1) {
        for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
          if (deltaX === 0 && deltaY === 0) continue;
          const nextX = x + deltaX;
          const nextY = y + deltaY;
          if (
            isInside(nextX, nextY) &&
            original[offsetOf(nextX, nextY) + 3] !== 0
          ) {
            adjacent = true;
            break;
          }
        }
      }
      if (!adjacent) continue;
      for (let channel = 0; channel < CHANNELS; channel += 1) {
        output[offset + channel] = BLACK[channel];
      }
    }
  }
  return output;
}

/** Writes the direct-grid result without resizing, dithering, or quantization. */
async function main() {
  const { data, info } = await sharp(SOURCE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== SIZE || info.height !== SIZE || info.channels !== CHANNELS) {
    throw new Error(
      `Expected ${SIZE}x${SIZE} RGBA source; received ${info.width}x${info.height}x${info.channels}`
    );
  }
  const restored = restoreBoundaryFill(data);
  const outlined = addExternalContour(restored, data);
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await sharp(outlined, {
    raw: { width: SIZE, height: SIZE, channels: CHANNELS },
  })
    .png({ palette: true, colours: 8, dither: 0, effort: 10 })
    .toFile(OUTPUT);
  process.stdout.write(`${OUTPUT}\n`);
}

await main();
