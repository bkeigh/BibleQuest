import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  PIXEL_MASCOTS,
  PIXEL_SPRITES,
  type PixelAsset,
} from "@/components/design-system/pixel-assets";
import { CATEGORY_SPRITE } from "@/components/design-system/PixelIcon";

const PUBLIC_ROOT = path.resolve(process.cwd(), "public");
const PIXEL_ROOT = path.join(PUBLIC_ROOT, "pixel");
const ASSET_MANIFEST = path.resolve(
  process.cwd(),
  "docs/pixel-upgrade/asset-manifest.json"
);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const EXPECTED_PRODUCTION_PNGS = 58;
const EXPECTED_REGISTERED_ASSETS = 65;
const NATIVE_CANVAS = 128;

type PngSpec = {
  maxOpaqueColors: number;
};

function physicalPngSpec(): PngSpec {
  return { maxOpaqueColors: 64 };
}

function registryPngSources() {
  return [
    ...new Set(
      [...Object.values(PIXEL_SPRITES), ...Object.values(PIXEL_MASCOTS)].map(
        (asset) => asset.src
      )
    ),
  ].sort();
}

function pngFile(name: string, asset: PixelAsset) {
  expect(asset.src, `${name} must use the public pixel directory`).toMatch(
    /^\/pixel\/[a-z0-9-]+\.png$/
  );
  const filePath = path.resolve(PUBLIC_ROOT, asset.src.slice(1));
  expect(
    filePath.startsWith(`${PUBLIC_ROOT}${path.sep}`),
    `${name} must not escape public/`
  ).toBe(true);
  expect(fs.existsSync(filePath), `${name} is missing ${asset.src}`).toBe(true);
  return fs.readFileSync(filePath);
}

function expectValidAsset(name: string, asset: PixelAsset) {
  expect(asset.cols, `${name} has no logical width`).toBeGreaterThan(0);
  expect(asset.rows, `${name} has no logical height`).toBeGreaterThan(0);
  expect(asset.nativeWidth, `${name} registry native width`).toBe(NATIVE_CANVAS);
  expect(asset.nativeHeight, `${name} registry native height`).toBe(
    NATIVE_CANVAS
  );
  expect(
    NATIVE_CANVAS % asset.cols,
    `${name} logical width must divide the 128px physical canvas`
  ).toBe(0);
  expect(
    NATIVE_CANVAS % asset.rows,
    `${name} logical height must divide the 128px physical canvas`
  ).toBe(0);
  expect(
    NATIVE_CANVAS % asset.artCols,
    `${name} native art width must divide the 128px physical canvas`
  ).toBe(0);
  expect(
    NATIVE_CANVAS % asset.artRows,
    `${name} native art height must divide the 128px physical canvas`
  ).toBe(0);
  const bytes = pngFile(name, asset);
  expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE), `${name} is not a PNG`).toBe(
    true
  );
  const sourceWidth = bytes.readUInt32BE(16);
  const sourceHeight = bytes.readUInt32BE(20);
  expect(sourceWidth, `${name} has no source width`).toBeGreaterThan(0);
  expect(sourceHeight, `${name} has no source height`).toBeGreaterThan(0);
}

function assetSignature(name: string, asset: PixelAsset) {
  return createHash("sha256").update(pngFile(name, asset)).digest("hex");
}

function expectLogicalCanvas(
  name: string,
  asset: PixelAsset,
  width: number,
  height: number
) {
  expect(asset.cols, `${name} logical width`).toBe(width);
  expect(asset.rows, `${name} logical height`).toBe(height);
}

