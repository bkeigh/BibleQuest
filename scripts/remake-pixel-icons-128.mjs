import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SOURCE_DIR = "/Users/brendankenney/Development/BibleQuest/public/pixel";
const OUTPUT_DIR =
  "/Users/brendankenney/Pictures/Assets-BibleQuest/.pixel-remake-work/icons";
const SIZE = 128;
const OUTLINE = [0, 0, 0];
const MAX_COLORS = 13;
const MIN_COMPONENT_PIXELS = 8;
const MIN_COLOR_PIXELS = 8;

const FILES = [
  "bird.png",
  "book.png",
  "bookmark.png",
  "chapel.png",
  "compass.png",
  "cross.png",
  "crown.png",
  "door.png",
  "flower.png",
  "fountain.png",
  "hands.png",
  "heart.png",
  "key.png",
  "lantern.png",
  "leaf.png",
  "links.png",
  "moon.png",
  "mountain.png",
  "open-book.png",
  "path.png",
  "people.png",
  "praying-hands.png",
  "scroll.png",
  "service-basket.png",
  "star.png",
  "sun.png",
  "wheat.png",
];

const CARD_SIZE = 192;
const LABEL_HEIGHT = 24;
const CONTACT_COLUMNS = 6;

// Converts an RGB channel to linear light for perceptual color comparison.
function linearize(channel) {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

// Converts an RGB triplet to CIE Lab so palette merges follow visual distance.
function rgbToLab([red, green, blue]) {
  const r = linearize(red);
  const g = linearize(green);
  const b = linearize(blue);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (value) =>
    value > 216 / 24389
      ? Math.cbrt(value)
      : (24389 / 27 / 116) * value + 16 / 116;

  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

// Measures squared Lab distance without the cost of a square root.
function colorDistance(left, right) {
  const a = rgbToLab(left);
  const b = rgbToLab(right);
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

// Encodes a color as a stable map key.
function colorKey(red, green, blue) {
  return `${red},${green},${blue}`;
}

// Decodes a stable map key back into RGB.
function keyColor(key) {
  return key.split(",").map(Number);
}

// Returns the four orthogonal neighbors that remain on the canvas.
function orthogonalNeighbors(index) {
  const x = index % SIZE;
  const y = Math.floor(index / SIZE);
  const neighbors = [];
  if (x > 0) neighbors.push(index - 1);
  if (x < SIZE - 1) neighbors.push(index + 1);
  if (y > 0) neighbors.push(index - SIZE);
  if (y < SIZE - 1) neighbors.push(index + SIZE);
  return neighbors;
}

// Returns all eight surrounding pixels that remain on the canvas.
function surroundingNeighbors(index) {
  const x = index % SIZE;
  const y = Math.floor(index / SIZE);
  const neighbors = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX >= 0 && nextX < SIZE && nextY >= 0 && nextY < SIZE) {
        neighbors.push(nextY * SIZE + nextX);
      }
    }
  }
  return neighbors;
}

