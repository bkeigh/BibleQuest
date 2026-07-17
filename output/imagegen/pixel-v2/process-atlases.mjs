import fs from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import sharp from "sharp";

const ROOT = path.resolve("output/imagegen/pixel-v2");
const TREE_SOURCE = path.join(ROOT, "sources/tree-progression-atlas.png");
const CANDLE_SOURCE = path.join(ROOT, "sources/candle-states-atlas.png");
const TREE_DIR = path.join(ROOT, "staging/trees");
const CANDLE_DIR = path.join(ROOT, "staging/candles");

const PALETTE = [
  [0x1e, 0x33, 0x29], // dark-evergreen outline
  [0x2c, 0x2c, 0x2c], // ink
  [0x0a, 0x3f, 0x2e], // deepest green
  [0x1f, 0x5e, 0x3a], // evergreen
  [0x6b, 0x8f, 0x4e], // moss
  [0xa8, 0xb9, 0x8c], // moss light
  [0x5d, 0x3b, 0x24], // leather dark
  [0x8b, 0x5e, 0x34], // leather
  [0xb7, 0x83, 0x4b], // leather light
  [0x6f, 0x53, 0x1d], // gold dark
  [0xda, 0xaf, 0x37], // gold
  [0xf2, 0xcf, 0x63], // gold light
  [0xd9, 0xc4, 0x9b], // parchment dark
  [0xf6, 0xe9, 0xd1], // parchment
  [0xff, 0xfa, 0xf0], // warm white
  [0xe8, 0x87, 0x2d], // flame orange
  [0xff, 0xd4, 0x5a], // flame light
];

function isChroma(r, g, b) {
  // The built-in generator returned a near-magenta field rather than one
  // literal RGB triplet. This hard classifier removes that field and its
  // colored edge contamination without introducing a soft alpha matte.
  return r >= 120 && b >= 105 && g <= 100 && r >= g * 1.65 && b >= g * 1.55;
}

function nearestPalette(r, g, b) {
  let best = PALETTE[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const color of PALETTE) {
    const dr = r - color[0];
    const dg = g - color[1];
    const db = b - color[2];
    // Green carries extra perceptual weight for foliage consistency.
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
    if (isChroma(r, g, b)) {
      rgba[target] = 0;
      rgba[target + 1] = 0;
      rgba[target + 2] = 0;
      rgba[target + 3] = 0;
      continue;
    }
    const [nr, ng, nb] = nearestPalette(r, g, b);
    rgba[target] = nr;
    rgba[target + 1] = ng;
    rgba[target + 2] = nb;
    rgba[target + 3] = 255;
  }
  return { data: rgba, info: { width: info.width, height: info.height, channels: 4 } };
}

function bounds(total, parts, index) {
  const start = Math.round((total * index) / parts);
  const end = Math.round((total * (index + 1)) / parts);
  return { start, size: end - start };
}

function connectedComponents(rgba, width, height, minimumArea = 100) {
  const pixels = width * height;
  const seen = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  const components = [];

  for (let start = 0; start < pixels; start += 1) {
    if (seen[start] || rgba[start * 4 + 3] === 0) continue;
    let head = 0;
    let tail = 0;
    let area = 0;
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    queue[tail++] = start;
    seen[start] = 1;

    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      area += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (seen[next] || rgba[next * 4 + 3] === 0) continue;
          seen[next] = 1;
          queue[tail++] = next;
        }
      }
    }

    if (area >= minimumArea) {
      components.push({
        area,
        left: minX,
        top: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
      });
    }
  }
  return components;
}

async function writeIndexed(buffer, width, height, output) {
  const palette = [[0, 0, 0], ...PALETTE];
  const lookup = new Map(
    PALETTE.map((color, index) => [color.join(","), index + 1])
  );
  const scanlines = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width + 1);
    scanlines[row] = 0; // PNG filter: None
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      if (buffer[source + 3] === 0) {
        scanlines[row + x + 1] = 0;
        continue;
      }
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
  ihdr[8] = 8; // one palette index per byte
  ihdr[9] = 3; // indexed color
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

async function writeExactChromaAtlas(keyed, output) {
  const { width, height } = keyed.info;
  const rgb = Buffer.alloc(width * height * 3);
  for (let source = 0, target = 0; source < keyed.data.length; source += 4, target += 3) {
    if (keyed.data[source + 3] === 0) {
      rgb[target] = 255;
      rgb[target + 1] = 0;
      rgb[target + 2] = 255;
    } else {
      rgb[target] = keyed.data[source];
      rgb[target + 1] = keyed.data[source + 1];
      rgb[target + 2] = keyed.data[source + 2];
    }
  }
  await sharp(rgb, { raw: { width, height, channels: 3 } }).png().toFile(output);
}