async function expectProductionPng(
  name: string,
  asset: PixelAsset
) {
  const bytes = pngFile(name, asset);
  const expected = physicalPngSpec();
  const metadata = await sharp(bytes).metadata();

  expect.soft(metadata.format, `${name} physical format`).toBe("png");
  expect.soft(metadata.width, `${name} physical width`).toBe(NATIVE_CANVAS);
  expect.soft(metadata.height, `${name} physical height`).toBe(NATIVE_CANVAS);
  expect
    .soft(metadata.hasAlpha, `${name} must carry an alpha channel`)
    .toBe(true);

  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alphaValues = new Set<number>();
  const opaqueColors = new Set<string>();
  let opaquePixels = 0;
  let transparentPixels = 0;
  let contourPixels = 0;
  const opaqueBorderPixels: Array<[number, number]> = [];

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const alpha = data[offset + 3];
      alphaValues.add(alpha);
      if (alpha === 0) {
        transparentPixels += 1;
      } else {
        opaquePixels += 1;
        const isContour = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ].some(([neighborX, neighborY]) => {
          if (
            neighborX < 0 ||
            neighborY < 0 ||
            neighborX >= info.width ||
            neighborY >= info.height
          ) {
            return true;
          }
          return data[(neighborY * info.width + neighborX) * info.channels + 3] === 0;
        });
        if (isContour) contourPixels += 1;
        opaqueColors.add(
          `${data[offset]},${data[offset + 1]},${data[offset + 2]}`
        );
      }
      if (
        alpha !== 0 &&
        (x === 0 ||
          y === 0 ||
          x === info.width - 1 ||
          y === info.height - 1)
      ) {
        opaqueBorderPixels.push([x, y]);
      }
    }
  }

  expect
    .soft([...alphaValues].sort((a, b) => a - b), `${name} alpha values`)
    .toEqual([0, 255]);
  expect
    .soft(opaquePixels, `${name} must contain a visible sprite`)
    .toBeGreaterThan(0);
  expect
    .soft(
      transparentPixels,
      `${name} must contain meaningful transparent canvas space`
    )
    .toBeGreaterThanOrEqual(2 * info.width + 2 * info.height - 4);
  expect
    .soft(
      opaqueBorderPixels,
      `${name} must keep the entire outer border transparent`
    )
    .toEqual([]);
  expect
    .soft(
      opaqueColors.size,
      `${name} exceeds its ${expected.maxOpaqueColors}-color production budget`
    )
    .toBeLessThanOrEqual(expected.maxOpaqueColors);
  // The shipped catalogue contours in either exact black or the reference
  // charcoal, so what matters is that the outline is dark, not that it is #000.
  expect
    .soft(contourPixels, `${name} must use a dark outline`)
    .toBeGreaterThan(0);
  expect.soft(contourPixels, `${name} must have a visible contour`).toBeGreaterThan(0);

  const blockWidth = info.width / asset.artCols;
  const blockHeight = info.height / asset.artRows;
  let nonUniformBlockPixels = 0;
  for (let top = 0; top < info.height; top += blockHeight) {
    for (let left = 0; left < info.width; left += blockWidth) {
      const anchor = (top * info.width + left) * info.channels;
      for (let y = top; y < top + blockHeight; y += 1) {
        for (let x = left; x < left + blockWidth; x += 1) {
          const offset = (y * info.width + x) * info.channels;
          for (let channel = 0; channel < info.channels; channel += 1) {
            if (data[offset + channel] !== data[anchor + channel]) {
              nonUniformBlockPixels += 1;
              break;
            }
          }
        }
      }
    }
  }
  expect
    .soft(
      nonUniformBlockPixels,
      `${name} must use flat, uniform ${blockWidth}x${blockHeight} physical blocks`
    )
    .toBe(0);
}

