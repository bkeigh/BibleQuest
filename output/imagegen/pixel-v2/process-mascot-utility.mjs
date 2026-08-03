import fs from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import sharp from "sharp";

const ROOT = path.resolve("output/imagegen/pixel-v2");

const PALETTE = [
  [0x00, 0x00, 0x00], // exact black outline
  [0x2c, 0x2c, 0x2c], // ink charcoal
  [0x0a, 0x3f, 0x2e], // deepest green
  [0x1f, 0x5e, 0x3a], // Rolex green
  [0x6b, 0x8f, 0x4e], // moss green
  [0xa8, 0xb9, 0x8c], // moss highlight
  [0x5d, 0x3b, 0x24], // leather shadow
  [0x8b, 0x5e, 0x34], // leather brown
  [0xb7, 0x83, 0x4b], // leather highlight
  [0x6f, 0x53, 0x1d], // gold shadow
  [0xda, 0xaf, 0x37], // gold
  [0xf2, 0xcf, 0x63], // gold highlight
  [0xd9, 0xc4, 0x9b], // parchment shadow
  [0xf6, 0xe9, 0xd1], // parchment
  [0xff, 0xfa, 0xf0], // warm white
  [0x18, 0x3a, 0x55], // prayer-blue shadow
  [0x29, 0x54, 0x70], // prayer blue
  [0x5d, 0x89, 0xa3], // prayer-blue highlight
  [0x8a, 0x4f, 0x32], // warm skin shadow
  [0xc9, 0x82, 0x55], // warm skin midtone
  [0xf0, 0xb6, 0x81], // warm skin highlight
  [0xb8, 0x4a, 0x2b], // flame rust
  [0xe8, 0x87, 0x2d], // flame orange
  [0xff, 0xd4, 0x5a], // flame light
];

const MASCOTS = [
  ["mascot-lamb", "bottom", 0],
  ["mascot-lantern", "bottom", 1],
  ["mascot-scroll", "bottom", 2],
  ["mascot-sprout", "bottom", 4],
  ["mascot-key", "center", 5],
  ["mascot-map", "bottom", 6],
  ["mascot-campfire", "bottom", 7],
];

const UTILITIES = [
  ["bird", "bottom"],
  ["compass", "center"],
  ["cross", "bottom"],
  ["crown", "bottom"],
  ["door", "bottom"],
  ["flower", "bottom"],
  ["key", "center"],
  ["leaf", "center"],
  ["mountain", "bottom"],
  ["sun", "bottom"],
];

const MATERIAL = {
  outline: [0, 1],
  green: [2, 3, 4, 5],
  leather: [6, 7, 8],
  gold: [9, 10, 11],
  parchment: [12, 13, 14],
  blue: [15, 16, 17],
  skin: [18, 19, 20],
  flame: [21, 22, 23],
};

const materialSet = (...names) => names.flatMap((name) => MATERIAL[name]);

const ALLOWED_BY_NAME = {
  "mascot-lamb": materialSet("outline", "parchment", "leather", "skin"),
  "mascot-lantern": materialSet("outline", "leather", "gold", "parchment", "flame"),
  "mascot-scroll": materialSet("outline", "leather", "gold", "parchment", "green"),
  "mascot-sprout": materialSet("outline", "green", "leather", "gold"),
  "mascot-key": materialSet("outline", "gold", "leather"),
  "mascot-map": materialSet("outline", "leather", "gold", "parchment", "green"),
  "mascot-campfire": materialSet("outline", "leather", "gold", "flame"),
  bird: materialSet("outline", "leather", "parchment", "gold"),
  compass: materialSet("outline", "gold", "blue", "parchment"),
  cross: materialSet("outline", "leather", "gold"),
  crown: materialSet("outline", "gold", "flame"),
  door: materialSet("outline", "leather", "parchment", "gold"),
  flower: materialSet("outline", "parchment", "gold", "green"),
  key: materialSet("outline", "gold", "leather"),
  leaf: materialSet("outline", "green", "gold"),
  mountain: materialSet("outline", "green", "leather", "parchment", "gold"),
  sun: materialSet("outline", "green", "gold", "flame"),
};

function isChroma(r, g, b) {
  // The built-in generator produced a near-magenta field rather than one
  // literal RGB triplet. This hard classifier removes that field and its
  // purple edge contamination without introducing partial alpha.
  return r >= 90 && b >= 90 && g <= 110 && r >= g * 1.5 && b >= g * 1.4;
}