async function processTrees() {
  const keyed = await keyedRgba(TREE_SOURCE);
  const sourceWidth = keyed.info.width;
  const sourceHeight = keyed.info.height;
  await fs.mkdir(TREE_DIR, { recursive: true });
  await writeExactChromaAtlas(
    keyed,
    path.join(ROOT, "sources/tree-progression-atlas-chroma-normalized.png")
  );
  const components = connectedComponents(keyed.data, sourceWidth, sourceHeight)
    .sort((a, b) => {
      const rowA = Math.min(3, Math.floor((a.centerY / sourceHeight) * 4));
      const rowB = Math.min(3, Math.floor((b.centerY / sourceHeight) * 4));
      return rowA - rowB || a.centerX - b.centerX;
    });
  if (components.length !== 20) {
    throw new Error(`tree atlas: expected 20 isolated sprites, found ${components.length}`);
  }
  const scale = Math.min(
    60 / Math.max(...components.map(({ width }) => width)),
    56 / Math.max(...components.map(({ height }) => height))
  );

  const cells = [];
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    const width = Math.max(1, Math.round(component.width * scale));
    const height = Math.max(1, Math.round(component.height * scale));
    const sprite = await sharp(keyed.data, { raw: keyed.info })
      .extract({
        left: component.left,
        top: component.top,
        width: component.width,
        height: component.height,
      })
      .resize(width, height, { kernel: "nearest", fit: "fill" })
      .png()
      .toBuffer();
    const crop = await sharp({
      create: { width: 64, height: 64, channels: 4, background: [0, 0, 0, 0] },
    })
      .composite([
        {
          input: sprite,
          left: Math.floor((64 - width) / 2),
          top: 61 - height,
        },
      ])
      .raw()
      .toBuffer();
    const output = path.join(TREE_DIR, `tree-stage-${index}.png`);
    await writeIndexed(crop, 64, 64, output);
    const preview = await sharp(output)
      .resize(128, 128, { kernel: "nearest" })
      .png()
      .toBuffer();
    cells.push({ input: preview, left: (index % 5) * 128, top: Math.floor(index / 5) * 128 });
  }

  await sharp({
    create: { width: 640, height: 512, channels: 4, background: [246, 233, 209, 255] },
  })
    .composite(
      cells.map((cell) => ({
        input: cell.input,
        left: cell.left,
        top: cell.top,
        tile: false,
      }))
    )
    .png()
    .toFile(path.join(ROOT, "tree-staging-preview.png"));
}

async function processCandles() {
  const keyed = await keyedRgba(CANDLE_SOURCE);
  const sourceWidth = keyed.info.width;
  const sourceHeight = keyed.info.height;
  await fs.mkdir(CANDLE_DIR, { recursive: true });
  await writeExactChromaAtlas(
    keyed,
    path.join(ROOT, "sources/candle-states-atlas-chroma-normalized.png")
  );

  const extracted = [];
  for (let index = 0; index < 5; index += 1) {
    const x = bounds(sourceWidth, 5, index);
    const cell = await sharp(keyed.data, { raw: keyed.info })
      .extract({ left: x.start, top: 0, width: x.size, height: sourceHeight })
      .png()
      .toBuffer();
    const rawCell = await sharp(cell)
      .trim({ background: [0, 0, 0, 0] })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    extracted.push(rawCell);
  }

  const maxWidth = Math.max(...extracted.map(({ info }) => info.width));
  const maxHeight = Math.max(...extracted.map(({ info }) => info.height));
  const scale = Math.min(30 / maxWidth, 34 / maxHeight);
  const frames = [];
  for (let index = 0; index < 5; index += 1) {
    const { data, info } = extracted[index];
    const width = Math.max(1, Math.round(info.width * scale));
    const height = Math.max(1, Math.round(info.height * scale));
    const sprite = await sharp(data, { raw: info })
      .resize(width, height, { kernel: "nearest", fit: "fill" })
      .png()
      .toBuffer();
    const left = Math.floor((32 - width) / 2);
    const top = 35 - height;
    const frame = await sharp({
      create: { width: 32, height: 36, channels: 4, background: [0, 0, 0, 0] },
    })
      .composite([{ input: sprite, left, top }])
      .raw()
      .toBuffer();
    frames.push(frame);
  }

  // Preserve an actually identical candle/holder in every state. The source
  // generator varied a few body pixels despite the invariant; rows 13–35 of
  // the unlit frame become the canonical shared body, while each state keeps
  // its own wick/flame/sparks/halo above it.
  const bodyStart = 13;
  const canonical = frames[0];
  for (let index = 1; index < frames.length; index += 1) {
    for (let y = bodyStart; y < 36; y += 1) {
      const offset = y * 32 * 4;
      canonical.copy(frames[index], offset, offset, offset + 32 * 4);
    }
  }

  const names = [
    "candle-unlit",
    "candle-small",
    "candle-steady",
    "candle-sparks",
    "candle-halo",
  ];
  for (let index = 0; index < names.length; index += 1) {
    await writeIndexed(frames[index], 32, 36, path.join(CANDLE_DIR, `${names[index]}.png`));
  }

  await sharp({
    create: { width: 640, height: 144, channels: 4, background: [246, 233, 209, 255] },
  })
    .composite(
      await Promise.all(
        names.map(async (name, index) => ({
          input: await sharp(path.join(CANDLE_DIR, `${name}.png`))
            .resize(128, 144, { kernel: "nearest" })
            .png()
            .toBuffer(),
          left: index * 128,
          top: 0,
        }))
      )
    )
    .png()
    .toFile(path.join(ROOT, "candle-staging-preview.png"));
}

await Promise.all([processTrees(), processCandles()]);
