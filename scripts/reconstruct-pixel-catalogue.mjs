/**
 * Reconstruct the BibleQuest pixel catalogue on its authored logical grids.
 *
 * Production files remain native 128x128. Priority sprites receive targeted
 * color-cluster cleanup, while dense tree foliage is simplified on a 64 grid
 * and nearest-neighbor enlarged back to the production canvas.
 *
 * Usage:
 *   node scripts/reconstruct-pixel-catalogue.mjs <input-dir> <output-dir>
 */
import {
  copyFile,
  mkdir,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import sharp from "sharp";

const PHYSICAL_SIZE = 128;
const TREE_SIMPLIFICATION_GRID = 64;
const DOVE_SOURCE = path.resolve(
  "output/imagegen/pixel-v2/sources/dove-master-64.png"
);

const CLEANUP_NAMES = new Set([
  "chapel",
  "compass",
  "door",
  "dove",
  "key",
  "scroll",
  "service-basket",
  "wheat",
]);

const SIMPLIFIED_TREE_NAMES = new Set([
  "tree",
  ...Array.from({ length: 9 }, (_, index) => `tree-stage-${index + 11}`),
]);

const GIF_SPECS = [
  {
    file: "mascot-lamb-walk.gif",
    staticRegion: "lamb",
  },
  {
    file: "mascot-campfire-burn.gif",
    staticRegion: "campfire",
  },
];

/** Converts a raw pixel to a stable RGB lookup key. */
function colorKey(buffer, point) {
  const offset = point * 4;
  return `${buffer[offset]},${buffer[offset + 1]},${buffer[offset + 2]}`;
}

/** Returns true when a keyed pixel is exact production black. */
function isBlack(buffer, point) {
  const offset = point * 4;
  return (
    buffer[offset] === 0 &&
    buffer[offset + 1] === 0 &&
    buffer[offset + 2] === 0
  );
}

/** Removes any remaining magenta key pixels and forces binary alpha. */
function normalizeAlpha(buffer) {
  for (let offset = 0; offset < buffer.length; offset += 4) {
    const r = buffer[offset];
    const g = buffer[offset + 1];
    const b = buffer[offset + 2];
    const keyedMagenta = r >= 150 && b >= 150 && g <= 120;
    if (buffer[offset + 3] < 128 || keyedMagenta) {
      buffer.fill(0, offset, offset + 4);
      continue;
    }
    buffer[offset + 3] = 255;
  }
  return buffer;
}

/** Fills one-cell transparent pinholes surrounded by visible artwork. */
function fillPinholes(buffer, size) {
  const output = Buffer.from(buffer);
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const point = y * size + x;
      if (buffer[point * 4 + 3] !== 0) continue;
      const neighbors = [
        point - 1,
        point + 1,
        point - size,
        point + size,
      ];
      if (neighbors.some((neighbor) => buffer[neighbor * 4 + 3] === 0)) {
        continue;
      }
      const counts = new Map();
      for (const neighbor of neighbors) {
        const key = colorKey(buffer, neighbor);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const [replacement] = [...counts.entries()].sort(
        (left, right) => right[1] - left[1]
      )[0];
      const [r, g, b] = replacement.split(",").map(Number);
      output[point * 4] = r;
      output[point * 4 + 1] = g;
      output[point * 4 + 2] = b;
      output[point * 4 + 3] = 255;
    }
  }
  return output;
}

