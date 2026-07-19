/**
 * Rebuild the reviewed BibleQuest catalogue from high-resolution source
 * masters on one uniform 128x128 indexed-PNG canvas.
 *
 * Usage:
 *   node output/imagegen/pixel-v2/process-production-128.mjs [ui-assets-dir]
 *
 * This writes review candidates only. Promote them with
 * `node scripts/install-imagegen-sprites.mjs` after visual approval.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import sharp from "sharp";

const ROOT = path.resolve("output/imagegen/pixel-v2");
const SOURCE_ROOT = path.join(ROOT, "sources");
const PRODUCTION_ROOT = path.join(ROOT, "production-128");
const UI_ROOT = path.resolve(
  process.argv[2] ??
    "/Users/brendankenney/Pictures/BibleQuest-Assets/UI-ASSETS"
);
const SIZE = 128;
const MASCOT_SOURCE = "mascot-atlas-rich-black-source.png";
const BLACK = [0, 0, 0];

const SMALL_SPRITES = [
  "candle", "leaf", "star", "bird", "flower", "chapel", "book", "open-book",
  "bookmark", "lantern", "path", "tree", "sun", "heart", "hands",
  "praying-hands", "wheat", "dove", "cross", "door", "key", "scroll",
  "compass", "crown", "mountain", "moon", "service-basket", "links", "people",
  "fountain",
];

const MASCOTS = [
  "mascot-lamb", "mascot-lantern", "mascot-scroll", "mascot-dove",
  "mascot-sprout", "mascot-key", "mascot-map", "mascot-campfire",
];
const MASCOT_DOVE_INDEX = MASCOTS.indexOf("mascot-dove");

const CANDLES = [
  "candle-unlit", "candle-small", "candle-steady", "candle-sparks", "candle-halo",
];

const TREES = Array.from({ length: 20 }, (_, index) => `tree-stage-${index}`);
const EXPECTED = [...SMALL_SPRITES, ...CANDLES, ...TREES, ...MASCOTS];

if (EXPECTED.length !== 63 || new Set(EXPECTED).size !== 63) {
  throw new Error("Production contract must contain exactly 63 unique sprite names.");
}

const SUPPLIED = {
  book: "BQ-UI-Bible-Closed.png",
  bookmark: "BQ-UI-571eee02-07bd-41e5-bb1e-c44efb1b9261.png",
  candle: "BQ-UI-Candle-1.png",
  dove: "BQ-UI-Dove.png",
  lantern: "BQ-UI-50488e00-7030-4455-ae91-cef5184919d4.png",
  "open-book": "BQ-UI-Bible-Open.png",
  path: "BQ-UI-90f31be5-1ac9-4451-8c4a-125f8e8e993e.png",
  scroll: "BQ-UI-Scroll.png",
  tree: "BQ-UI-b698119c-43bb-4d5a-bcb2-16a77465d896.png",
};

const UTILITY_ATLAS = {
  bird: 0,
  compass: 1,
  cross: 2,
  crown: 3,
  door: 4,
  flower: 5,
  key: 6,
  leaf: 7,
  mountain: 8,
  sun: 9,
};

const CATEGORY_ATLAS = {
  "praying-hands": 0,
  "open-book": 1,
  "service-basket": 2,
  heart: 3,
  links: 4,
  wheat: 5,
  lantern: 6,
  star: 7,
  moon: 8,
  chapel: 9,
  hands: 10,
  people: 11,
  fountain: 12,
  tree: 13,
};

const ALIGNMENT = {
  bird: "bottom", book: "bottom", bookmark: "center", candle: "bottom",
  chapel: "bottom", compass: "center", cross: "bottom", crown: "bottom",
  door: "bottom", dove: "center", flower: "bottom", fountain: "bottom",
  hands: "center", heart: "center", key: "center", lantern: "bottom",
  leaf: "center", links: "center", moon: "center", mountain: "bottom",
  "open-book": "bottom", path: "bottom", people: "bottom",
  "praying-hands": "bottom", scroll: "bottom", "service-basket": "bottom",
  star: "center", sun: "bottom", tree: "bottom", wheat: "bottom",
};

function isMagenta(r, g, b) {
  return r >= 90 && b >= 90 && g <= 110 && r >= g * 1.5 && b >= g * 1.4;
}

function isWhiteBackdrop(r, g, b) {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min >= 180 && max - min <= 70;
}

async function quantizeAdaptive(buffer, width, height, colors = 31) {
  const indexed = await sharp(buffer, {
    raw: { width, height, channels: 4 },
  })
    .png({ palette: true, colours: colors, dither: 0, effort: 10 })
    .toBuffer();
  return sharp(indexed).ensureAlpha().raw().toBuffer();
}

async function magentaToAlpha(input) {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const output = Buffer.alloc(info.width * info.height * 4);
  for (let source = 0, target = 0; source < data.length; source += 3, target += 4) {
    const r = data[source];
    const g = data[source + 1];
    const b = data[source + 2];
    if (isMagenta(r, g, b)) continue;
    output[target] = r;
    output[target + 1] = g;
    output[target + 2] = b;
    output[target + 3] = 255;
  }
  return { data: output, info: { width: info.width, height: info.height, channels: 4 } };
}

async function whiteToAlpha(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  const visited = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  let head = 0;
  let tail = 0;

  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return;
    const point = y * info.width + x;
    if (visited[point]) return;
    const offset = point * 4;
    if (!isWhiteBackdrop(data[offset], data[offset + 1], data[offset + 2])) return;
    visited[point] = 1;
    queue[tail++] = point;
  };

  for (let x = 0; x < info.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, info.height - 1);
  }
  for (let y = 0; y < info.height; y += 1) {
    enqueue(0, y);
    enqueue(info.width - 1, y);
  }
  while (head < tail) {
    const point = queue[head++];
    const x = point % info.width;
    const y = Math.floor(point / info.width);
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }

  for (let point = 0; point < pixels; point += 1) {
    const offset = point * 4;
    if (visited[point]) {
      data.fill(0, offset, offset + 4);
    } else {
      data[offset + 3] = 255;
    }
  }
  return { data, info: { width: info.width, height: info.height, channels: 4 } };
}

function bounds(total, parts, index) {
  const start = Math.round((total * index) / parts);
  const end = Math.round((total * (index + 1)) / parts);
  return { start, size: end - start };
}

async function extractCell(source, columns, rows, index) {
  const column = index % columns;
  const row = Math.floor(index / columns);
  const x = bounds(source.info.width, columns, column);
  const y = bounds(source.info.height, rows, row);
  return sharp(source.data, { raw: source.info })
    .extract({ left: x.start, top: y.start, width: x.size, height: y.size })
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function trimRaw(source) {
  return sharp(source.data, { raw: source.info })
    .trim({ background: [0, 0, 0, 0] })
    .raw()
    .toBuffer({ resolveWithObject: true });
}

function removeSmallComponents(buffer, width, height, minimumSize = 8) {
  const visited = new Uint8Array(width * height);
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || buffer[start * 4 + 3] === 0) continue;
    const component = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length > 0) {
      const point = stack.pop();
      component.push(point);
      const x = point % width;
      const y = Math.floor(point / width);
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
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
  return buffer;
}

// Image-generation atlases can place a one-pixel divider or the extreme edge
// of the neighboring cell inside a crop. The real subjects are fitted into an
// eight-pixel safety frame, so a tiny, very thin component touching that frame
// is atlas residue rather than part of the sprite. Remove it without touching
// detached but intentional details such as candle sparks or star glints.
function removeThinEdgeFragments(buffer, width, height) {
  const visited = new Uint8Array(width * height);
  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || buffer[start * 4 + 3] === 0) continue;
    const component = [];
    const stack = [start];
    visited[start] = 1;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    while (stack.length > 0) {
      const point = stack.pop();
      component.push(point);
      const x = point % width;
      const y = Math.floor(point / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (!visited[next] && buffer[next * 4 + 3] !== 0) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }
    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;
    const touchesSafetyFrame = minX <= 8 || maxX >= width - 9 || minY <= 8 || maxY >= height - 9;
    if (
      touchesSafetyFrame &&
      component.length < 128 &&
      Math.min(componentWidth, componentHeight) <= 3
    ) {
      for (const point of component) buffer.fill(0, point * 4, point * 4 + 4);
    }
  }
  return buffer;
}

function visibleBounds(buffer, width, height) {
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
  return {
    left: minX,
    top: minY,
    width: maxX >= minX ? maxX - minX + 1 : 0,
    height: maxY >= minY ? maxY - minY + 1 : 0,
  };
}

async function fitRaw(source, { maxVisible = 112, alignment = "center", bottom = 120 } = {}) {
  const trimmed = await trimRaw(source);
  const scale = Math.min(maxVisible / trimmed.info.width, maxVisible / trimmed.info.height);
  const width = Math.max(1, Math.round(trimmed.info.width * scale));
  const height = Math.max(1, Math.round(trimmed.info.height * scale));
  const sprite = await sharp(trimmed.data, { raw: trimmed.info })
    .resize(width, height, { kernel: "nearest", fit: "fill" })
    .raw()
    .toBuffer();
  const left = Math.floor((SIZE - width) / 2);
  const top = alignment === "bottom" ? bottom - height : Math.floor((SIZE - height) / 2);
  return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: [0, 0, 0, 0] } })
    .composite([{ input: sprite, raw: { width, height, channels: 4 }, left, top }])
    .raw()
    .toBuffer();
}

async function fitLogicalRaw(
  source,
  {
    logicalSize = SIZE,
    maxVisible = logicalSize - 4,
    alignment = "center",
    bottom = logicalSize - 2,
  } = {}
) {
  const trimmed = await trimRaw(source);
  const scale = Math.min(
    maxVisible / trimmed.info.width,
    maxVisible / trimmed.info.height
  );
  const width = Math.max(1, Math.round(trimmed.info.width * scale));
  const height = Math.max(1, Math.round(trimmed.info.height * scale));
  const sprite = await sharp(trimmed.data, { raw: trimmed.info })
    .resize(width, height, { kernel: "nearest", fit: "fill" })
    .raw()
    .toBuffer();
  const left = Math.floor((logicalSize - width) / 2);
  const top =
    alignment === "bottom"
      ? bottom - height
      : Math.floor((logicalSize - height) / 2);
  return sharp({
    create: {
      width: logicalSize,
      height: logicalSize,
      channels: 4,
      background: [0, 0, 0, 0],
    },
  })
    .composite([
      {
        input: sprite,
        raw: { width, height, channels: 4 },
        left,
        top,
      },
    ])
    .raw()
    .toBuffer();
}

function keepLargestOpaqueComponent(buffer, width, height) {
  const visited = new Uint8Array(width * height);
  const components = [];
  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || buffer[start * 4 + 3] === 0) continue;
    const component = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length > 0) {
      const point = stack.pop();
      component.push(point);
      const x = point % width;
      const y = Math.floor(point / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (!visited[next] && buffer[next * 4 + 3] !== 0) {
            visited[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    components.push(component);
  }
  components.sort((a, b) => b.length - a.length);
  for (const component of components.slice(1)) {
    for (const point of component) buffer.fill(0, point * 4, point * 4 + 4);
  }
  return buffer;
}

function applyBlackContour(buffer, width, height, minimumComponentArea = 1) {
  const black = BLACK;
  const boundary = [];
  const visited = new Uint8Array(width * height);
  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || buffer[start * 4 + 3] === 0) continue;
    const component = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length > 0) {
      const point = stack.pop();
      component.push(point);
      const x = point % width;
      const y = Math.floor(point / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (!visited[next] && buffer[next * 4 + 3] !== 0) {
            visited[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    if (component.length < minimumComponentArea) continue;
    const componentSet = new Set(component);
    for (const point of component) {
      const x = point % width;
      const y = Math.floor(point / width);
      let touchesTransparent = false;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
          const nx = x + dx;
          const ny = y + dy;
          if (
            nx < 0 ||
            ny < 0 ||
            nx >= width ||
            ny >= height ||
            !componentSet.has(ny * width + nx)
          ) {
            touchesTransparent = true;
            break;
          }
      }
      if (touchesTransparent) boundary.push(point);
    }
  }
  for (const point of boundary) {
    const offset = point * 4;
    buffer[offset] = black[0];
    buffer[offset + 1] = black[1];
    buffer[offset + 2] = black[2];
    buffer[offset + 3] = 255;
  }
  return buffer;
}

async function normalizeStrictMascot(source, alignment) {
  let logical = await fitLogicalRaw(source, {
    logicalSize: SIZE,
    maxVisible: 112,
    alignment,
    bottom: 120,
  });
  logical = removeSmallComponents(logical, SIZE, SIZE, 2);
  return keepLargestOpaqueComponent(logical, SIZE, SIZE);
}

async function normalizeOne(source, alignment = "center") {
  let output = await fitRaw(source, { alignment });
  output = removeThinEdgeFragments(removeSmallComponents(output, SIZE, SIZE, 12), SIZE, SIZE);
  const visible = visibleBounds(output, SIZE, SIZE);
  if (Math.max(visible.width, visible.height) < 109) {
    output = await fitRaw(
      { data: output, info: { width: SIZE, height: SIZE, channels: 4 } },
      { alignment }
    );
    output = removeThinEdgeFragments(removeSmallComponents(output, SIZE, SIZE, 12), SIZE, SIZE);
  }
  return output;
}

async function strictifyProductionBuffer(buffer) {
  let strict = await quantizeAdaptive(buffer, SIZE, SIZE, 31);
  strict = applyBlackContour(strict, SIZE, SIZE, 1);
  return strict;
}

async function writeProduction(name, buffer) {
  const file = `${name}.png`;
  const strict = await strictifyProductionBuffer(buffer);
  await fs.mkdir(PRODUCTION_ROOT, { recursive: true });
  const output = path.join(PRODUCTION_ROOT, file);
  await writeAdaptiveIndexed(strict, SIZE, SIZE, output);
}

async function processSmallSprites() {
  const utility = await magentaToAlpha(path.join(SOURCE_ROOT, "utility-atlas-source.png"));
  const categories = await magentaToAlpha(
    path.join(SOURCE_ROOT, "quest-category-atlas-imagegen-original.png")
  );
  const prayer = await magentaToAlpha(path.join(SOURCE_ROOT, "praying-hands-chroma.png"));
  const mascots = await magentaToAlpha(
    path.join(SOURCE_ROOT, "mascot-atlas-chroma-normalized.png")
  );

  for (const name of SMALL_SPRITES) {
    let source;
    if (name === "dove") {
      // This chroma-backed dove was art-directed from SUPPLIED.dove. Using the
      // keyed atlas cell keeps its white body opaque; flood-keying the supplied
      // white-background reference erases feathers that meet the backdrop.
      source = await extractCell(mascots, 3, 3, MASCOT_DOVE_INDEX);
    } else if (name === "praying-hands") {
      source = prayer;
    } else if (Object.hasOwn(SUPPLIED, name)) {
      source = await whiteToAlpha(path.join(UI_ROOT, SUPPLIED[name]));
    } else if (Object.hasOwn(UTILITY_ATLAS, name)) {
      source = await extractCell(utility, 4, 3, UTILITY_ATLAS[name]);
    } else if (Object.hasOwn(CATEGORY_ATLAS, name)) {
      source = await extractCell(categories, 4, 4, CATEGORY_ATLAS[name]);
    } else {
      throw new Error(`No high-resolution source mapping for ${name}`);
    }
    const output = await normalizeOne(source, ALIGNMENT[name]);
    await writeProduction(name, output);
  }
}

async function connectedComponents(source, minimumArea = 100) {
  const { data, info } = source;
  const pixels = info.width * info.height;
  const seen = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  const components = [];
  for (let start = 0; start < pixels; start += 1) {
    if (seen[start] || data[start * 4 + 3] === 0) continue;
    let head = 0;
    let tail = 0;
    let area = 0;
    let minX = info.width;
    let minY = info.height;
    let maxX = -1;
    let maxY = -1;
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const point = queue[head++];
      const x = point % info.width;
      const y = Math.floor(point / info.width);
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) continue;
          const next = ny * info.width + nx;
          if (!seen[next] && data[next * 4 + 3] !== 0) {
            seen[next] = 1;
            queue[tail++] = next;
          }
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

async function processTrees() {
  const source = await magentaToAlpha(path.join(SOURCE_ROOT, "tree-progression-atlas.png"));
  const components = (await connectedComponents(source))
    .sort((a, b) => {
      const rowA = Math.min(3, Math.floor((a.centerY / source.info.height) * 4));
      const rowB = Math.min(3, Math.floor((b.centerY / source.info.height) * 4));
      return rowA - rowB || a.centerX - b.centerX;
    });
  if (components.length !== 20) {
    throw new Error(`Tree source must contain 20 isolated sprites; found ${components.length}`);
  }
  const scale = Math.min(
    118 / Math.max(...components.map(({ width }) => width)),
    114 / Math.max(...components.map(({ height }) => height))
  );
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    const width = Math.max(1, Math.round(component.width * scale));
    const height = Math.max(1, Math.round(component.height * scale));
    const sprite = await sharp(source.data, { raw: source.info })
      .extract({ left: component.left, top: component.top, width: component.width, height: component.height })
      .resize(width, height, { kernel: "nearest", fit: "fill" })
      .raw()
      .toBuffer();
    const frame = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: [0, 0, 0, 0] } })
      .composite([{ input: sprite, raw: { width, height, channels: 4 }, left: Math.floor((SIZE - width) / 2), top: 121 - height }])
      .raw()
      .toBuffer();
    await writeProduction(`tree-stage-${index}`, frame);
  }
}

async function processCandles() {
  const source = await magentaToAlpha(path.join(SOURCE_ROOT, "candle-states-atlas.png"));
  const cells = [];
  for (let index = 0; index < 5; index += 1) {
    cells.push(await trimRaw(await extractCell(source, 5, 1, index)));
  }
  const scale = Math.min(
    116 / Math.max(...cells.map(({ info }) => info.width)),
    116 / Math.max(...cells.map(({ info }) => info.height))
  );
  const frames = [];
  for (const cell of cells) {
    const width = Math.max(1, Math.round(cell.info.width * scale));
    const height = Math.max(1, Math.round(cell.info.height * scale));
    const sprite = await sharp(cell.data, { raw: cell.info })
      .resize(width, height, { kernel: "nearest", fit: "fill" })
      .raw()
      .toBuffer();
    const frame = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: [0, 0, 0, 0] } })
      .composite([{ input: sprite, raw: { width, height, channels: 4 }, left: Math.floor((SIZE - width) / 2), top: 121 - height }])
      .raw()
      .toBuffer();
    frames.push(frame);
  }

  const rowCounts = Array.from({ length: SIZE }, (_, y) => {
    let count = 0;
    for (let x = 0; x < SIZE; x += 1) if (frames[0][(y * SIZE + x) * 4 + 3]) count += 1;
    return count;
  });
  const bodyStart = Math.max(1, rowCounts.findIndex((count) => count >= 20));
  for (let index = 1; index < frames.length; index += 1) {
    const start = bodyStart * SIZE * 4;
    frames[0].copy(frames[index], start, start);
  }
  for (let index = 0; index < CANDLES.length; index += 1) {
    await writeProduction(CANDLES[index], frames[index]);
  }
}

async function processMascots() {
  const source = await magentaToAlpha(path.join(SOURCE_ROOT, MASCOT_SOURCE));
  for (let index = 0; index < MASCOTS.length; index += 1) {
    const name = MASCOTS[index];
    const alignment = name === "mascot-dove" || name === "mascot-key" ? "center" : "bottom";
    const cell = await extractCell(source, 3, 3, index);
    const frame = await normalizeStrictMascot(cell, alignment);
    await writeProduction(name, frame);
  }
}

async function writeAdaptiveIndexed(buffer, width, height, output) {
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
    throw new Error(`${output}: adaptive palette exceeds 255 opaque colors`);
  }

  const palette = [[0, 0, 0], ...colors];
  const scanlines = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width + 1);
    scanlines[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      if (buffer[source + 3] === 0) continue;
      const key = `${buffer[source]},${buffer[source + 1]},${buffer[source + 2]}`;
      scanlines[row + x + 1] = lookup.get(key);
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const png = Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("PLTE", Buffer.from(palette.flat())),
    pngChunk("tRNS", Buffer.from([0, ...colors.map(() => 255)])),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, png);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
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

async function buildPreview(names, file, columns, background) {
  const cellWidth = 152;
  const cellHeight = 152;
  const rows = Math.ceil(names.length / columns);
  const composites = names.map((name, index) => ({
    input: path.join(PRODUCTION_ROOT, `${name}.png`),
    left: (index % columns) * cellWidth + 12,
    top: Math.floor(index / columns) * cellHeight + 12,
  }));
  await sharp({
    create: {
      width: columns * cellWidth,
      height: rows * cellHeight,
      channels: 4,
      background,
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(ROOT, file));
}

async function physicalQa() {
  const files = (await fs.readdir(PRODUCTION_ROOT)).filter((file) => file.endsWith(".png")).sort();
  const expectedFiles = EXPECTED.map((name) => `${name}.png`).sort();
  if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) {
    throw new Error("public/pixel does not match the exact 63-file production contract");
  }
  const black = BLACK.join(",");
  const hashes = new Set();
  for (const file of files) {
    const full = path.join(PRODUCTION_ROOT, file);
    const { data, info } = await sharp(full).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== SIZE || info.height !== SIZE) throw new Error(`${file}: expected 128x128`);
    let opaque = 0;
    let blackPixels = 0;
    let contourPixels = 0;
    let nonBlackContourPixels = 0;
    let lightPixels = 0;
    const opaqueColors = new Set();
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const offset = (y * SIZE + x) * 4;
        const alpha = data[offset + 3];
        if (alpha !== 0 && alpha !== 255) throw new Error(`${file}: partial alpha ${alpha}`);
        if ((x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1) && alpha !== 0) {
          throw new Error(`${file}: opaque outer-border pixel at ${x},${y}`);
        }
        if (alpha) {
          opaque += 1;
          const color = `${data[offset]},${data[offset + 1]},${data[offset + 2]}`;
          opaqueColors.add(color);
          if (color === black) blackPixels += 1;
          const isContour = [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1],
          ].some(([neighborX, neighborY]) => {
            if (
              neighborX < 0 ||
              neighborY < 0 ||
              neighborX >= SIZE ||
              neighborY >= SIZE
            ) {
              return true;
            }
            return data[(neighborY * SIZE + neighborX) * 4 + 3] === 0;
          });
          if (isContour) {
            contourPixels += 1;
            if (color !== black) nonBlackContourPixels += 1;
          }
          if (data[offset] >= 180 && data[offset + 1] >= 165 && data[offset + 2] >= 120) {
            lightPixels += 1;
          }
        }
      }
    }
    if (opaque === 0) throw new Error(`${file}: empty sprite`);
    if (blackPixels === 0) throw new Error(`${file}: missing exact-black outline`);
    if (opaqueColors.size > 32) {
      throw new Error(`${file}: ${opaqueColors.size} opaque colors exceeds the 32-color budget`);
    }
    if (contourPixels === 0 || nonBlackContourPixels !== 0) {
      throw new Error(
        `${file}: exterior contour contains ${nonBlackContourPixels} non-black pixels`
      );
    }
    if (file === "dove.png" && (opaque < 4000 || lightPixels / opaque < 0.4)) {
      throw new Error(`${file}: white body was lost while removing the source backdrop`);
    }
    const digest = await sharp(full).raw().toBuffer();
    hashes.add(digest.toString("base64"));
  }
  if (hashes.size !== 63) throw new Error(`Expected 63 distinct sprites; found ${hashes.size}`);
  console.log(`Physical QA passed: ${files.length} distinct 128x128 indexed sprites.`);
}

await processSmallSprites();
await processCandles();
await processTrees();
await processMascots();
await physicalQa();
await Promise.all([
  buildPreview(SMALL_SPRITES, "production-128-icons-preview.png", 6, "#f6e9d1"),
  buildPreview(SMALL_SPRITES, "production-128-icons-green-preview.png", 6, "#173e2b"),
  buildPreview(TREES, "production-128-trees-preview.png", 5, "#f6e9d1"),
  buildPreview(MASCOTS, "production-128-mascots-preview.png", 4, "#f6e9d1"),
  buildPreview(CANDLES, "production-128-candles-preview.png", 5, "#f6e9d1"),
]);

console.log(`Wrote ${EXPECTED.length} reviewed candidates to ${PRODUCTION_ROOT}`);