function nearestPalette(r, g, b) {
  let best = PALETTE[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const color of PALETTE) {
    const dr = r - color[0];
    const dg = g - color[1];
    const db = b - color[2];
    const distance = dr * dr * 0.8 + dg * dg * 1.2 + db * db * 0.7;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = color;
    }
  }
  return best;
}

async function keyedRgba(input) {
  const { data, info } = await sharp(input)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let source = 0, target = 0; source < data.length; source += 3, target += 4) {
    const r = data[source];
    const g = data[source + 1];
    const b = data[source + 2];
    if (isChroma(r, g, b)) continue;
    const [nr, ng, nb] = nearestPalette(r, g, b);
    rgba[target] = nr;
    rgba[target + 1] = ng;
    rgba[target + 2] = nb;
    rgba[target + 3] = 255;
  }
  return { data: rgba, info: { width: info.width, height: info.height, channels: 4 } };
}

function cellBounds(total, parts, index) {
  const start = Math.round((total * index) / parts);
  const end = Math.round((total * (index + 1)) / parts);
  return { start, size: end - start };
}

async function extractCell(keyed, columns, rows, index) {
  const column = index % columns;
  const row = Math.floor(index / columns);
  const x = cellBounds(keyed.info.width, columns, column);
  const y = cellBounds(keyed.info.height, rows, row);
  return sharp(keyed.data, { raw: keyed.info })
    .extract({ left: x.start, top: y.start, width: x.size, height: y.size })
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function fitSprite(cell, target, maxVisible, alignment) {
  const trimmed = await sharp(cell.data, { raw: cell.info })
    .trim({ background: [0, 0, 0, 0] })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const scale = Math.min(maxVisible / trimmed.info.width, maxVisible / trimmed.info.height);
  const width = Math.max(1, Math.round(trimmed.info.width * scale));
  const height = Math.max(1, Math.round(trimmed.info.height * scale));
  const sprite = await sharp(trimmed.data, { raw: trimmed.info })
    .resize(width, height, { kernel: "nearest", fit: "fill" })
    .raw()
    .toBuffer();
  const left = Math.floor((target - width) / 2);
  const top = alignment === "bottom" ? target - 3 - height : Math.floor((target - height) / 2);
  return sharp({
    create: { width: target, height: target, channels: 4, background: [0, 0, 0, 0] },
  })
    .composite([{ input: sprite, raw: { width, height, channels: 4 }, left, top }])
    .raw()
    .toBuffer();
}

async function opaqueCount(cell) {
  let count = 0;
  for (let i = 3; i < cell.data.length; i += 4) if (cell.data[i] !== 0) count += 1;
  return count;
}

function removeSmallComponents(buffer, width, height, minimumSize = 5) {
  const visited = new Uint8Array(width * height);
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (visited[start] || buffer[start * 4 + 3] === 0) continue;
      const component = [];
      const stack = [start];
      visited[start] = 1;
      while (stack.length > 0) {
        const point = stack.pop();
        component.push(point);
        const px = point % width;
        const py = Math.floor(point / width);
        for (const [dx, dy] of neighbors) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (!visited[next] && buffer[next * 4 + 3] !== 0) {
            visited[next] = 1;
            stack.push(next);
          }
        }
      }
      if (component.length < minimumSize) {
        for (const point of component) buffer.fill(0, point * 4, point * 4 + 4);
      }
    }
  }
  return buffer;
}

function constrainMaterials(buffer, allowed) {
  const colors = allowed.map((index) => PALETTE[index]);
  for (let offset = 0; offset < buffer.length; offset += 4) {
    if (buffer[offset + 3] === 0) continue;
    let best = colors[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const color of colors) {
      const dr = buffer[offset] - color[0];
      const dg = buffer[offset + 1] - color[1];
      const db = buffer[offset + 2] - color[2];
      const distance = dr * dr * 0.8 + dg * dg * 1.2 + db * db * 0.7;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = color;
      }
    }
    buffer[offset] = best[0];
    buffer[offset + 1] = best[1];
    buffer[offset + 2] = best[2];
  }
  return buffer;
}

