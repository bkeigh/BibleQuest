/**
 * BibleQuest production pixel-art registry.
 *
 * Every registered asset is a reviewed 128x128 PNG. Logical grid dimensions
 * preserve each component's layout size without changing the source artwork.
 */

export const PRODUCTION_PIXEL_NATIVE_SIZE = 128;

export type PixelAsset = {
  kind: "png";
  src: string;
  /** Divisor-compatible logical layout grid, independent of source pixels. */
  cols: number;
  rows: number;
  /** Native authored pixel grid used by visual QA. */
  artCols: number;
  artRows: number;
  /** Intrinsic file dimensions used before CSS layout. */
  nativeWidth: number;
  nativeHeight: number;
  /** Preserves the established component footprint at existing call sites. */
  cellScale?: number;
  ambientClassName?: string;
};

const defineAssets = <K extends string>(assets: Record<K, PixelAsset>) => assets;

/** Creates one registry entry on the shared production canvas. */
const pixelPng = (
  src: string,
  cols: number,
  rows: number,
  cellScale?: number,
  ambientClassName?: string,
  artCols = PRODUCTION_PIXEL_NATIVE_SIZE,
  artRows = PRODUCTION_PIXEL_NATIVE_SIZE
): PixelAsset => ({
  kind: "png",
  src,
  cols,
  rows,
  artCols,
  artRows,
  nativeWidth: PRODUCTION_PIXEL_NATIVE_SIZE,
  nativeHeight: PRODUCTION_PIXEL_NATIVE_SIZE,
  ...(cellScale == null ? {} : { cellScale }),
  ...(ambientClassName ? { ambientClassName } : {}),
});

