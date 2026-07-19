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
const EXPECTED_PRODUCTION_PNGS = 63;
const NATIVE_CANVAS = 128;

type PngSpec = {
  maxOpaqueColors: number;
};

const OPAQUE_COLOR_BUDGET_OVERRIDES = new Map<string, number>([
  ["chapel.png", 28],
  ["fountain.png", 22],
  ["people.png", 28],
  ["mascot-dove.png", 24],
  ["mascot-map.png", 24],
  ["mascot-scroll.png", 28],
]);

function physicalPngSpec(src: string): PngSpec {
  const filename = path.basename(src);
  const override = OPAQUE_COLOR_BUDGET_OVERRIDES.get(filename);
  if (override != null) return { maxOpaqueColors: override };
  if (filename.startsWith("mascot-")) {
    return { maxOpaqueColors: 24 };
  }
  if (/^tree-stage-(?:[0-9]|1[0-9])\.png$/.test(filename)) {
    return { maxOpaqueColors: 28 };
  }
  return { maxOpaqueColors: 22 };
}

function registryPngSources() {
  return [
    ...Object.values(PIXEL_SPRITES),
    ...Object.values(PIXEL_MASCOTS),
  ]
    .filter(
      (asset): asset is Extract<PixelAsset, { kind: "png" }> =>
        asset.kind === "png"
    )
    .map((asset) => asset.src)
    .sort();
}

function pngFile(name: string, asset: Extract<PixelAsset, { kind: "png" }>) {
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
  if (asset.kind === "grid") {
    expect(asset.rows.length, `${name} has no rows`).toBeGreaterThan(0);
    const width = asset.rows[0]?.length ?? 0;
    expect(width, `${name} has no width`).toBeGreaterThan(0);
    expect(
      asset.rows.every((row) => row.length === width),
      `${name} rows differ`
    ).toBe(true);

    const used = new Set(asset.rows.join(""));
    for (const color of used) {
      expect(
        asset.palette[color],
        `${name} uses undefined color '${color}'`
      ).toBeDefined();
    }
    expect(asset.palette["."], `${name} needs a transparent color`).toBe(
      "transparent"
    );
    expect(used.has("."), `${name} must preserve transparent canvas space`).toBe(
      true
    );
    return;
  }

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
  const content =
    asset.kind === "grid"
      ? Buffer.from(`${asset.rows.join("\n")}\n${JSON.stringify(asset.palette)}`)
      : pngFile(name, asset);
  return createHash("sha256").update(content).digest("hex");
}

function expectLogicalCanvas(
  name: string,
  asset: PixelAsset,
  width: number,
  height: number
) {
  if (asset.kind === "grid") {
    expect(asset.rows, name).toHaveLength(height);
    expect(asset.rows.every((row) => row.length === width), name).toBe(true);
    return;
  }
  expect(asset.cols, `${name} logical width`).toBe(width);
  expect(asset.rows, `${name} logical height`).toBe(height);
}

async function expectProductionPng(
  name: string,
  asset: Extract<PixelAsset, { kind: "png" }>
) {
  const bytes = pngFile(name, asset);
  const expected = physicalPngSpec(asset.src);
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
  let blackPixels = 0;
  let legacyGreenOutlinePixels = 0;
  let contourPixels = 0;
  let nonBlackContourPixels = 0;
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
        const isBlack =
          data[offset] === 0 &&
          data[offset + 1] === 0 &&
          data[offset + 2] === 0;
        if (
          isBlack
        ) {
          blackPixels += 1;
        }
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
        if (isContour) {
          contourPixels += 1;
          if (!isBlack) nonBlackContourPixels += 1;
        }
        if (
          data[offset] === 0x10 &&
          data[offset + 1] === 0x2b &&
          data[offset + 2] === 0x21
        ) {
          legacyGreenOutlinePixels += 1;
        }
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
  expect.soft(blackPixels, `${name} must use a true-black outline`).toBeGreaterThan(0);
  expect.soft(contourPixels, `${name} must have a visible contour`).toBeGreaterThan(0);
  if (name.startsWith("mascot-")) {
    expect
      .soft(
        nonBlackContourPixels,
        `${name} exterior contour must be pure #000000`
      )
      .toBe(0);
  }
  expect
    .soft(
      legacyGreenOutlinePixels,
      `${name} must not retain the legacy green outline`
    )
    .toBe(0);

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

describe("BibleQuest pixel art system", () => {
  it("keeps every sprite and mascot source valid", () => {
    for (const [name, asset] of Object.entries(PIXEL_SPRITES)) {
      expectValidAsset(name, asset);
    }
    for (const [name, asset] of Object.entries(PIXEL_MASCOTS)) {
      expectValidAsset(`mascot-${name}`, asset);
    }
  });

  it("ships exactly the registered 63-file production sprite catalogue", () => {
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

    expect(manifest.schemaVersion).toBe(4);
    expect(manifest.totalFiles).toBe(EXPECTED_PRODUCTION_PNGS);
    expect(manifest.qualityContract.nativeCanvas).toEqual({
      width: NATIVE_CANVAS,
      height: NATIVE_CANVAS,
    });
    expect(manifest.qualityContract.opaqueColorBudgets).toEqual({
      smallAndCandlesDefault: 22,
      treesDefault: 28,
      mascotsDefault: 24,
      reviewedPerFileExceptions: Object.fromEntries(
        OPAQUE_COLOR_BUDGET_OVERRIDES
      ),
    });
    expect(manifest.families.reduce((sum, family) => sum + family.count, 0)).toBe(
      EXPECTED_PRODUCTION_PNGS
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
        nativeArtGrid: { columns: 32, rows: 32 },
        cellScale: 0.2,
      },
      {
        id: "streak-candles",
        logicalGrid: { columns: 16, rows: 16 },
        nativeArtGrid: { columns: 16, rows: 16 },
        cellScale: 0.75,
      },
      {
        id: "tree-stages",
        logicalGrid: { columns: 32, rows: 32 },
        nativeArtGrid: { columns: 32, rows: 32 },
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

  it("keeps every production PNG on a pixel-safe 128x128 canvas", async () => {
    for (const [name, asset] of Object.entries(PIXEL_SPRITES)) {
      expect(asset.kind, `${name} must use a production PNG`).toBe("png");
      if (asset.kind === "png") await expectProductionPng(name, asset);
    }
    for (const [name, asset] of Object.entries(PIXEL_MASCOTS)) {
      expect(asset.kind, `mascot-${name} must use a production PNG`).toBe(
        "png"
      );
      if (asset.kind === "png") {
        await expectProductionPng(`mascot-${name}`, asset);
      }
    }
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
      if (asset.kind === "png") {
        expect(asset.artCols, `mascot-${name} native art width`).toBe(128);
        expect(asset.artRows, `mascot-${name} native art height`).toBe(128);
      }
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
