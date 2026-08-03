import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLOATING_LAUNCHER_PLACEMENT,
  clampFloatingLauncherPoint,
  dockFloatingLauncher,
  floatingLauncherPoint,
  parseFloatingLauncherPlacement,
  type FloatingLauncherBounds,
} from "@/lib/platform/floating-launcher";

/** Phone-like limits make each placement assertion easy to reason about. */
const bounds: FloatingLauncherBounds = {
  viewportWidth: 390,
  minY: 12,
  maxY: 690,
  size: 85,
  gutter: 12,
  peek: 24,
};

describe("floating MyShepherd launcher placement", () => {
  it("starts fully visible above the lower-right app chrome", () => {
    expect(
      floatingLauncherPoint(DEFAULT_FLOATING_LAUNCHER_PLACEMENT, bounds),
    ).toEqual({ x: 293, y: 690 });
  });

  it("leaves an exactly recoverable peek on either hidden edge", () => {
    expect(
      floatingLauncherPoint(
        { side: "left", yRatio: 0.5, hidden: true },
        bounds,
      ),
    ).toEqual({ x: -61, y: 351 });
    expect(
      floatingLauncherPoint(
        { side: "right", yRatio: 0.5, hidden: true },
        bounds,
      ),
    ).toEqual({ x: 366, y: 351 });
  });

  it("clamps wild pointer movement without losing the control", () => {
    expect(clampFloatingLauncherPoint({ x: -900, y: -20 }, bounds)).toEqual({
      x: -61,
      y: 12,
    });
    expect(clampFloatingLauncherPoint({ x: 900, y: 900 }, bounds)).toEqual({
      x: 366,
      y: 690,
    });
  });

  it("snaps to the nearest side while preserving proportional height", () => {
    expect(dockFloatingLauncher({ x: 38, y: 351 }, bounds, false)).toEqual({
      side: "left",
      yRatio: 0.5,
      hidden: false,
    });
    expect(dockFloatingLauncher({ x: 280, y: 351 }, bounds, true)).toEqual({
      side: "right",
      yRatio: 0.5,
      hidden: true,
    });
  });

  it("accepts only bounded, typed persisted placements", () => {
    expect(
      parseFloatingLauncherPlacement(
        JSON.stringify({ side: "left", yRatio: 2, hidden: true }),
      ),
    ).toEqual({ side: "left", yRatio: 1, hidden: true });
    expect(parseFloatingLauncherPlacement("not-json")).toBeNull();
    expect(
      parseFloatingLauncherPlacement(
        JSON.stringify({ side: "middle", yRatio: 0.5, hidden: false }),
      ),
    ).toBeNull();
  });
});