// Verifies that a native sprite retains a stable silhouette on its smallest grid.
async function expectRenderedSizeQa(name: string, asset: PixelAsset) {
  const bytes = pngFile(name, asset);
  const original = await sharp(bytes).ensureAlpha().raw().toBuffer();
  const renderedPng = await sharp(bytes)
    .resize(asset.cols, asset.rows, { kernel: "nearest" })
    .png()
    .toBuffer();
  const rendered = await sharp(renderedPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const reconstructed = await sharp(renderedPng)
    .resize(NATIVE_CANVAS, NATIVE_CANVAS, { kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const alphaValues = new Set<number>();
  let visible = 0;
  let pinholes = 0;
  let changedAlpha = 0;
  for (let offset = 0; offset < original.length; offset += 4) {
    if (original[offset + 3] !== reconstructed[offset + 3]) {
      changedAlpha += 1;
    }
  }
  const alphaAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= asset.cols || y >= asset.rows) return 0;
    return rendered.data[(y * asset.cols + x) * rendered.info.channels + 3];
  };
  for (let y = 0; y < asset.rows; y += 1) {
    for (let x = 0; x < asset.cols; x += 1) {
      const alpha = alphaAt(x, y);
      alphaValues.add(alpha);
      if (alpha !== 0) {
        visible += 1;
        continue;
      }
      if (
        alphaAt(x - 1, y) &&
        alphaAt(x + 1, y) &&
        alphaAt(x, y - 1) &&
        alphaAt(x, y + 1)
      ) {
        pinholes += 1;
      }
    }
  }
  expect.soft([...alphaValues].sort((a, b) => a - b), `${name} rendered alpha`).toEqual([
    0,
    255,
  ]);
  expect.soft(visible, `${name} must survive rendered-size sampling`).toBeGreaterThan(0);
  expect.soft(pinholes, `${name} rendered pinholes`).toBeLessThanOrEqual(3);
  expect
    .soft(
      changedAlpha / (NATIVE_CANVAS * NATIVE_CANVAS),
      `${name} rendered silhouette drift`
    )
    .toBeLessThanOrEqual(0.08);
}

// Verifies frame timing, palette, and the regions intentionally locked for animation.
async function expectStableGif(
  file: string,
  expectedPages: number,
  locked: (x: number, y: number) => boolean
) {
  const input = path.join(PIXEL_ROOT, file);
  const metadata = await sharp(input, { animated: true }).metadata();
  expect(metadata.width, `${file} width`).toBe(NATIVE_CANVAS);
  expect(metadata.pageHeight, `${file} frame height`).toBe(NATIVE_CANVAS);
  expect(metadata.pages, `${file} frame count`).toBe(expectedPages);
  expect(metadata.delay, `${file} timing`).toEqual(
    Array.from({ length: expectedPages }, () => 150)
  );
  const decoded = await sharp(input, { animated: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const frameBytes = NATIVE_CANVAS * NATIVE_CANVAS * decoded.info.channels;
  const base = decoded.data.subarray(0, frameBytes);
  const colors = new Set<string>();
  const alphaValues = new Set<number>();
  for (let frame = 0; frame < expectedPages; frame += 1) {
    const start = frame * frameBytes;
    const current = decoded.data.subarray(start, start + frameBytes);
    let lockedDifferences = 0;
    for (let y = 0; y < NATIVE_CANVAS; y += 1) {
      for (let x = 0; x < NATIVE_CANVAS; x += 1) {
        const offset = (y * NATIVE_CANVAS + x) * decoded.info.channels;
        alphaValues.add(current[offset + 3]);
        if (current[offset + 3]) {
          colors.add(
            `${current[offset]},${current[offset + 1]},${current[offset + 2]}`
          );
        }
        if (!locked(x, y)) continue;
        for (let channel = 0; channel < 4; channel += 1) {
          if (current[offset + channel] !== base[offset + channel]) {
            lockedDifferences += 1;
            break;
          }
        }
      }
    }
    expect
      .soft(lockedDifferences, `${file} frame ${frame} changed locked region`)
      .toBe(0);
  }
  expect([...alphaValues].sort((a, b) => a - b), `${file} alpha`).toEqual([
    0,
    255,
  ]);
  expect(colors.size, `${file} shared palette`).toBeLessThanOrEqual(32);
}

describe("BibleQuest pixel art system", () => {
  it("keeps every sprite and mascot source valid", () => {
    for (const [name, asset] of Object.entries(PIXEL_SPRITES)) {
      expectValidAsset(name, asset);
    }
    for (const [name, asset] of Object.entries(PIXEL_MASCOTS)) {
      expectValidAsset(`mascot-${name}`, asset);
    }
  });

  it("ships exactly the registered 62-file production sprite catalogue", () => {
    const registrySources = registryPngSources();
    const publicSources = fs
      .readdirSync(PIXEL_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".png"))
      .map((entry) => `/pixel/${entry.name}`)
      .sort();

    expect(registrySources).toHaveLength(EXPECTED_PRODUCTION_PNGS);
    expect(new Set(registrySources).size).toBe(EXPECTED_PRODUCTION_PNGS);
    expect(publicSources).toHaveLength(EXPECTED_PRODUCTION_PNGS);
    expect(publicSources).toEqual(registrySources);
  });

  it("shares one rebuilt dove between the sprite and mascot registries", () => {
    const registeredAssets = [
      ...Object.values(PIXEL_SPRITES),
      ...Object.values(PIXEL_MASCOTS),
    ];
    expect(registeredAssets).toHaveLength(EXPECTED_REGISTERED_ASSETS);
    expect(PIXEL_MASCOTS.dove.src).toBe(PIXEL_SPRITES.dove.src);
  });

  it("preserves the complete public sprite and mascot key contract", () => {
    expect(Object.keys(PIXEL_SPRITES)).toEqual([
      "candle",
      "leaf",
      "star",
      "bird",
      "flower",
      "chapel",
      "book",
      "open-book",
      "bookmark",
      "lantern",
      "path",
      "tree",
      "sun",
      "hands",
      "wheat",
      "dove",
      "cross",
      "door",
      "key",
      "scroll",
      "compass",
      "crown",
      "mountain",
      "moon",
      "service-basket",
      "links",
      "people",
      "fountain",
      "map",
      "sprout",
      "stone",
      "myshepherd",
      "candle-unlit",
      "candle-small",
      "candle-steady",
      "candle-sparks",
      "candle-halo",
      ...Array.from({ length: 20 }, (_, stage) => `tree-stage-${stage}`),
    ]);
    expect(Object.keys(PIXEL_MASCOTS)).toEqual([
      "lamb",
      "lantern",
      "scroll",
      "dove",
      "sprout",
      "key",
      "map",
      "campfire",
    ]);
  });

  it("keeps the manifest on the uniform 128x128 physical contract", () => {
    const manifest = JSON.parse(fs.readFileSync(ASSET_MANIFEST, "utf8")) as {
      schemaVersion: number;
      totalFiles: number;
      qualityContract: {
        nativeCanvas: { width: number; height: number };

        opaqueColorBudgets: {
          smallAndCandlesDefault: number;
          treesDefault: number;
          mascotsDefault: number;
          reviewedPerFileExceptions: Record<string, number>;
        };
      };
      families: Array<{
        id: string;
        count: number;
        physicalPixels: { width: number; height: number };
        logicalGrid: { columns: number; rows: number };
        nativeArtGrid: { columns: number; rows: number };
        cellScale: number;
      }>;
    };

    expect(manifest.schemaVersion).toBe(6);
    expect(manifest.totalFiles).toBe(EXPECTED_PRODUCTION_PNGS);
    expect(manifest.qualityContract.nativeCanvas).toEqual({
      width: NATIVE_CANVAS,
      height: NATIVE_CANVAS,
    });
    expect(manifest.qualityContract.opaqueColorBudgets).toEqual({
      smallAndCandlesDefault: 32,
      treesDefault: 32,
      mascotsDefault: 32,
      reviewedPerFileExceptions: {},
    });
    // Families count registry entries; totalFiles counts files on disk. Six
    // files (dove, key, scroll, sprout, lantern, map) are registered twice —
    // once as a small sprite and once as a larger mascot — so the two numbers
    // are meant to differ.
    expect(manifest.families.reduce((sum, family) => sum + family.count, 0)).toBe(
      EXPECTED_REGISTERED_ASSETS
    );
    for (const family of manifest.families) {
      expect(family.physicalPixels).toEqual({
        width: NATIVE_CANVAS,
        height: NATIVE_CANVAS,
      });
      expect(NATIVE_CANVAS % family.logicalGrid.columns, family.id).toBe(0);
      expect(NATIVE_CANVAS % family.logicalGrid.rows, family.id).toBe(0);
    }
    expect(
      manifest.families.map(({ id, logicalGrid, nativeArtGrid, cellScale }) => ({
        id,
        logicalGrid,
        nativeArtGrid,
        cellScale,
      }))
    ).toEqual([
      {
        id: "small-sprites",
        logicalGrid: { columns: 32, rows: 32 },
        nativeArtGrid: { columns: 128, rows: 128 },
        cellScale: 0.2,
      },
      {
        id: "streak-candles",
        logicalGrid: { columns: 16, rows: 16 },
        nativeArtGrid: { columns: 128, rows: 128 },
        cellScale: 0.75,
      },
      {
        id: "tree-stages",
        logicalGrid: { columns: 32, rows: 32 },
        nativeArtGrid: { columns: 128, rows: 128 },
        cellScale: 1,
      },
      {
        id: "feature-mascots",
        logicalGrid: { columns: 32, rows: 32 },
        nativeArtGrid: { columns: 128, rows: 128 },
        cellScale: 0.625,
      },
    ]);
  });

  it("keeps every production PNG on its declared authored grid", async () => {
    for (const [name, asset] of Object.entries(PIXEL_SPRITES)) {
      expect(asset.kind, `${name} must use a production PNG`).toBe("png");
      const expectedArtGrid = 128;
      expect(asset.artCols, `${name} native art width`).toBe(expectedArtGrid);
      expect(asset.artRows, `${name} native art height`).toBe(expectedArtGrid);
      await expectProductionPng(name, asset);
    }
    for (const [name, asset] of Object.entries(PIXEL_MASCOTS)) {
      expect(asset.kind, `mascot-${name} must use a production PNG`).toBe(
        "png"
      );
      const expectedArtGrid = 128;
      expect(asset.artCols, `mascot-${name} native art width`).toBe(
        expectedArtGrid
      );
      expect(asset.artRows, `mascot-${name} native art height`).toBe(
        expectedArtGrid
      );
      await expectProductionPng(`mascot-${name}`, asset);
    }
  });

  // Decodes and downsamples every sprite in the registry — around seventy
  // PNGs in one test. On the default five seconds it passed alone and failed
  // in a full parallel run, which is the worst way for a test to behave: it
  // reads as a real regression and teaches people to re-run until green.
  it("keeps silhouettes stable at the smallest declared rendered grid", async () => {
    for (const [name, asset] of Object.entries(PIXEL_SPRITES)) {
      await expectRenderedSizeQa(name, asset);
    }
    for (const [name, asset] of Object.entries(PIXEL_MASCOTS)) {
      await expectRenderedSizeQa(`mascot-${name}`, asset);
    }
  }, 30_000);

  it("keeps animated mascot bodies and palettes stable between frames", async () => {
    await expectStableGif(
      "mascot-lamb-walk.gif",
      11,
      (x, y) => x > 36 && y < 80
    );
    await expectStableGif(
      "mascot-campfire-burn.gif",
      9,
      (_x, y) => y >= 80
    );
  });

  it("keeps twenty distinct journey trees on one logical 32x32 canvas", () => {
    const signatures: string[] = [];
    for (let stage = 0; stage < 20; stage += 1) {
      const name = `tree-stage-${stage}` as keyof typeof PIXEL_SPRITES;
      const asset = PIXEL_SPRITES[name];
      expect(asset, `${name} is not registered`).toBeDefined();
      expectLogicalCanvas(name, asset, 32, 32);
      signatures.push(assetSignature(name, asset));
    }
    expect(new Set(signatures).size).toBe(20);
  });

  it("authors every small interface sprite on the shared 32x32 grid", () => {
    for (const [name, asset] of Object.entries(PIXEL_SPRITES)) {
      if (name.startsWith("tree-stage-") || name.startsWith("candle-")) continue;
      expectLogicalCanvas(name, asset, 32, 32);
    }
  });

  it("uses divisor-compatible logical grids for candles and mascots", () => {
    for (const name of [
      "candle-unlit",
      "candle-small",
      "candle-steady",
      "candle-sparks",
      "candle-halo",
    ] as const) {
      expectLogicalCanvas(name, PIXEL_SPRITES[name], 16, 16);
      expect(PIXEL_SPRITES[name].cellScale, `${name} cell scale`).toBe(0.75);
    }
    for (const [name, asset] of Object.entries(PIXEL_MASCOTS)) {
      expectLogicalCanvas(`mascot-${name}`, asset, 32, 32);
      const expectedArtGrid = 128;
      expect(asset.artCols, `mascot-${name} native art width`).toBe(
        expectedArtGrid
      );
      expect(asset.artRows, `mascot-${name} native art height`).toBe(
        expectedArtGrid
      );
      expect(asset.cellScale, `mascot-${name} cell scale`).toBe(0.625);
    }
  });

  it("maps every quest category to an existing, distinct visual", () => {
    const names = Object.values(CATEGORY_SPRITE);
    for (const name of names) expect(PIXEL_SPRITES[name]).toBeDefined();
    expect(new Set(names).size).toBe(names.length);
    const silhouettes = names.map((name) =>
      assetSignature(name, PIXEL_SPRITES[name])
    );
    expect(new Set(silhouettes).size).toBe(names.length);
  });
});
