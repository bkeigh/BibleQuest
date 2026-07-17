import { describe, expect, it } from "vitest";
import {
  PIXEL_MASCOTS,
  PIXEL_SPRITES,
  type PixelAsset,
} from "@/components/design-system/pixel-assets";
import { CATEGORY_SPRITE } from "@/components/design-system/PixelIcon";

function expectValidGrid(name: string, asset: PixelAsset) {
  expect(asset.kind, `${name} must remain deterministic grid art`).toBe("grid");
  if (asset.kind !== "grid") return;
  expect(asset.rows.length, `${name} has no rows`).toBeGreaterThan(0);
  const width = asset.rows[0]?.length ?? 0;
  expect(width, `${name} has no width`).toBeGreaterThan(0);
  expect(asset.rows.every((row) => row.length === width), `${name} rows differ`).toBe(true);

  const used = new Set(asset.rows.join(""));
  for (const color of used) {
    expect(asset.palette[color], `${name} uses undefined color '${color}'`).toBeDefined();
  }
  expect(asset.palette["."], `${name} needs a transparent color`).toBe("transparent");
  expect(used.has("."), `${name} must preserve transparent canvas space`).toBe(true);
}

describe("BibleQuest pixel art system", () => {
  it("keeps every sprite and mascot artifact-free and palette-complete", () => {
    for (const [name, asset] of Object.entries(PIXEL_SPRITES)) {
      expectValidGrid(name, asset);
    }
    for (const [name, asset] of Object.entries(PIXEL_MASCOTS)) {
      expectValidGrid(`mascot-${name}`, asset);
    }
  });

  it("keeps the six journey trees on one true 32x32 canvas", () => {
    const footprints: number[] = [];
    for (let stage = 0; stage <= 5; stage += 1) {
      const asset = PIXEL_SPRITES[`tree-stage-${stage}` as keyof typeof PIXEL_SPRITES];
      expect(asset.kind).toBe("grid");
      if (asset.kind !== "grid") continue;
      expect(asset.rows).toHaveLength(32);
      expect(asset.rows.every((row) => row.length === 32)).toBe(true);
      expect(asset.rows[0]).toBe(".".repeat(32));
      expect(asset.rows[31]).toBe(".".repeat(32));
      expect(asset.rows.every((row) => row[0] === "." && row[31] === ".")).toBe(true);
      footprints.push(asset.rows.join("").replaceAll(".", "").length);
    }
    expect(new Set(footprints).size).toBe(6);
    expect(footprints[0]).toBeLessThan(footprints[1]);
    expect(footprints[1]).toBeLessThan(footprints[2]);
  });

  it("authors every small interface sprite on the shared 32x32 grid", () => {
    for (const [name, asset] of Object.entries(PIXEL_SPRITES)) {
      if (name.startsWith("tree-stage-") || name.startsWith("candle-")) continue;
      expect(asset.kind).toBe("grid");
      if (asset.kind !== "grid") continue;
      expect(asset.rows, name).toHaveLength(32);
      expect(asset.rows.every((row) => row.length === 32), name).toBe(true);
    }
  });

  it("maps every quest category to an existing, distinct visual", () => {
    const names = Object.values(CATEGORY_SPRITE);
    for (const name of names) expect(PIXEL_SPRITES[name]).toBeDefined();
    expect(new Set(names).size).toBe(names.length);
    const silhouettes = names.map((name) => {
      const asset = PIXEL_SPRITES[name];
      return asset.kind === "grid" ? asset.rows.join("") : asset.src;
    });
    expect(new Set(silhouettes).size).toBe(names.length);
  });
});
