import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GrowthTree } from "@/components/journey/GrowthTree";
import type { GrowthTreeState } from "@/lib/questos/types";

const decoratedState: GrowthTreeState = {
  stage: "flowering",
  stageLabel: "Flowering tree",
  totalActions: 90,
  toNextStage: 10,
  byType: {
    roots: 10,
    branches: 10,
    leaves: 10,
    fruit: 2,
    sunlight: 2,
    flowers: 2,
  },
};

describe("GrowthTree rendering", () => {
  it("keeps restrained Journey accents around the painted tree", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthTree, { state: decoratedState, size: 96 }),
    );

    expect(html).toContain('data-growth-accent="sunlight"');
    expect(html).toContain('data-growth-accent="ground"');
    expect(html).toContain('data-growth-accent="flower"');
    // Fruit is already painted into the later tree stages; separate block
    // decorations would reintroduce the retired pixel-art treatment.
    expect(html).not.toContain('data-growth-accent="fruit"');
    expect(html).toContain("/art/2.5d/tree-stage-13.webp");
  });

  it("renders only the stage sprite in Home tree-only mode", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthTree, {
        state: decoratedState,
        size: 96,
        treeOnly: true,
      }),
    );

    expect(html).toContain('role="img"');
    expect(html).toContain("Flowering tree");
    expect(html).not.toContain("data-growth-accent");
  });
});