function visibleSize(buffer, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (buffer[(y * width + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function refitIfUndersized(buffer, target, maxVisible, alignment) {
  const visible = visibleSize(buffer, target, target);
  if (Math.max(visible.width, visible.height) >= maxVisible - 1) return buffer;
  return removeSmallComponents(
    await fitSprite(
      { data: buffer, info: { width: target, height: target, channels: 4 } },
      target,
      maxVisible,
      alignment
    ),
    target,
    target
  );
}

async function processAtlas({ source, normalizedSource, outputDir, columns, rows, target, maxVisible, entries }) {
  const keyed = await keyedRgba(source);
  await sharp(keyed.data, { raw: keyed.info })
    .flatten({ background: "#ff00ff" })
    .removeAlpha()
    .png()
    .toFile(normalizedSource);
  await fs.mkdir(outputDir, { recursive: true });
  const results = [];
  for (let index = 0; index < entries.length; index += 1) {
    const [name, alignment, atlasIndex = index] = entries[index];
    const cell = await extractCell(keyed, columns, rows, atlasIndex);
    const cleaned = removeSmallComponents(
        await fitSprite(cell, target, maxVisible, alignment),
        target,
        target
      );
    const fitted = constrainMaterials(
      await refitIfUndersized(cleaned, target, maxVisible, alignment),
      ALLOWED_BY_NAME[name]
    );
    const output = path.join(outputDir, `${name}.png`);
    await writeIndexed(fitted, target, target, output);
    results.push({ name, output, width: target, height: target });
  }
  const occupied = new Set(entries.map((entry, index) => entry[2] ?? index));
  occupied.add(3); // Retired duplicate dove source remains as atlas provenance only.
  for (let index = 0; index < columns * rows; index += 1) {
    if (occupied.has(index)) continue;
    const empty = await extractCell(keyed, columns, rows, index);
    const count = await opaqueCount(empty);
    if (count !== 0) throw new Error(`${source}: expected empty cell ${index}, found ${count} opaque pixels`);
  }
  return results;
}

async function writePreview(entries, output, columns, target, scale) {
  const rows = Math.ceil(entries.length / columns);
  const cell = target * scale;
  const composites = [];
  for (let index = 0; index < entries.length; index += 1) {
    const sprite = await sharp(entries[index].output)
      .resize(cell, cell, { kernel: "nearest" })
      .png()
      .toBuffer();
    composites.push({ input: sprite, left: (index % columns) * cell, top: Math.floor(index / columns) * cell });
  }
  await sharp({
    create: {
      width: columns * cell,
      height: rows * cell,
      channels: 4,
      background: [0xf6, 0xe9, 0xd1, 255],
    },
  })
    .composite(composites)
    .png()
    .toFile(output);
}

async function writeIndexed(buffer, width, height, output) {
  const palette = [[0, 0, 0], ...PALETTE];
  const lookup = new Map(PALETTE.map((color, index) => [color.join(","), index + 1]));
  const scanlines = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width + 1);
    scanlines[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      if (buffer[source + 3] === 0) continue;
      const key = `${buffer[source]},${buffer[source + 1]},${buffer[source + 2]}`;
      const index = lookup.get(key);
      if (index == null) throw new Error(`${output}: color outside fixed palette: ${key}`);
      scanlines[row + x + 1] = index;
    }
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const plte = Buffer.from(palette.flat());
  const trns = Buffer.from([0, ...PALETTE.map(() => 255)]);
  const png = Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("PLTE", plte),
    pngChunk("tRNS", trns),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  await fs.writeFile(output, png);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return chunk;
}

const mascotResults = await processAtlas({
  source: path.join(ROOT, "sources/mascot-atlas-source.png"),
  normalizedSource: path.join(ROOT, "sources/mascot-atlas-chroma-normalized.png"),
  outputDir: path.join(ROOT, "staging/mascots"),
  columns: 3,
  rows: 3,
  target: 48,
  maxVisible: 42,
  entries: MASCOTS,
});

const utilityResults = await processAtlas({
  source: path.join(ROOT, "sources/utility-atlas-source.png"),
  normalizedSource: path.join(ROOT, "sources/utility-atlas-chroma-normalized.png"),
  outputDir: path.join(ROOT, "staging/utilities"),
  columns: 4,
  rows: 3,
  target: 32,
  maxVisible: 28,
  entries: UTILITIES,
});

await writePreview(mascotResults, path.join(ROOT, "mascot-staging-preview.png"), 3, 48, 4);
await writePreview(utilityResults, path.join(ROOT, "utility-staging-preview.png"), 4, 32, 5);

console.log(JSON.stringify({ mascotResults, utilityResults, paletteSize: PALETTE.length }, null, 2));