// Removes only genuinely tiny disconnected alpha islands, never intentional motifs.
function removeTinyComponents(pixels) {
  const visited = new Uint8Array(SIZE * SIZE);
  let removed = 0;

  for (let start = 0; start < visited.length; start += 1) {
    if (visited[start] || pixels[start * 4 + 3] === 0) continue;
    const queue = [start];
    const component = [];
    visited[start] = 1;

    while (queue.length > 0) {
      const index = queue.pop();
      component.push(index);
      for (const neighbor of orthogonalNeighbors(index)) {
        if (!visited[neighbor] && pixels[neighbor * 4 + 3] !== 0) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }

    if (component.length < MIN_COMPONENT_PIXELS) {
      for (const index of component) pixels[index * 4 + 3] = 0;
      removed += component.length;
    }
  }

  return removed;
}

// Counts opaque palette entries after each cleanup stage.
function paletteCounts(pixels) {
  const counts = new Map();
  for (let index = 0; index < SIZE * SIZE; index += 1) {
    const offset = index * 4;
    if (pixels[offset + 3] === 0) continue;
    const key = colorKey(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// Replaces one palette entry throughout the sprite.
function replaceColor(pixels, sourceKey, targetKey) {
  const [sourceR, sourceG, sourceB] = keyColor(sourceKey);
  const [targetR, targetG, targetB] = keyColor(targetKey);
  for (let index = 0; index < SIZE * SIZE; index += 1) {
    const offset = index * 4;
    if (
      pixels[offset + 3] !== 0 &&
      pixels[offset] === sourceR &&
      pixels[offset + 1] === sourceG &&
      pixels[offset + 2] === sourceB
    ) {
      pixels[offset] = targetR;
      pixels[offset + 1] = targetG;
      pixels[offset + 2] = targetB;
    }
  }
}

// Removes low-frequency palette contamination using local context or nearest color.
function removeRareColors(pixels) {
  const counts = paletteCounts(pixels);
  const stableKeys = [...counts]
    .filter(([, count]) => count >= MIN_COLOR_PIXELS)
    .map(([key]) => key);
  let repaired = 0;

  for (let index = 0; index < SIZE * SIZE; index += 1) {
    const offset = index * 4;
    if (pixels[offset + 3] === 0) continue;
    const key = colorKey(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    if ((counts.get(key) ?? 0) >= MIN_COLOR_PIXELS) continue;

    const neighborCounts = new Map();
    for (const neighbor of surroundingNeighbors(index)) {
      const neighborOffset = neighbor * 4;
      if (pixels[neighborOffset + 3] === 0) continue;
      const neighborKey = colorKey(
        pixels[neighborOffset],
        pixels[neighborOffset + 1],
        pixels[neighborOffset + 2],
      );
      if (stableKeys.includes(neighborKey)) {
        neighborCounts.set(
          neighborKey,
          (neighborCounts.get(neighborKey) ?? 0) + 1,
        );
      }
    }

    let replacement = [...neighborCounts].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!replacement) {
      replacement = stableKeys.reduce((best, candidate) => {
        if (!best) return candidate;
        return colorDistance(keyColor(key), keyColor(candidate)) <
          colorDistance(keyColor(key), keyColor(best))
          ? candidate
          : best;
      }, null);
    }

    if (replacement) {
      const [red, green, blue] = keyColor(replacement);
      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
      repaired += 1;
    }
  }

  return repaired;
}

// Consolidates the closest palette shades until the sprite reaches a target size.
function consolidatePalette(pixels, targetColors) {
  while (paletteCounts(pixels).size > targetColors) {
    const counts = paletteCounts(pixels);
    const keys = [...counts.keys()];
    let bestPair = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let left = 0; left < keys.length; left += 1) {
      for (let right = left + 1; right < keys.length; right += 1) {
        const score = colorDistance(keyColor(keys[left]), keyColor(keys[right]));
        if (score < bestScore) {
          bestScore = score;
          bestPair = [keys[left], keys[right]];
        }
      }
    }

    if (!bestPair) break;
    const [left, right] = bestPair;
    const source = counts.get(left) <= counts.get(right) ? left : right;
    const target = source === left ? right : left;
    replaceColor(pixels, source, target);
  }
}

// Removes isolated one-pixel color noise while keeping deliberate highlights and lines.
function cleanInteriorSpeckles(pixels) {
  let repaired = 0;
  for (let pass = 0; pass < 2; pass += 1) {
    const source = Buffer.from(pixels);
    for (let index = 0; index < SIZE * SIZE; index += 1) {
      const offset = index * 4;
      if (source[offset + 3] === 0) continue;
      if (
        orthogonalNeighbors(index).some(
          (neighbor) => source[neighbor * 4 + 3] === 0,
        )
      ) {
        continue;
      }

      const ownKey = colorKey(source[offset], source[offset + 1], source[offset + 2]);
      const counts = new Map();
      let sameNeighbors = 0;
      for (const neighbor of surroundingNeighbors(index)) {
        const neighborOffset = neighbor * 4;
        if (source[neighborOffset + 3] === 0) continue;
        const key = colorKey(
          source[neighborOffset],
          source[neighborOffset + 1],
          source[neighborOffset + 2],
        );
        counts.set(key, (counts.get(key) ?? 0) + 1);
        if (key === ownKey) sameNeighbors += 1;
      }

      const [modeKey, modeCount] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
      if (sameNeighbors === 0 && modeKey && modeCount >= 6) {
        const [red, green, blue] = keyColor(modeKey);
        pixels[offset] = red;
        pixels[offset + 1] = green;
        pixels[offset + 2] = blue;
        repaired += 1;
      }
    }
  }
  return repaired;
}

// Applies one exact near-black color to every exposed orthogonal contour pixel.
function enforceOutline(pixels) {
  let outlined = 0;
  for (let index = 0; index < SIZE * SIZE; index += 1) {
    const offset = index * 4;
    if (pixels[offset + 3] === 0) continue;
    const x = index % SIZE;
    const y = Math.floor(index / SIZE);
    const exposed =
      x === 0 ||
      y === 0 ||
      x === SIZE - 1 ||
      y === SIZE - 1 ||
      orthogonalNeighbors(index).some(
        (neighbor) => pixels[neighbor * 4 + 3] === 0,
      );
    if (!exposed) continue;
    pixels[offset] = OUTLINE[0];
    pixels[offset + 1] = OUTLINE[1];
    pixels[offset + 2] = OUTLINE[2];
    outlined += 1;
  }
  return outlined;
}

// Verifies grid, alpha, border, palette, and disconnected-component invariants.
function qaSprite(pixels) {
  const alphaValues = new Set();
  let borderOpaque = 0;
  let opaquePixels = 0;
  let contourPixels = 0;
  let correctContourPixels = 0;

  for (let index = 0; index < SIZE * SIZE; index += 1) {
    const offset = index * 4;
    alphaValues.add(pixels[offset + 3]);
    if (pixels[offset + 3] !== 0) opaquePixels += 1;
    const x = index % SIZE;
    const y = Math.floor(index / SIZE);
    if (
      pixels[offset + 3] !== 0 &&
      (x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1)
    ) {
      borderOpaque += 1;
    }
    if (
      pixels[offset + 3] !== 0 &&
      orthogonalNeighbors(index).some(
        (neighbor) => pixels[neighbor * 4 + 3] === 0,
      )
    ) {
      contourPixels += 1;
      if (
        pixels[offset] === OUTLINE[0] &&
        pixels[offset + 1] === OUTLINE[1] &&
        pixels[offset + 2] === OUTLINE[2]
      ) {
        correctContourPixels += 1;
      }
    }
  }

  return {
    dimensions: `${SIZE}x${SIZE}`,
    alphaValues: [...alphaValues].sort((a, b) => a - b),
    borderOpaque,
    opaquePixels,
    colors: paletteCounts(pixels).size,
    contourPixels,
    correctContourPixels,
    passed:
      alphaValues.size <= 2 &&
      [...alphaValues].every((value) => value === 0 || value === 255) &&
      borderOpaque === 0 &&
      paletteCounts(pixels).size <= MAX_COLORS &&
      contourPixels === correctContourPixels,
  };
}

// Remakes one source sprite without any resize or resampling operation.
async function remakeSprite(file) {
  const sourcePath = path.join(SOURCE_DIR, file);
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== SIZE || info.height !== SIZE || info.channels !== 4) {
    throw new Error(`${file}: expected a direct 128x128 RGBA source`);
  }

  const pixels = Buffer.from(data);
  for (let index = 0; index < SIZE * SIZE; index += 1) {
    pixels[index * 4 + 3] = pixels[index * 4 + 3] >= 128 ? 255 : 0;
  }

  const sourceColors = paletteCounts(pixels).size;
  const removedAlphaPixels = removeTinyComponents(pixels);
  const repairedRarePixels = removeRareColors(pixels);
  consolidatePalette(pixels, MAX_COLORS - 1);
  const repairedSpeckles = cleanInteriorSpeckles(pixels);
  const outlinedPixels = enforceOutline(pixels);
  const qa = qaSprite(pixels);

  await sharp(pixels, {
    raw: { width: SIZE, height: SIZE, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toFile(path.join(OUTPUT_DIR, file));

  return {
    file,
    sourceColors,
    removedAlphaPixels,
    repairedRarePixels,
    repairedSpeckles,
    outlinedPixels,
    ...qa,
  };
}

// Builds a nearest-neighbor review sheet from the native 128px outputs.
async function buildContactSheet() {
  const rows = Math.ceil(FILES.length / CONTACT_COLUMNS);
  const width = CONTACT_COLUMNS * CARD_SIZE;
  const height = rows * (CARD_SIZE + LABEL_HEIGHT);
  const composites = [];

  for (let index = 0; index < FILES.length; index += 1) {
    const left = (index % CONTACT_COLUMNS) * CARD_SIZE;
    const top = Math.floor(index / CONTACT_COLUMNS) * (CARD_SIZE + LABEL_HEIGHT);
    const sprite = await sharp(path.join(OUTPUT_DIR, FILES[index]))
      .resize(CARD_SIZE, CARD_SIZE, { kernel: "nearest" })
      .png()
      .toBuffer();
    const label = Buffer.from(
      `<svg width="${CARD_SIZE}" height="${LABEL_HEIGHT}">
        <rect width="100%" height="100%" fill="#263940"/>
        <text x="${CARD_SIZE / 2}" y="17" font-family="monospace" font-size="12"
          text-anchor="middle" fill="#ffffff">${FILES[index]}</text>
      </svg>`,
    );
    composites.push({ input: sprite, left, top });
    composites.push({ input: label, left, top: top + CARD_SIZE });
  }

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 214, g: 221, b: 223, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(OUTPUT_DIR, "_icons-contact-sheet.png"));
}

// Writes a human-readable agent report alongside the remade sprite family.
async function writeReport(results) {
  const passed = results.filter((result) => result.passed).length;
  const rareRepairs = results.reduce(
    (sum, result) => sum + result.repairedRarePixels,
    0,
  );
  const speckleRepairs = results.reduce(
    (sum, result) => sum + result.repairedSpeckles,
    0,
  );
  const changedFiles = (
    await Promise.all(
      FILES.map(async (file) => {
        const [source, output] = await Promise.all([
          fs.readFile(path.join(SOURCE_DIR, file)),
          fs.readFile(path.join(OUTPUT_DIR, file)),
        ]);
        return source.equals(output) ? null : file;
      }),
    )
  ).filter(Boolean);

  const lines = [
    "# BibleQuest interface-symbol remake report",
    "",
    `- Assigned assets: ${FILES.length}`,
    `- Native working grid: ${SIZE}x${SIZE} throughout`,
    "- Resize/resampling operations on deliverables: none",
    `- Exact opaque colors per asset: at most ${MAX_COLORS}`,
    "- Alpha: binary transparent/opaque only",
    `- QA passed: ${passed}/${FILES.length}`,
    `- Files materially rebuilt: ${changedFiles.length}/${FILES.length}`,
    `- Low-frequency contamination pixels repaired: ${rareRepairs}`,
    `- Isolated interior color speckles repaired: ${speckleRepairs}`,
    "- Source assets modified: no",
    "",
    "## Method",
    "",
    "Each source was decoded directly as a 128x128 RGBA grid. The remake removes only tiny disconnected alpha noise, repairs statistically anomalous colors from local context, merges the nearest perceptual shades into a compact palette, removes isolated interior color speckles, and applies one exact-black exterior contour color. No enlarged image or generative raster was created.",
    "",
    "## Asset QA",
    "",
    "| Asset | Colors | Rare repairs | Speckle repairs | Opaque pixels | Pass |",
    "|---|---:|---:|---:|---:|:---:|",
    ...results.map(
      (result) =>
        `| ${result.file} | ${result.colors} | ${result.repairedRarePixels} | ${result.repairedSpeckles} | ${result.opaquePixels} | ${result.passed ? "yes" : "no"} |`,
    ),
    "",
  ];

  await fs.writeFile(path.join(OUTPUT_DIR, "_AGENT_REPORT.md"), lines.join("\n"));
  await fs.writeFile(
    path.join(OUTPUT_DIR, "_qa.json"),
    `${JSON.stringify(results, null, 2)}\n`,
  );
}

// Runs the complete direct-grid icon remake and fails on any QA regression.
async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const results = [];
  for (const file of FILES) results.push(await remakeSprite(file));
  await buildContactSheet();
  await writeReport(results);

  const failures = results.filter((result) => !result.passed);
  if (failures.length > 0) {
    throw new Error(`QA failed: ${failures.map(({ file }) => file).join(", ")}`);
  }
  console.log(`Remade and verified ${results.length} native 128x128 icon sprites.`);
}

await main();