/** Small sprites, streak candles, and journey trees used throughout the app. */
export const PIXEL_SPRITES = defineAssets({
  candle: pixelPng("/pixel/candle.png", 32, 32, 0.2, "[animation:var(--animate-flicker)]"),
  leaf: pixelPng("/pixel/leaf.png", 32, 32, 0.2),
  star: pixelPng("/pixel/star.png", 32, 32, 0.2, "[animation:var(--animate-twinkle)]"),
  bird: pixelPng("/pixel/bird.png", 32, 32, 0.2),
  flower: pixelPng("/pixel/flower.png", 32, 32, 0.2),
  chapel: pixelPng("/pixel/chapel.png", 32, 32, 0.2),
  book: pixelPng("/pixel/book.png", 32, 32, 0.2),
  "open-book": pixelPng("/pixel/open-book.png", 32, 32, 0.2),
  bookmark: pixelPng("/pixel/bookmark.png", 32, 32, 0.2),
  lantern: pixelPng("/pixel/lantern.png", 32, 32, 0.2, "[animation:var(--animate-flicker)]"),
  path: pixelPng("/pixel/path.png", 32, 32, 0.2),
  tree: pixelPng("/pixel/tree.png", 32, 32, 0.2),
  sun: pixelPng("/pixel/sun.png", 32, 32, 0.2, "[animation:var(--animate-twinkle)]"),
  heart: pixelPng("/pixel/heart.png", 32, 32, 0.2),
  hands: pixelPng("/pixel/hands.png", 32, 32, 0.2),
  "praying-hands": pixelPng("/pixel/praying-hands.png", 32, 32, 0.2),
  wheat: pixelPng("/pixel/wheat.png", 32, 32, 0.2),
  dove: pixelPng("/pixel/dove.png", 32, 32, 0.2),
  cross: pixelPng("/pixel/cross.png", 32, 32, 0.2),
  door: pixelPng("/pixel/door.png", 32, 32, 0.2),
  key: pixelPng("/pixel/key.png", 32, 32, 0.2),
  scroll: pixelPng("/pixel/scroll.png", 32, 32, 0.2),
  compass: pixelPng("/pixel/compass.png", 32, 32, 0.2),
  crown: pixelPng("/pixel/crown.png", 32, 32, 0.2),
  mountain: pixelPng("/pixel/mountain.png", 32, 32, 0.2),
  moon: pixelPng("/pixel/moon.png", 32, 32, 0.2),
  "service-basket": pixelPng("/pixel/service-basket.png", 32, 32, 0.2),
  links: pixelPng("/pixel/links.png", 32, 32, 0.2),
  people: pixelPng("/pixel/people.png", 32, 32, 0.2),
  fountain: pixelPng("/pixel/fountain.png", 32, 32, 0.2),

  "candle-unlit": pixelPng("/pixel/candle-unlit.png", 16, 16, 0.75),
  "candle-small": pixelPng("/pixel/candle-small.png", 16, 16, 0.75, "[animation:var(--animate-flicker)]"),
  "candle-steady": pixelPng("/pixel/candle-steady.png", 16, 16, 0.75, "[animation:var(--animate-flicker)]"),
  "candle-sparks": pixelPng("/pixel/candle-sparks.png", 16, 16, 0.75, "[animation:var(--animate-flicker)]"),
  "candle-halo": pixelPng("/pixel/candle-halo.png", 16, 16, 0.75, "[animation:var(--animate-flicker)]"),

  "tree-stage-0": pixelPng("/pixel/tree-stage-0.png", 32, 32),
  "tree-stage-1": pixelPng("/pixel/tree-stage-1.png", 32, 32),
  "tree-stage-2": pixelPng("/pixel/tree-stage-2.png", 32, 32),
  "tree-stage-3": pixelPng("/pixel/tree-stage-3.png", 32, 32),
  "tree-stage-4": pixelPng("/pixel/tree-stage-4.png", 32, 32),
  "tree-stage-5": pixelPng("/pixel/tree-stage-5.png", 32, 32),
  "tree-stage-6": pixelPng("/pixel/tree-stage-6.png", 32, 32),
  "tree-stage-7": pixelPng("/pixel/tree-stage-7.png", 32, 32),
  "tree-stage-8": pixelPng("/pixel/tree-stage-8.png", 32, 32),
  "tree-stage-9": pixelPng("/pixel/tree-stage-9.png", 32, 32),
  "tree-stage-10": pixelPng("/pixel/tree-stage-10.png", 32, 32),
  "tree-stage-11": pixelPng("/pixel/tree-stage-11.png", 32, 32),
  "tree-stage-12": pixelPng("/pixel/tree-stage-12.png", 32, 32),
  "tree-stage-13": pixelPng("/pixel/tree-stage-13.png", 32, 32),
  "tree-stage-14": pixelPng("/pixel/tree-stage-14.png", 32, 32),
  "tree-stage-15": pixelPng("/pixel/tree-stage-15.png", 32, 32),
  "tree-stage-16": pixelPng("/pixel/tree-stage-16.png", 32, 32),
  "tree-stage-17": pixelPng("/pixel/tree-stage-17.png", 32, 32),
  "tree-stage-18": pixelPng("/pixel/tree-stage-18.png", 32, 32),
  "tree-stage-19": pixelPng("/pixel/tree-stage-19.png", 32, 32),
});

export type PixelSpriteName = keyof typeof PIXEL_SPRITES;
export const PIXEL_SPRITE_NAMES = Object.keys(PIXEL_SPRITES) as PixelSpriteName[];

/** Larger character and object art for onboarding and empty states. */
export const PIXEL_MASCOTS = defineAssets({
  lamb: pixelPng("/pixel/mascot-lamb.png", 32, 32, 0.625),
  lantern: pixelPng("/pixel/mascot-lantern.png", 32, 32, 0.625, "[animation:var(--animate-flicker)]"),
  scroll: pixelPng("/pixel/mascot-scroll.png", 32, 32, 0.625),
  dove: pixelPng("/pixel/mascot-dove.png", 32, 32, 0.625),
  sprout: pixelPng("/pixel/mascot-sprout.png", 32, 32, 0.625),
  key: pixelPng("/pixel/mascot-key.png", 32, 32, 0.625),
  map: pixelPng("/pixel/mascot-map.png", 32, 32, 0.625),
  campfire: pixelPng("/pixel/mascot-campfire.png", 32, 32, 0.625, "[animation:var(--animate-flicker)]"),
});

export type PixelMascotName = keyof typeof PIXEL_MASCOTS;
export const PIXEL_MASCOT_NAMES = Object.keys(PIXEL_MASCOTS) as PixelMascotName[];
