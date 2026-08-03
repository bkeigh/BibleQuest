/**
 * Rebuilds BibleQuest tree and candle art on its native 128x128 pixel grid.
 *
 * The source catalogue is read-only. Tree stages receive one shared palette
 * and cumulative silhouettes so growth never reverses. Candle states share one
 * canonical body so swapping states cannot move the wax, holder, or base.
 *
 * Usage:
 *   node scripts/remake-pixel-growth-128.mjs
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SIZE = 128;
const CHANNELS = 4;
const SOURCE_DIR = path.resolve("public/pixel");
const OUTPUT_DIR =
  "/Users/brendankenney/Pictures/Assets-BibleQuest/.pixel-remake-work/growth";
const REVIEW_DIR = path.join(OUTPUT_DIR, "_review");

const TREE_STAGE_NAMES = Array.from(
  { length: 20 },
  (_, stage) => `tree-stage-${stage}.png`
);
const TREE_NAMES = [...TREE_STAGE_NAMES, "tree.png"];
const CANDLE_STATE_NAMES = [
  "candle-unlit.png",
  "candle-small.png",
  "candle-steady.png",
  "candle-sparks.png",
  "candle-halo.png",
];
const CANDLE_NAMES = [...CANDLE_STATE_NAMES, "candle.png"];
const ASSIGNED_NAMES = [...TREE_NAMES, ...CANDLE_NAMES];

// This fixed sequence palette keeps bark, leaves, blossoms, and highlights
// stable as the tree grows instead of introducing a new palette per stage.
const TREE_PALETTE = [
  [0, 0, 0, 255],
  [18, 28, 15, 255],
  [30, 58, 24, 255],
  [47, 78, 27, 255],
  [71, 101, 30, 255],
  [103, 132, 30, 255],
  [137, 153, 39, 255],
  [169, 178, 58, 255],
  [205, 200, 85, 255],
  [72, 44, 18, 255],
  [108, 67, 26, 255],
  [151, 99, 36, 255],
  [190, 130, 50, 255],
  [222, 169, 80, 255],
  [245, 218, 126, 255],
  [255, 243, 177, 255],
];

// This fixed candle palette preserves the original warm wax and flame ramps
// while eliminating near-duplicate colors that read as compression noise.
const CANDLE_PALETTE = [
  [0, 0, 0, 255],
  [14, 17, 5, 255],
  [52, 32, 5, 255],
  [85, 48, 9, 255],
  [124, 72, 18, 255],
  [176, 118, 48, 255],
  [211, 155, 88, 255],
  [223, 171, 105, 255],
  [235, 190, 129, 255],
  [242, 203, 147, 255],
  [252, 223, 179, 255],
  [253, 229, 189, 255],
  [254, 250, 225, 255],
  [253, 212, 52, 255],
  [242, 132, 16, 255],
  [255, 255, 240, 255],
];

// Converts a canvas coordinate to a byte offset in an RGBA buffer.
function offsetOf(x, y) {
  return (y * SIZE + x) * CHANNELS;
}

// Produces a stable SHA-256 fingerprint without mutating the file.
async function fileHash(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

// Reads one source PNG only when it is already a native 128x128 RGBA image.
async function readNativePng(name) {
  const file = path.join(SOURCE_DIR, name);
  const metadata = await sharp(file).metadata();
  if (metadata.width !== SIZE || metadata.height !== SIZE) {
    throw new Error(`${name} is ${metadata.width}x${metadata.height}, not 128x128`);
  }
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== CHANNELS) {
    throw new Error(`${name} could not be decoded as RGBA`);
  }
  return Buffer.from(data);
}

// Extracts a binary visibility mask from one native RGBA buffer.
function alphaMask(buffer) {
  const mask = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      mask[y * SIZE + x] = buffer[offsetOf(x, y) + 3] > 0 ? 1 : 0;
    }
  }
  return mask;
}

// Removes only detached single-pixel alpha components, never legitimate detail.
function removeSinglePixelComponents(mask) {
  const cleaned = Uint8Array.from(mask);
  const visited = new Uint8Array(mask.length);
  const neighbors = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    const queue = [start];
    const component = [];
    visited[start] = 1;
    while (queue.length) {
      const point = queue.pop();
      component.push(point);
      const x = point % SIZE;
      const y = Math.floor(point / SIZE);
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const next = ny * SIZE + nx;
        if (mask[next] && !visited[next]) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    if (component.length === 1) cleaned[component[0]] = 0;
  }
  return cleaned;
}

// Unions a new silhouette with all prior tree growth.
function unionMask(previous, current) {
  if (!previous) return Uint8Array.from(current);
  const output = new Uint8Array(current.length);
  for (let point = 0; point < current.length; point += 1) {
    output[point] = previous[point] || current[point] ? 1 : 0;
  }
  return output;
}

// Measures RGB distance with extra weight on luminance-bearing green.
function colorDistance(source, target) {
  const red = source[0] - target[0];
  const green = source[1] - target[1];
  const blue = source[2] - target[2];
  return red * red * 2 + green * green * 3 + blue * blue;
}

// Selects the closest deliberate family color for one source pixel.
function nearestPaletteColor(source, palette) {
  let winner = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of palette) {
    const distance = colorDistance(source, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      winner = candidate;
    }
  }
  return winner;
}

// Reports whether an opaque pixel touches transparent exterior space.
function isExteriorBoundary(mask, x, y) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) return true;
      if (!mask[ny * SIZE + nx]) return true;
    }
  }
  return false;
}

// Recolors a native mask and enforces an exact-black exterior contour.
function renderFrame(mask, colorSource, palette) {
  const output = Buffer.alloc(SIZE * SIZE * CHANNELS);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const point = y * SIZE + x;
      if (!mask[point]) continue;
      const outputOffset = offsetOf(x, y);
      const sourceOffset = outputOffset;
      const color = isExteriorBoundary(mask, x, y)
        ? palette[0]
        : nearestPaletteColor(
            [
              colorSource[sourceOffset],
              colorSource[sourceOffset + 1],
              colorSource[sourceOffset + 2],
            ],
            palette
          );
      output.set(color, outputOffset);
    }
  }
  return output;
}

// Finds the newest source frame that visibly covered one cumulative tree pixel.
function cumulativeColorSource(sources, masks, latestIndex) {
  const output = Buffer.alloc(SIZE * SIZE * CHANNELS);
  for (let point = 0; point < SIZE * SIZE; point += 1) {
    for (let index = latestIndex; index >= 0; index -= 1) {
      if (!masks[index][point]) continue;
      const sourceOffset = point * CHANNELS;
      sources[index].copy(
        output,
        sourceOffset,
        sourceOffset,
        sourceOffset + CHANNELS
      );
      break;
    }
  }
  return output;
}

// Writes one exact-size RGBA PNG without resampling or palette re-quantization.
async function writeNativePng(name, buffer) {
  await sharp(buffer, {
    raw: { width: SIZE, height: SIZE, channels: CHANNELS },
  })
    .png({ compressionLevel: 9, palette: false })
    .toFile(path.join(OUTPUT_DIR, name));
}

// Rebuilds all 20 tree stages with non-reversing silhouettes and one palette.
async function rebuildTreeStages() {
  const sources = await Promise.all(TREE_STAGE_NAMES.map(readNativePng));
  const sourceMasks = sources.map((source) =>
    removeSinglePixelComponents(alphaMask(source))
  );
  const outputs = [];
  const masks = [];
  let cumulative = null;

  for (let index = 0; index < TREE_STAGE_NAMES.length; index += 1) {
    cumulative = unionMask(cumulative, sourceMasks[index]);
    const colorSource = cumulativeColorSource(sources, sourceMasks, index);
    const output = renderFrame(cumulative, colorSource, TREE_PALETTE);
    await writeNativePng(TREE_STAGE_NAMES[index], output);
    outputs.push(output);
    masks.push(Uint8Array.from(cumulative));
  }
  return { outputs, masks };
}

// Rebuilds the standalone mature tree with the same sequence palette.
async function rebuildStandaloneTree() {
  const source = await readNativePng("tree.png");
  const mask = removeSinglePixelComponents(alphaMask(source));
  const output = renderFrame(mask, source, TREE_PALETTE);
  await writeNativePng("tree.png", output);
  return output;
}

// Rebuilds candle states with one canonical body below the flame seam.
async function rebuildCandleStates() {
  const sourceByName = new Map();
  const maskByName = new Map();
  for (const name of CANDLE_STATE_NAMES) {
    sourceByName.set(name, await readNativePng(name));
  }

  const processed = new Map();
  for (const name of CANDLE_STATE_NAMES) {
    const source = sourceByName.get(name);
    const mask = removeSinglePixelComponents(alphaMask(source));
    maskByName.set(name, mask);
    processed.set(name, renderFrame(mask, source, CANDLE_PALETTE));
  }

  const canonicalBody = processed.get("candle-unlit.png");
  const bodyStartByte = 46 * SIZE * CHANNELS;
  // Blackens any seam pixel exposed by at least one flame state before sharing it.
  for (let y = 46; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const point = y * SIZE + x;
      if (!maskByName.get("candle-unlit.png")[point]) continue;
      const exposedInAnyState = CANDLE_STATE_NAMES.some((name) =>
        isExteriorBoundary(maskByName.get(name), x, y)
      );
      if (exposedInAnyState) canonicalBody.set(CANDLE_PALETTE[0], offsetOf(x, y));
    }
  }
  for (const name of CANDLE_STATE_NAMES) {
    const output = processed.get(name);
    canonicalBody.copy(output, bodyStartByte, bodyStartByte);
    await writeNativePng(name, output);
  }
  return CANDLE_STATE_NAMES.map((name) => processed.get(name));
}

// Rebuilds the standalone candle while retaining its distinct larger silhouette.
async function rebuildStandaloneCandle() {
  const source = await readNativePng("candle.png");
  const mask = removeSinglePixelComponents(alphaMask(source));
  const output = renderFrame(mask, source, CANDLE_PALETTE);
  await writeNativePng("candle.png", output);
  return output;
}

// Counts visible colors, alpha values, outline failures, and silhouette bounds.
function inspectBuffer(buffer) {
  const colors = new Set();
  const alphaValues = new Set();
  const mask = alphaMask(buffer);
  let opaquePixels = 0;
  let boundaryFailures = 0;
  let minX = SIZE;
  let minY = SIZE;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const offset = offsetOf(x, y);
      const alpha = buffer[offset + 3];
      alphaValues.add(alpha);
      if (!alpha) continue;
      opaquePixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      colors.add(
        `${buffer[offset]},${buffer[offset + 1]},${buffer[offset + 2]}`
      );
      if (
        isExteriorBoundary(mask, x, y) &&
        (buffer[offset] || buffer[offset + 1] || buffer[offset + 2])
      ) {
        boundaryFailures += 1;
      }
    }
  }

  return {
    dimensions: [SIZE, SIZE],
    opaquePixels,
    opaqueColors: colors.size,
    alphaValues: [...alphaValues].sort((a, b) => a - b),
    bbox: [minX, minY, maxX, maxY],
    exactBlackExteriorFailures: boundaryFailures,
  };
}

// Builds one review sheet using unscaled 128x128 assets on a neutral background.
async function buildReviewSheet(names, title, file, columns) {
  const cellWidth = 156;
  const cellHeight = 176;
  const headerHeight = 34;
  const rows = Math.ceil(names.length / columns);
  const width = columns * cellWidth;
  const height = headerHeight + rows * cellHeight;
  const composites = [];
  let labels = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><style>text{font-family:monospace;fill:#f8edcf} .title{font-size:18px;font-weight:700}.label{font-size:12px}</style><text class="title" x="12" y="23">${title}</text>`;

  for (let index = 0; index < names.length; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = column * cellWidth + 14;
    const top = headerHeight + row * cellHeight + 24;
    const sprite = await sharp(path.join(OUTPUT_DIR, names[index]))
      .png()
      .toBuffer();
    composites.push({ input: sprite, left, top });
    labels += `<text class="label" x="${left}" y="${top - 7}">${names[
      index
    ].replace(".png", "")}</text>`;
  }
  labels += "</svg>";
  composites.unshift({ input: Buffer.from(labels), left: 0, top: 0 });

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 58, g: 83, b: 91, alpha: 1 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(file);
}

// Runs the native-grid rebuild and writes machine- and human-readable QA.
async function main() {
  if (ASSIGNED_NAMES.length !== 27) {
    throw new Error(`Expected 27 assigned files, found ${ASSIGNED_NAMES.length}`);
  }
  await mkdir(REVIEW_DIR, { recursive: true });

  const sourceHashesBefore = Object.fromEntries(
    await Promise.all(
      ASSIGNED_NAMES.map(async (name) => [
        name,
        await fileHash(path.join(SOURCE_DIR, name)),
      ])
    )
  );

  const treeStages = await rebuildTreeStages();
  await rebuildStandaloneTree();
  await rebuildCandleStates();
  await rebuildStandaloneCandle();

  const fileQa = {};
  for (const name of ASSIGNED_NAMES) {
    const { data } = await sharp(path.join(OUTPUT_DIR, name))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    fileQa[name] = inspectBuffer(data);
  }

  const sourceHashesAfter = Object.fromEntries(
    await Promise.all(
      ASSIGNED_NAMES.map(async (name) => [
        name,
        await fileHash(path.join(SOURCE_DIR, name)),
      ])
    )
  );
  const sourceUnchanged =
    JSON.stringify(sourceHashesBefore) === JSON.stringify(sourceHashesAfter);
  const monotonicTreePixels = treeStages.masks.every(
    (mask, index) =>
      index === 0 ||
      mask.reduce((sum, value) => sum + value, 0) >=
        treeStages.masks[index - 1].reduce((sum, value) => sum + value, 0)
  );

  const candleBodyHashes = {};
  for (const name of CANDLE_STATE_NAMES) {
    const { data } = await sharp(path.join(OUTPUT_DIR, name))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    candleBodyHashes[name] = createHash("sha256")
      .update(data.subarray(46 * SIZE * CHANNELS))
      .digest("hex");
  }
  const stableCandleBody =
    new Set(Object.values(candleBodyHashes)).size === 1;
  const allFilesPass = Object.values(fileQa).every(
    (entry) =>
      entry.dimensions[0] === SIZE &&
      entry.dimensions[1] === SIZE &&
      entry.alphaValues.every((value) => value === 0 || value === 255) &&
      entry.opaqueColors <= 16 &&
      entry.exactBlackExteriorFailures === 0
  );

  const qa = {
    assignedCount: ASSIGNED_NAMES.length,
    directNativeCanvas: [SIZE, SIZE],
    resizedAssets: 0,
    allFilesPass,
    sourceUnchanged,
    monotonicTreePixels,
    stableCandleBody,
    paletteCaps: { tree: TREE_PALETTE.length, candle: CANDLE_PALETTE.length },
    candleBodyHashes,
    files: fileQa,
  };
  await writeFile(
    path.join(OUTPUT_DIR, "qa-report.json"),
    `${JSON.stringify(qa, null, 2)}\n`
  );

  const report = `# Growth and candle remake agent report

## Result

- Rebuilt: ${ASSIGNED_NAMES.length} PNG assets
- Canvas: direct native 128x128 RGBA for every output
- Resizing or model compression: none
- Source catalogue unchanged: ${sourceUnchanged ? "yes" : "NO"}
- Strict QA passed: ${allFilesPass ? "yes" : "NO"}

## Method

- Tree stages use a shared 16-color opaque palette and cumulative alpha masks.
- Tree silhouettes can add growth but cannot lose earlier roots, stems, or canopy pixels.
- Every visible exterior boundary pixel is exact black.
- Candle state art uses one identical body from row 46 through row 127.
- Flames, sparks, and halo remain state-specific above the stable body seam.
- Alpha is binary, hard-edged, and authored directly at 128x128.
- Only isolated one-pixel alpha components are removed; intentional clusters remain.

## Sequence checks

- Tree visible area is monotonic: ${monotonicTreePixels ? "pass" : "FAIL"}
- Candle body is byte-identical across five states: ${
    stableCandleBody ? "pass" : "FAIL"
  }
- All output palettes are within the 16-color family caps: ${
    allFilesPass ? "pass" : "FAIL"
  }

See \`qa-report.json\` for per-file dimensions, bounds, palette counts, alpha values, and outline checks.
`;
  await writeFile(path.join(OUTPUT_DIR, "AGENT_REPORT.md"), report);

  await buildReviewSheet(
    TREE_STAGE_NAMES,
    "BibleQuest tree progression — strict native 128",
    path.join(REVIEW_DIR, "tree-progression.png"),
    5
  );
  await buildReviewSheet(
    CANDLE_NAMES,
    "BibleQuest candle states — strict native 128",
    path.join(REVIEW_DIR, "candle-states.png"),
    6
  );

  if (!sourceUnchanged || !allFilesPass || !monotonicTreePixels || !stableCandleBody) {
    throw new Error("Growth remake failed QA; inspect qa-report.json");
  }
  console.log(
    `Rebuilt and verified ${ASSIGNED_NAMES.length} growth assets in ${OUTPUT_DIR}`
  );
}

await main();
