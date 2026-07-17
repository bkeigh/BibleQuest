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
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const EXPECTED_PRODUCTION_PNGS = 63;

type PngSpec = {
  width: number;
  height: number;
  maxOpaqueColors: number;
};

function physicalPngSpec(src: string): PngSpec {
  const filename = path.basename(src);
  if (filename.startsWith("mascot-")) {
    return { width: 48, height: 48, maxOpaqueColors: 20 };
  }
  if (/^tree-stage-(?:[0-9]|1[0-9])\.png$/.test(filename)) {
    return { width: 64, height: 64, maxOpaqueColors: 24 };
  }
  if (
    /^candle-(?:unlit|small|steady|sparks|halo)\.png$/.test(filename)
  ) {
    return { width: 32, height: 36, maxOpaqueColors: 16 };
  }
  return { width: 32, height: 32, maxOpaqueColors: 16 };
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
  const bytes = pngFile(name, asset);
  expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE), `${name} is not a PNG`).toBe(
    true
  );
  const sourceWidth = bytes.readUInt32BE(16);
  const sourceHeight = bytes.readUInt32BE(20);
  expect(sourceWidth, `${name} has no source width`).toBeGreaterThan(0);
  expect(sourceHeight, `${name} has no source height`).toBeGreaterThan(0);
  expect(
    sourceWidth % asset.cols,
    `${name} source width must scale cleanly to its logical grid`
  ).toBe(0);
  expect(
    sourceHeight % asset.rows,
    `${name} source height must scale cleanly to its logical grid`
  ).toBe(0);
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
  expect.soft(metadata.width, `${name} physical width`).toBe(expected.width);
  expect.soft(metadata.height, `${name} physical height`).toBe(expected.height);
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

  it("keeps every production PNG physically pixel-safe", async () => {
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
