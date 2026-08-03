/** The side a floating launcher settles against after a drag. */
export type FloatingLauncherSide = "left" | "right";

/** The durable part of the launcher position, independent of screen size. */
export interface FloatingLauncherPlacement {
  side: FloatingLauncherSide;
  yRatio: number;
  hidden: boolean;
}

/** Pixel limits for the launcher inside the currently visible app viewport. */
export interface FloatingLauncherBounds {
  viewportWidth: number;
  minY: number;
  maxY: number;
  size: number;
  gutter: number;
  peek: number;
}

/** A concrete top-left point used while the launcher follows a pointer. */
export interface FloatingLauncherPoint {
  x: number;
  y: number;
}

/** The first visit keeps the launcher in its familiar lower-right home. */
export const DEFAULT_FLOATING_LAUNCHER_PLACEMENT: FloatingLauncherPlacement = {
  side: "right",
  yRatio: 1,
  hidden: false,
};

/** Versioned storage keeps future placement changes backward-compatible. */
export const FLOATING_LAUNCHER_STORAGE_KEY =
  "biblequest:my-shepherd-launcher:v1";

/** Keeps a number inside an inclusive range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Resolves a side, height, and peek state into viewport coordinates. */
export function floatingLauncherPoint(
  placement: FloatingLauncherPlacement,
  bounds: FloatingLauncherBounds,
): FloatingLauncherPoint {
  const verticalRange = Math.max(0, bounds.maxY - bounds.minY);
  const yRatio = clamp(placement.yRatio, 0, 1);
  const x =
    placement.side === "left"
      ? placement.hidden
        ? -bounds.size + bounds.peek
        : bounds.gutter
      : placement.hidden
        ? bounds.viewportWidth - bounds.peek
        : bounds.viewportWidth - bounds.size - bounds.gutter;

  return {
    x,
    y: bounds.minY + verticalRange * yRatio,
  };
}

/** Allows a drag to reach a side peek without losing the launcher entirely. */
export function clampFloatingLauncherPoint(
  point: FloatingLauncherPoint,
  bounds: FloatingLauncherBounds,
): FloatingLauncherPoint {
  return {
    x: clamp(
      point.x,
      -bounds.size + bounds.peek,
      bounds.viewportWidth - bounds.peek,
    ),
    y: clamp(point.y, bounds.minY, bounds.maxY),
  };
}

/** Converts a released point into the nearest edge-relative placement. */
export function dockFloatingLauncher(
  point: FloatingLauncherPoint,
  bounds: FloatingLauncherBounds,
  hidden: boolean,
): FloatingLauncherPlacement {
  const clamped = clampFloatingLauncherPoint(point, bounds);
  const verticalRange = Math.max(0, bounds.maxY - bounds.minY);

  return {
    side:
      clamped.x + bounds.size / 2 < bounds.viewportWidth / 2
        ? "left"
        : "right",
    yRatio:
      verticalRange === 0 ? 0 : (clamped.y - bounds.minY) / verticalRange,
    hidden,
  };
}

/** Rejects stale or malformed storage rather than trusting persisted JSON. */
export function parseFloatingLauncherPlacement(
  stored: string | null,
): FloatingLauncherPlacement | null {
  if (!stored) return null;

  try {
    const value = JSON.parse(stored) as Partial<FloatingLauncherPlacement>;
    if (
      (value.side !== "left" && value.side !== "right") ||
      typeof value.yRatio !== "number" ||
      !Number.isFinite(value.yRatio) ||
      typeof value.hidden !== "boolean"
    ) {
      return null;
    }

    return {
      side: value.side,
      yRatio: clamp(value.yRatio, 0, 1),
      hidden: value.hidden,
    };
  } catch {
    return null;
  }
}
