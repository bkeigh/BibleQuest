import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");
const bootstrap = readFileSync("src/lib/appearance/bootstrap.ts", "utf8");
const backdrop = readFileSync(
  "src/components/app-shell/WallpaperBackdrop.tsx",
  "utf8",
);

/** Every blur radius the stylesheet asks a compositor for. */
function blurRadii(): number[] {
  return [...css.matchAll(/backdrop-filter:\s*blur\((\d+)px\)/g)].map((m) =>
    Number(m[1]),
  );
}

describe("glass scroll cost", () => {
  it("blurs card surfaces only when a wallpaper is behind them", () => {
    // A blur only reads against detail. Over the flat parchment it is
    // pixel-identical to the fill alone, but the compositor still rasterises
    // the backdrop and runs a Gaussian for every surface, every frame — and
    // the home screen carries seventeen of them. That was the stutter.
    const cardBlur = css.indexOf(
      'html.glass-surfaces.has-wallpaper [data-app-shell] .app-glass-surface:not([data-paper-variant="outlined"])',
    );
    expect(cardBlur, "card blur is no longer gated on a wallpaper").toBeGreaterThan(-1);
  });

  it("keeps the glass looking like glass without a wallpaper", () => {
    // Only the blur is conditional. Gating the fill, border, and shadow too
    // would turn every card flat for readers with no wallpaper set.
    const ungated = css.indexOf(
      'html.glass-surfaces [data-app-shell] .app-glass-surface:not([data-paper-variant="outlined"]) {',
    );
    expect(ungated).toBeGreaterThan(-1);
    const rule = css.slice(ungated, css.indexOf("}", ungated));
    expect(rule).toContain("background-color");
    expect(rule).toContain("border-color");
    expect(rule).toContain("box-shadow");
    expect(rule).not.toContain("backdrop-filter");
  });

  it("keeps every blur radius within a range a phone can composite", () => {
    // Blur cost climbs steeply with radius. Nothing here needs 28px.
    const radii = blurRadii();
    expect(radii.length).toBeGreaterThan(0);
    for (const radius of radii) {
      expect(radius, `a ${radius}px backdrop blur is too expensive`).toBeLessThanOrEqual(20);
    }
  });

  it("agrees on the marker at first paint and after hydration", () => {
    // Two writers, one class. If they disagree the blur flickers on or off a
    // frame after load, which is worse than either answer alone.
    expect(bootstrap).toContain('"has-wallpaper"');
    expect(backdrop).toContain('"has-wallpaper"');
    // The backdrop is authoritative because it alone knows Plus entitlement.
    expect(backdrop).toContain("classList.toggle");
  });

  it("still blurs the one surface that floats over moving content", () => {
    // The tab bar sits above whatever is scrolling under it, wallpaper or not,
    // and it is a single element rather than seventeen.
    const nav = css.indexOf("html.glass-surfaces [data-app-shell] .app-glass-nav");
    expect(nav).toBeGreaterThan(-1);
    expect(css.slice(nav, css.indexOf("}", nav))).toContain("backdrop-filter");
  });
});
