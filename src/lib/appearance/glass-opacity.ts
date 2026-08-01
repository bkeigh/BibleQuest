/** The clearest allowed material keeps content readable over detailed art. */
export const MIN_GLASS_OPACITY = 15;

/** Fully solid is useful when a wallpaper is visually busy. */
export const MAX_GLASS_OPACITY = 100;

/** This matches the primary glass surface that shipped before the slider. */
export const DEFAULT_GLASS_OPACITY = 54;

/**
 * Each material keeps its existing visual hierarchy as the shared opacity
 * moves. Every derived layer is clamped, so quiet and nested panes never fall
 * below the product's readability floor.
 */
export const GLASS_OPACITY_LAYER_OFFSETS = {
  "--glass-surface-opacity": 0,
  "--glass-linen-opacity": -4,
  "--glass-quiet-opacity": -14,
  "--glass-nested-opacity": -20,
  "--glass-nav-opacity": 4,
  "--glass-dark-surface-opacity": 6,
  "--glass-dark-linen-opacity": 2,
  "--glass-dark-nav-opacity": 12,
  "--glass-milestone-opacity": 24,
  "--glass-milestone-reached-opacity": 38,
  "--glass-dark-milestone-opacity": 30,
  "--glass-dark-milestone-reached-opacity": 40,
} as const;

/** Normalizes stored, imported, and UI values to an integer percentage. */
export function normalizeGlassOpacity(value: unknown): number {
  const candidate =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : DEFAULT_GLASS_OPACITY;

  return Math.min(
    MAX_GLASS_OPACITY,
    Math.max(MIN_GLASS_OPACITY, Math.round(candidate)),
  );
}

/** Builds the CSS custom properties used by every glass material layer. */
export function glassOpacityVariables(
  value: unknown,
): Record<keyof typeof GLASS_OPACITY_LAYER_OFFSETS, string> {
  const base = normalizeGlassOpacity(value);
  // Preserve denser navigation and milestone panes below the default while
  // clamping quieter layers. Above it, taper every offset to fully solid.
  const offsetScale =
    base >= DEFAULT_GLASS_OPACITY
      ? (MAX_GLASS_OPACITY - base) /
        (MAX_GLASS_OPACITY - DEFAULT_GLASS_OPACITY)
      : 1;

  return Object.fromEntries(
    Object.entries(GLASS_OPACITY_LAYER_OFFSETS).map(([property, offset]) => [
      property,
      `${normalizeGlassOpacity(base + offset * offsetScale)}%`,
    ]),
  ) as Record<keyof typeof GLASS_OPACITY_LAYER_OFFSETS, string>;
}