/** Replaces isolated one-cell color noise with the dominant adjacent shade. */
function mergeTinyColorComponents(
  buffer,
  size,
  minimumSize,
  preserveTreeAccents = false
) {
  const output = Buffer.from(buffer);
  const visited = new Uint8Array(size * size);
  const orthogonal = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (let start = 0; start < size * size; start += 1) {
    if (visited[start] || buffer[start * 4 + 3] === 0) continue;
    const targetColor = colorKey(buffer, start);
    const component = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length > 0) {
      const point = stack.pop();
      component.push(point);
      const x = point % size;
      const y = Math.floor(point / size);
      for (const [dx, dy] of orthogonal) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const next = ny * size + nx;
        if (
          !visited[next] &&
          buffer[next * 4 + 3] !== 0 &&
          colorKey(buffer, next) === targetColor
        ) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }
    if (component.length >= minimumSize || isBlack(buffer, start)) continue;
    const offset = start * 4;
    const r = buffer[offset];
    const g = buffer[offset + 1];
    const b = buffer[offset + 2];
    const treeAccent =
      preserveTreeAccents &&
      ((r >= 150 && g >= 100 && b <= 130) ||
        (r >= 185 && g >= 175 && b >= 135));
    if (treeAccent) continue;
    const candidates = new Map();
    const point = component[0];
    const x = point % size;
    const y = Math.floor(point / size);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const neighbor = ny * size + nx;
        if (buffer[neighbor * 4 + 3] === 0 || isBlack(buffer, neighbor)) {
          continue;
        }
        const key = colorKey(buffer, neighbor);
        candidates.set(key, (candidates.get(key) ?? 0) + 1);
      }
    }
    if (candidates.size === 0) continue;
    const [replacement] = [...candidates.entries()].sort(
      (left, right) => right[1] - left[1]
    )[0];
    const [nextR, nextG, nextB] = replacement.split(",").map(Number);
    output[offset] = nextR;
    output[offset + 1] = nextG;
    output[offset + 2] = nextB;
  }
  return output;
}

/** Rewrites every logical exterior boundary cell to exact black. */
function applyBlackContour(buffer, size) {
  const output = Buffer.from(buffer);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const point = y * size + x;
      if (buffer[point * 4 + 3] === 0) continue;
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      const boundary = neighbors.some(
        ([nx, ny]) =>
          nx < 0 ||
          ny < 0 ||
          nx >= size ||
          ny >= size ||
          buffer[(ny * size + nx) * 4 + 3] === 0
      );
      if (!boundary) continue;
      output[point * 4] = 0;
      output[point * 4 + 1] = 0;
      output[point * 4 + 2] = 0;
      output[point * 4 + 3] = 255;
    }
  }
  return output;
}

/** Materializes one nearest-neighbor resize and returns binary RGBA data. */
async function resizeRaw(
  input,
  width,
  height,
  sourceWidth,
  sourceHeight
) {
  const source =
    sourceWidth && sourceHeight
      ? sharp(input, {
          raw: {
            width: sourceWidth,
            height: sourceHeight,
            channels: 4,
          },
        })
      : sharp(input);
  const { data } = await source
    .resize(width, height, {
      fit: "fill",
      kernel: sharp.kernel.nearest,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return normalizeAlpha(data);
}

/** Quantizes cleanup candidates before the exact-black contour is restored. */
async function quantizeRaw(buffer, size, colours = 15) {
  const indexed = await sharp(buffer, {
    raw: { width: size, height: size, channels: 4 },
  })
    .png({ palette: true, colours, dither: 0, effort: 10 })
    .toBuffer();
  const { data } = await sharp(indexed)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return normalizeAlpha(data);
}

/** Builds the CRC table used by deterministic indexed PNG chunks. */
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

/** Calculates the PNG-standard CRC for one chunk. */
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Creates one checksummed PNG chunk. */
function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return chunk;
}

/** Writes indexed PNG bytes without allowing a quantizer to alter exact black. */
async function writeIndexedPng(buffer, width, height, output) {
  const colors = [];
  const lookup = new Map();
  for (let offset = 0; offset < buffer.length; offset += 4) {
    if (buffer[offset + 3] === 0) continue;
    const key = `${buffer[offset]},${buffer[offset + 1]},${buffer[offset + 2]}`;
    if (lookup.has(key)) continue;
    lookup.set(key, colors.length + 1);
    colors.push([buffer[offset], buffer[offset + 1], buffer[offset + 2]]);
  }
  if (colors.length > 255) {
    throw new Error(`${output}: indexed palette exceeds 255 opaque colors`);
  }
  const palette = [[0, 0, 0], ...colors];
  const scanlines = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width + 1);
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      if (buffer[source + 3] === 0) continue;
      const key = `${buffer[source]},${buffer[source + 1]},${buffer[source + 2]}`;
      scanlines[row + x + 1] = lookup.get(key);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("PLTE", Buffer.from(palette.flat())),
    pngChunk("tRNS", Buffer.from([0, ...colors.map(() => 255)])),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  await writeFile(output, png);
}

