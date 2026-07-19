/**
 * Reconstruct BibleQuest sprite sources on their production pixel grids.
 *
 * This intentionally separates art generation from production normalization:
 * source images may be large and opaque, while shipped sprites are fixed-grid,
 * fixed-palette, binary-alpha PNGs.
 *
 * Usage:
 *   node scripts/process-pixel-sprites.mjs clean-supplied [source-dir] [out-dir]
 *   node scripts/process-pixel-sprites.mjs normalize <input> <output> <width> <height> [white|alpha] [nearest|area]
 *   node scripts/process-pixel-sprites.mjs qa-sheet <input-dir> <output>
 */

import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const BIBLEQUEST_PIXEL_PALETTE = [
  "#102b21", // legacy outline-mapping anchor; flattened before production export
  "#000000", // exact production outline
  "#173e2b", // Rolex green shadow
  "#1f5e3a", // Rolex green
  "#3f7548", // Rolex green light
  "#526f3e", // moss shadow
  "#6b8f4e", // moss
  "#9ab95c", // moss light
  "#4c2f1d", // leather shadow
  "#8b5e34", // leather
  "#b98243", // leather light
  "#8f651a", // gold shadow
  "#daaf37", // gold
  "#f5d46a", // gold light
  "#d5b982", // parchment shadow
  "#f6e9d1", // parchment
  "#fff4de", // parchment highlight
  "#183a55", // prayer-blue shadow
  "#295470", // prayer blue
  "#5d89a3", // prayer-blue light
  "#8a4f32", // skin shadow
  "#c98255", // skin
  "#f0b681", // skin light
  "#f7d3a9", // skin highlight
  "#7c3028", // warm accent shadow
  "#c65b3f", // warm accent
  "#ef9738", // flame amber
  "#f7c84b", // flame light
  "#777468", // stone shadow
  "#aaa28f", // stone
  "#d8cfb8", // stone light
];

const palette = BIBLEQUEST_PIXEL_PALETTE.map((hex) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
});

const supplied = {
  "book.png": ["BQ-UI-Bible-Closed.png", 128, 128],
  "open-book.png": ["BQ-UI-Bible-Open.png", 128, 128],
  "bookmark.png": ["BQ-UI-571eee02-07bd-41e5-bb1e-c44efb1b9261.png", 128, 128],
  "candle.png": ["BQ-UI-Candle-1.png", 128, 128],
  "dove.png": ["BQ-UI-Dove.png", 128, 128],
  "lantern.png": ["BQ-UI-50488e00-7030-4455-ae91-cef5184919d4.png", 128, 128],
  "path.png": ["BQ-UI-90f31be5-1ac9-4451-8c4a-125f8e8e993e.png", 128, 128],
  "scroll.png": ["BQ-UI-Scroll.png", 128, 128],
  "tree.png": ["BQ-UI-b698119c-43bb-4d5a-bcb2-16a77465d896.png", 128, 128],
};

function isConnectedBackdrop(r, g, b) {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min >= 202 && max - min <= 54;
}

function colorDistanceSquared(pixel, candidate) {
  // Slightly favor green-channel agreement because it carries most perceived
  // luminance while keeping the mapping deterministic and inexpensive.
  const red = pixel.r - candidate.r;
  const green = pixel.g - candidate.g;
  const blue = pixel.b - candidate.b;
  return red * red * 2 + green * green * 3 + blue * blue;
}

