/**
 * Builds nearest-neighbor review sheets for a strict 128x128 sprite remake.
 *
 * Usage:
 *   node scripts/build-pixel-remake-review.mjs <source-dir> <candidate-dir> <output-dir>
 */
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ASSET_PATTERN = /\.(?:png|gif)$/i;
const SCALE = 2;
const ART_SIZE = 128 * SCALE;
const CELL_WIDTH = 560;
const CELL_HEIGHT = 320;
const COLUMNS = 3;
const PAGE_SIZE = 12;

/** Escapes a filename before placing it in SVG review labels. */
function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}

/** Creates a crisp checkerboard behind transparent sprite pixels. */
function checkerboard(width, height, tile = 16) {
  const squares = [];
  for (let y = 0; y < height; y += tile) {
    for (let x = 0; x < width; x += tile) {
      squares.push(
        `<rect x="${x}" y="${y}" width="${tile}" height="${tile}" fill="${
          (x / tile + y / tile) % 2 === 0 ? "#f4eddd" : "#ddd2bd"
        }"/>`
      );
    }
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${squares.join("")}</svg>`
  );
}

/** Renders one animation's first composited frame for static review. */
async function renderSprite(file) {
  return sharp(file, { page: 0 })
    .resize(ART_SIZE, ART_SIZE, {
      fit: "fill",
      kernel: sharp.kernel.nearest,
    })
    .png()
    .toBuffer();
}

/** Builds one source-versus-remake review page. */
async function buildPage({
  names,
  sourceDirectory,
  candidateDirectory,
  output,
}) {
  const rows = Math.ceil(names.length / COLUMNS);
  const width = COLUMNS * CELL_WIDTH;
  const height = rows * CELL_HEIGHT;
  const layers = [];
  const background = checkerboard(ART_SIZE, ART_SIZE);

  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const cellX = (index % COLUMNS) * CELL_WIDTH;
    const cellY = Math.floor(index / COLUMNS) * CELL_HEIGHT;
    const sourceLeft = cellX + 12;
    const candidateLeft = cellX + 292;
    const artTop = cellY + 44;
    layers.push(
      { input: background, left: sourceLeft, top: artTop },
      { input: background, left: candidateLeft, top: artTop },
      {
        input: await renderSprite(path.join(sourceDirectory, name)),
        left: sourceLeft,
        top: artTop,
      },
      {
        input: await renderSprite(path.join(candidateDirectory, name)),
        left: candidateLeft,
        top: artTop,
      }
    );
    const label = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_WIDTH}" height="44">
        <rect width="100%" height="100%" fill="#20343a"/>
        <text x="12" y="19" fill="#fff6df" font-family="Arial, sans-serif" font-size="15" font-weight="700">${escapeXml(name)}</text>
        <text x="12" y="38" fill="#a9c0c4" font-family="Arial, sans-serif" font-size="12">ORIGINAL</text>
        <text x="292" y="38" fill="#f1c75b" font-family="Arial, sans-serif" font-size="12">REMAKE</text>
      </svg>`
    );
    layers.push({ input: label, left: cellX, top: cellY });
  }

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: "#20343a",
    },
  })
    .composite(layers)
    .png()
    .toFile(output);
}

/** Splits the complete catalogue into readable comparison pages. */
async function main() {
  const [sourceDirectory, candidateDirectory, outputDirectory] =
    process.argv.slice(2);
  if (!sourceDirectory || !candidateDirectory || !outputDirectory) {
    throw new Error(
      "Usage: node scripts/build-pixel-remake-review.mjs <source-dir> <candidate-dir> <output-dir>"
    );
  }
  const names = (await readdir(candidateDirectory))
    .filter((name) => ASSET_PATTERN.test(name))
    .sort();
  await mkdir(outputDirectory, { recursive: true });
  for (let start = 0; start < names.length; start += PAGE_SIZE) {
    const page = Math.floor(start / PAGE_SIZE) + 1;
    await buildPage({
      names: names.slice(start, start + PAGE_SIZE),
      sourceDirectory,
      candidateDirectory,
      output: path.join(
        outputDirectory,
        `source-vs-remake-${String(page).padStart(2, "0")}.png`
      ),
    });
  }
}

await main();