/** Enlarges the reviewed 64px dove master as exact 2x2 production blocks. */
async function fitDoveSource() {
  const metadata = await sharp(DOVE_SOURCE).metadata();
  if (
    metadata.width === PHYSICAL_SIZE / 2 &&
    metadata.height === PHYSICAL_SIZE / 2
  ) {
    const { data } = await sharp(DOVE_SOURCE)
      .resize(PHYSICAL_SIZE, PHYSICAL_SIZE, {
        fit: "fill",
        kernel: sharp.kernel.nearest,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return normalizeAlpha(data);
  }
  if (
    metadata.width === PHYSICAL_SIZE &&
    metadata.height === PHYSICAL_SIZE
  ) {
    const { data } = await sharp(DOVE_SOURCE)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return normalizeAlpha(data);
  }
  const trimmed = await sharp(DOVE_SOURCE)
    .ensureAlpha()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const sprite = await sharp(trimmed)
    .resize(PHYSICAL_SIZE - 16, PHYSICAL_SIZE - 16, {
      fit: "contain",
      kernel: sharp.kernel.nearest,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return sharp({
    create: {
      width: PHYSICAL_SIZE,
      height: PHYSICAL_SIZE,
      channels: 4,
      background: [0, 0, 0, 0],
    },
  })
    .composite([
      {
        input: normalizeAlpha(sprite.data),
        raw: {
          width: sprite.info.width,
          height: sprite.info.height,
          channels: 4,
        },
        left: Math.floor((PHYSICAL_SIZE - sprite.info.width) / 2),
        top: Math.floor((PHYSICAL_SIZE - sprite.info.height) / 2),
      },
    ])
    .raw()
    .toBuffer();
}

/** Cleans one selected PNG and writes the native 128x128 production result. */
async function reconstructPng(name, input, output) {
  if (name === "dove") {
    const physical = await fitDoveSource();
    await writeIndexedPng(
      physical,
      PHYSICAL_SIZE,
      PHYSICAL_SIZE,
      output
    );
    return;
  }
  if (
    !CLEANUP_NAMES.has(name) &&
    !SIMPLIFIED_TREE_NAMES.has(name)
  ) {
    if (path.resolve(input) !== path.resolve(output)) {
      await copyFile(input, output);
    }
    return;
  }
  const workingSize = SIMPLIFIED_TREE_NAMES.has(name)
    ? TREE_SIMPLIFICATION_GRID
    : PHYSICAL_SIZE;
  let pixels = await resizeRaw(input, workingSize, workingSize);
  pixels = fillPinholes(pixels, workingSize);
  pixels = mergeTinyColorComponents(
    pixels,
    workingSize,
    SIMPLIFIED_TREE_NAMES.has(name) ? 2 : 4,
    SIMPLIFIED_TREE_NAMES.has(name)
  );
  pixels = await quantizeRaw(pixels, workingSize);
  pixels = applyBlackContour(pixels, workingSize);
  const physical = await sharp(pixels, {
    raw: { width: workingSize, height: workingSize, channels: 4 },
  })
    .resize(PHYSICAL_SIZE, PHYSICAL_SIZE, {
      fit: "fill",
      kernel: sharp.kernel.nearest,
    })
    .raw()
    .toBuffer();
  await writeIndexedPng(physical, PHYSICAL_SIZE, PHYSICAL_SIZE, output);
}

/** Collects the visible palette from one stabilized logical animation frame. */
function framePalette(buffer) {
  const palette = [];
  const seen = new Set();
  for (let offset = 0; offset < buffer.length; offset += 4) {
    if (buffer[offset + 3] === 0) continue;
    const color = [buffer[offset], buffer[offset + 1], buffer[offset + 2]];
    const key = color.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    palette.push(color);
  }
  return palette;
}

/** Maps animation colors to one shared palette to prevent frame shimmer. */
function mapToPalette(buffer, palette) {
  const output = Buffer.from(buffer);
  for (let offset = 0; offset < output.length; offset += 4) {
    if (output[offset + 3] === 0) continue;
    let best = palette[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of palette) {
      const red = output[offset] - candidate[0];
      const green = output[offset + 1] - candidate[1];
      const blue = output[offset + 2] - candidate[2];
      const distance = red * red * 2 + green * green * 3 + blue * blue;
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    output[offset] = best[0];
    output[offset + 1] = best[1];
    output[offset + 2] = best[2];
    output[offset + 3] = 255;
  }
  return output;
}

/** Locks non-animated mascot regions while retaining the intended moving parts. */
function stabilizeFrame(base, frame, region) {
  const output = Buffer.from(base);
  for (let y = 0; y < PHYSICAL_SIZE; y += 1) {
    for (let x = 0; x < PHYSICAL_SIZE; x += 1) {
      const dynamic =
        region === "campfire"
          ? y < 76
          : y >= 92;
      if (!dynamic) continue;
      const offset = (y * PHYSICAL_SIZE + x) * 4;
      frame.copy(output, offset, offset, offset + 4);
    }
  }
  return applyBlackContour(output, PHYSICAL_SIZE);
}

/** Rebuilds and stabilizes one animated mascot GIF at 128x128 per frame. */
async function reconstructGif(spec, input, output) {
  const metadata = await sharp(input, { animated: true }).metadata();
  const decoded = await sharp(input, { animated: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const frames = [];
  for (let index = 0; index < metadata.pages; index += 1) {
    const start = index * metadata.pageHeight * metadata.width * 4;
    const source = decoded.data.subarray(
      start,
      start + metadata.pageHeight * metadata.width * 4
    );
    frames.push(normalizeAlpha(Buffer.from(source)));
  }
  const base = applyBlackContour(frames[0], PHYSICAL_SIZE);
  const palette = framePalette(base);
  const physicalFrames = [];
  for (const frame of frames) {
    const stabilized = stabilizeFrame(
      base,
      mapToPalette(frame, palette),
      spec.staticRegion
    );
    physicalFrames.push(stabilized);
  }
  await sharp(Buffer.concat(physicalFrames), {
    raw: {
      width: PHYSICAL_SIZE,
      height: PHYSICAL_SIZE * physicalFrames.length,
      channels: 4,
      pageHeight: PHYSICAL_SIZE,
    },
  })
    .gif({
      delay: metadata.delay,
      loop: metadata.loop ?? 0,
      colours: 32,
      dither: 0,
      effort: 10,
    })
    .toFile(output);
}

/** Runs the complete deterministic PNG and optional GIF reconstruction. */
export async function reconstructCatalogue(
  inputDirArg,
  outputDirArg,
  { includeAnimations = true } = {}
) {
  if (!inputDirArg || !outputDirArg) {
    throw new Error("input-dir and output-dir are required");
  }
  const inputDir = path.resolve(inputDirArg);
  const outputDir = path.resolve(outputDirArg);
  if (inputDir === outputDir) {
    throw new Error(
      "input-dir and output-dir must differ to prevent cumulative cleanup"
    );
  }
  await mkdir(outputDir, { recursive: true });
  const pngFiles = (await readdir(inputDir))
    .filter((file) => file.endsWith(".png") && file !== "mascot-dove.png")
    .sort();
  for (const file of pngFiles) {
    const name = file.slice(0, -4);
    await reconstructPng(
      name,
      path.join(inputDir, file),
      path.join(outputDir, file)
    );
  }
  if (includeAnimations) {
    for (const spec of GIF_SPECS) {
      await reconstructGif(
        spec,
        path.join(inputDir, spec.file),
        path.join(outputDir, spec.file)
      );
    }
  }
  await rm(path.join(outputDir, "mascot-dove.png"), { force: true });
  console.log(
    `Reconstructed ${pngFiles.length} PNGs and ${
      includeAnimations ? GIF_SPECS.length : 0
    } GIFs in ${outputDir}`
  );
  return pngFiles;
}

/** Parses the command-line wrapper around the reusable catalogue function. */
async function main() {
  const [inputDirArg, outputDirArg] = process.argv.slice(2);
  await reconstructCatalogue(inputDirArg, outputDirArg);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await main();
}