function nearestPaletteColor(r, g, b) {
  const pixel = { r, g, b };
  let nearest = palette[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of palette) {
    const distance = colorDistanceSquared(pixel, candidate);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

async function removeConnectedWhiteBackdrop(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const point = y * width + x;
    if (visited[point]) return;
    const offset = point * channels;
    if (!isConnectedBackdrop(data[offset], data[offset + 1], data[offset + 2])) {
      return;
    }
    visited[point] = 1;
    queue[tail++] = point;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (head < tail) {
    const point = queue[head++];
    const x = point % width;
    const y = Math.floor(point / width);
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }

  for (let point = 0; point < width * height; point += 1) {
    const offset = point * channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const nearlyPureBackdrop =
      Math.min(r, g, b) >= 246 && Math.max(r, g, b) - Math.min(r, g, b) <= 12;
    if (visited[point] || nearlyPureBackdrop) {
      data[offset + 3] = 0;
    } else {
      data[offset + 3] = 255;
    }
  }

  return sharp(data, { raw: info }).png().toBuffer();
}

async function mapToProductionPalette(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset + 3] < 128) {
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 0;
      continue;
    }
    const mapped = nearestPaletteColor(
      data[offset],
      data[offset + 1],
      data[offset + 2]
    );
    data[offset] = mapped.r;
    data[offset + 1] = mapped.g;
    data[offset + 2] = mapped.b;
    data[offset + 3] = 255;
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

export async function normalizeSprite({
  input,
  output,
  width,
  height,
  backdrop = "alpha",
  kernel = "nearest",
}) {
  const prepared =
    backdrop === "white" ? await removeConnectedWhiteBackdrop(input) : input;
  const margin = Math.max(2, Math.round(Math.min(width, height) / 16));
  const normalized = await sharp(prepared)
    .ensureAlpha()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({
      width: width - margin * 2,
      height: height - margin * 2,
      fit: "contain",
      kernel: kernel === "area" ? sharp.kernel.lanczos3 : sharp.kernel.nearest,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: margin,
      bottom: margin,
      left: margin,
      right: margin,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const paletted = await mapToProductionPalette(normalized);
  await mkdir(path.dirname(output), { recursive: true });
  await sharp(paletted)
    .png({ palette: true, colours: 32, dither: 0 })
    .toFile(output);
}

async function cleanSupplied(sourceDir, outputDir) {
  for (const [outputName, [sourceName, width, height]] of Object.entries(
    supplied
  )) {
    await normalizeSprite({
      input: path.join(sourceDir, sourceName),
      output: path.join(outputDir, outputName),
      width,
      height,
      backdrop: "white",
      kernel: "area",
    });
  }
}

async function qaSheet(inputDir, output) {
  const files = (await readdir(inputDir))
    .filter((file) => file.endsWith(".png"))
    .sort();
  const cell = 160;
  const columns = Math.min(6, Math.max(1, files.length));
  const rows = Math.ceil(files.length / columns);
  const composites = [];
  for (let index = 0; index < files.length; index += 1) {
    const icon = await sharp(path.join(inputDir, files[index]))
      .resize({ width: 112, height: 112, fit: "contain", kernel: "nearest" })
      .png()
      .toBuffer();
    composites.push({
      input: icon,
      left: (index % columns) * cell + 24,
      top: Math.floor(index / columns) * cell + 16,
    });
  }
  await mkdir(path.dirname(output), { recursive: true });
  await sharp({
    create: {
      width: columns * cell,
      height: rows * cell,
      channels: 4,
      background: "#f6e9d1",
    },
  })
    .composite(composites)
    .png()
    .toFile(output);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "clean-supplied") {
    const sourceDir =
      args[0] ??
      "/Users/brendankenney/Pictures/BibleQuest-Assets/UI-ASSETS";
    const outputDir =
      args[1] ?? path.join(process.cwd(), "output/imagegen/pixel-v2/supplied");
    await cleanSupplied(sourceDir, outputDir);
    return;
  }
  if (command === "normalize") {
    const [input, output, width, height, backdrop = "alpha", kernel = "nearest"] =
      args;
    if (!input || !output || !width || !height) {
      throw new Error("normalize requires input, output, width, and height");
    }
    await normalizeSprite({
      input,
      output,
      width: Number.parseInt(width, 10),
      height: Number.parseInt(height, 10),
      backdrop,
      kernel,
    });
    return;
  }
  if (command === "qa-sheet") {
    const [inputDir, output] = args;
    if (!inputDir || !output) {
      throw new Error("qa-sheet requires an input directory and output path");
    }
    await qaSheet(inputDir, output);
    return;
  }
  throw new Error(`Unknown command: ${command ?? "(missing)"}`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await main();
}
