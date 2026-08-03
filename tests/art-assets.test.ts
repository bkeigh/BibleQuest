import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  ART_MASCOTS,
  ART_SPRITES,
  ART_VISUAL_WEIGHT,
  type ArtAsset,
} from "@/components/design-system/art-assets";
import { CATEGORY_ART } from "@/components/design-system/ArtIcon";

const PUBLIC_ROOT = path.resolve(process.cwd(), "public");
const ART_ROOT = path.join(PUBLIC_ROOT, "art", "2.5d");
const EXPECTED_STATIC_ASSETS = 58;
const EXPECTED_CANDLE_LOOPS = 6;
const NATIVE_CANVAS = 512;

// Resolve a public URL without allowing a registry path to escape public/.
function publicFile(src: string): string {
  expect(src).toMatch(/^\/art\/2\.5d\/[a-z0-9/.-]+$/);
  const resolved = path.resolve(PUBLIC_ROOT, src.slice(1));
  expect(resolved.startsWith(`${PUBLIC_ROOT}${path.sep}`)).toBe(true);
  expect(fs.existsSync(resolved), `${src} is missing`).toBe(true);
  return resolved;
}

// Return every unique static source promised by either public registry.
function registrySources(): string[] {
  return [
    ...new Set(
      [...Object.values(ART_SPRITES), ...Object.values(ART_MASCOTS)].map(
        (asset) => asset.src,
      ),
    ),
  ].sort();
}

// Hash one reviewed source for sequence and category uniqueness checks.
function assetSignature(asset: ArtAsset): string {
  return createHash("sha256").update(fs.readFileSync(publicFile(asset.src))).digest("hex");
}

describe("BibleQuest 2.5D art system", () => {
  it("ships exactly the registered static 2.5D catalogue", () => {
    const registered = registrySources();
    const onDisk = fs
      .readdirSync(ART_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".webp"))
      .map((entry) => `/art/2.5d/${entry.name}`)
      .sort();

    expect(registered).toHaveLength(EXPECTED_STATIC_ASSETS);
    expect(onDisk).toHaveLength(EXPECTED_STATIC_ASSETS);
    expect(onDisk).toEqual(registered);
  });

  it("keeps every static illustration smooth, transparent, and high resolution", async () => {
    for (const [name, asset] of Object.entries({
      ...ART_SPRITES,
      ...Object.fromEntries(
        Object.entries(ART_MASCOTS).map(([key, value]) => [`mascot-${key}`, value]),
      ),
    })) {
      expect(asset.kind, name).toBe("webp");
      expect(asset.nativeWidth, name).toBe(NATIVE_CANVAS);
      expect(asset.nativeHeight, name).toBe(NATIVE_CANVAS);
      const metadata = await sharp(publicFile(asset.src)).metadata();
      expect(metadata.format, name).toBe("webp");
      expect(metadata.width, name).toBe(NATIVE_CANVAS);
      expect(metadata.height, name).toBe(NATIVE_CANVAS);
      expect(metadata.hasAlpha, name).toBe(true);
    }
  }, 30_000);

  it("ships only the six approved sixteen-frame candle animations", async () => {
    const gifFiles = fs
      .readdirSync(path.join(ART_ROOT, "candles"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".gif"))
      .map((entry) => entry.name)
      .sort();

    expect(gifFiles).toHaveLength(EXPECTED_CANDLE_LOOPS);
    expect(gifFiles).toEqual([
      "candle-halo.gif",
      "candle-small.gif",
      "candle-sparks.gif",
      "candle-steady.gif",
      "candle-unlit.gif",
      "candle.gif",
    ]);

    for (const file of gifFiles) {
      const metadata = await sharp(path.join(ART_ROOT, "candles", file), {
        animated: true,
      }).metadata();
      expect(metadata.width, file).toBe(NATIVE_CANVAS);
      expect(metadata.pageHeight, file).toBe(NATIVE_CANVAS);
      expect(metadata.pages, file).toBe(16);
      expect(metadata.delay, file).toEqual(Array.from({ length: 16 }, () => 100));
      expect(metadata.loop, file).toBe(0);
    }
  });

  it("never registers animation for a character or non-candle object", () => {
    const animated = Object.entries(ART_SPRITES)
      .filter(([, asset]) => asset.animatedSrc)
      .map(([name]) => name)
      .sort();

    expect(animated).toEqual([
      "candle",
      "candle-halo",
      "candle-small",
      "candle-sparks",
      "candle-steady",
      "candle-unlit",
    ]);
    for (const asset of Object.values(ART_MASCOTS)) {
      expect(asset.animatedSrc).toBeUndefined();
    }
  });

  it("keeps all twenty growth stages visually distinct", () => {
    const signatures = Array.from({ length: 20 }, (_, stage) =>
      assetSignature(ART_SPRITES[`tree-stage-${stage}` as keyof typeof ART_SPRITES]),
    );
    expect(new Set(signatures).size).toBe(20);
  });

  it("maps every quest category to a distinct registered illustration", () => {
    const names = Object.values(CATEGORY_ART);
    for (const name of names) expect(ART_SPRITES[name]).toBeDefined();
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(names.map((name) => assetSignature(ART_SPRITES[name]))).size).toBe(
      names.length,
    );
  });

  it("normalizes isolated object scale without flattening progressions", () => {
    for (const [name, weight] of Object.entries(ART_VISUAL_WEIGHT)) {
      expect(weight, `${name} is too small`).toBeGreaterThanOrEqual(0.85);
      expect(weight, `${name} is too large`).toBeLessThanOrEqual(1.3);
      expect(name.startsWith("tree-stage-")).toBe(false);
      expect(name.startsWith("candle")).toBe(false);
    }
  });
});
