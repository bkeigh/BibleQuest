import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ART_ICON, ArtIcon } from "@/components/design-system/ArtIcon";
import { ART_VISUAL_WEIGHT } from "@/components/design-system/art-assets";

const SOURCES = globSync("src/**/*.tsx");

// Collect literal sizes from every illustrated icon or mascot call site.
function artSizes(): { file: string; size: number }[] {
  const found: { file: string; size: number }[] = [];
  const element = /<(ArtIcon|ArtMascot)([^<>]*?)(?=\/?>)/g;
  for (const file of SOURCES) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(element)) {
      const size = /size=\{([0-9.]+)\}/.exec(match[2]);
      if (size) found.push({ file, size: Number(size[1]) });
    }
  }
  return found;
}

describe("2.5D art scale", () => {
  it("guards the full illustration footprint", () => {
    expect(artSizes().length).toBeGreaterThan(50);
  });

  it("uses practical CSS-pixel sizes", () => {
    for (const { file, size } of artSizes()) {
      expect(size, `${file} is too small to read`).toBeGreaterThanOrEqual(16);
      expect(size, `${file} is too large for a phone`).toBeLessThanOrEqual(320);
    }
  });

  it("passes the complete tree box rather than a layout unit", () => {
    const tree = readFileSync("src/components/journey/GrowthTree.tsx", "utf8");
    expect(tree).toContain("size={box}");
    expect(tree).not.toMatch(/<ArtIcon[^>]*size=\{unit\}/);
  });

  it("measures optical size in both directions", () => {
    expect(ART_VISUAL_WEIGHT.links).toBeGreaterThan(1.2);
    expect(ART_VISUAL_WEIGHT["open-book"]).toBeLessThan(1);
  });

  it("keeps optical weighting inside one stable layout box", () => {
    const links = renderToStaticMarkup(
      createElement(ArtIcon, { name: "links", size: 40 }),
    );
    const book = renderToStaticMarkup(
      createElement(ArtIcon, { name: "open-book", size: 40 }),
    );

    // Both components reserve 40px even though their visible artwork differs.
    expect(links).toContain('style="width:40px;height:40px"');
    expect(book).toContain('style="width:40px;height:40px"');
    expect(links).toContain('style="width:50px;height:50px"');
    expect(book).toContain('style="width:35px;height:35px"');
  });

  it("offers a monotonic role-based size ladder", () => {
    const steps = Object.values(ART_ICON);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(new Set(steps).size).toBe(steps.length);
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(16);
  });

  it("uses smooth rendering rather than pixel resampling", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const start = css.indexOf("@utility artwork-2-5d");
    const rule = css.slice(start, css.indexOf("}", start));
    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain("image-rendering: auto");
    expect(rule).not.toContain("pixelated");
  });
});
