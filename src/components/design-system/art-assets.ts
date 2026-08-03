/**
 * BibleQuest's production hand-painted 2.5D artwork registry.
 *
 * Static art ships as smooth 512px WebP with alpha. Only candle entries may
 * point at animation; all characters, objects, and growth stages stay still.
 */

export const ART_NATIVE_SIZE = 512;

export type ArtAsset = {
  kind: "webp";
  src: string;
  nativeWidth: number;
  nativeHeight: number;
  animatedSrc?: string;
};

// Preserve key inference while checking every registry value.
const defineAssets = <K extends string>(assets: Record<K, ArtAsset>) => assets;

// Build one square production entry from its stable filename stem.
const artWebp = (name: string, animated = false): ArtAsset => ({
  kind: "webp",
  src: `/art/2.5d/${name}.webp`,
  nativeWidth: ART_NATIVE_SIZE,
  nativeHeight: ART_NATIVE_SIZE,
  ...(animated
    ? { animatedSrc: `/art/2.5d/candles/${name}.gif` }
    : {}),
});

// Small illustrations, candle stages, and the twenty-stage journey tree.
export const ART_SPRITES = defineAssets({
  candle: artWebp("candle", true),
  leaf: artWebp("leaf"),
  star: artWebp("star"),
  bird: artWebp("bird"),
  flower: artWebp("flower"),
  chapel: artWebp("chapel"),
  book: artWebp("book"),
  "open-book": artWebp("book-open"),
  bookmark: artWebp("bookmark"),
  lantern: artWebp("lantern"),
  path: artWebp("map"),
  tree: artWebp("tree"),
  sun: artWebp("sun"),
  hands: artWebp("hands-praying"),
  wheat: artWebp("wheat"),
  dove: artWebp("dove"),
  cross: artWebp("cross"),
  door: artWebp("door"),
  key: artWebp("key"),
  scroll: artWebp("scroll"),
  compass: artWebp("compass"),
  crown: artWebp("crown"),
  mountain: artWebp("mountain"),
  moon: artWebp("moon"),
  "service-basket": artWebp("service-basket"),
  links: artWebp("links"),
  people: artWebp("people"),
  fountain: artWebp("fountain"),
  map: artWebp("map"),
  sprout: artWebp("sprout"),
  stone: artWebp("stone"),
  myshepherd: artWebp("myshepherd"),

  "candle-unlit": artWebp("candle-unlit", true),
  "candle-small": artWebp("candle-small", true),
  "candle-steady": artWebp("candle-steady", true),
  "candle-sparks": artWebp("candle-sparks", true),
  "candle-halo": artWebp("candle-halo", true),

  "tree-stage-0": artWebp("tree-stage-0"),
  "tree-stage-1": artWebp("tree-stage-1"),
  "tree-stage-2": artWebp("tree-stage-2"),
  "tree-stage-3": artWebp("tree-stage-3"),
  "tree-stage-4": artWebp("tree-stage-4"),
  "tree-stage-5": artWebp("tree-stage-5"),
  "tree-stage-6": artWebp("tree-stage-6"),
  "tree-stage-7": artWebp("tree-stage-7"),
  "tree-stage-8": artWebp("tree-stage-8"),
  "tree-stage-9": artWebp("tree-stage-9"),
  "tree-stage-10": artWebp("tree-stage-10"),
  "tree-stage-11": artWebp("tree-stage-11"),
  "tree-stage-12": artWebp("tree-stage-12"),
  "tree-stage-13": artWebp("tree-stage-13"),
  "tree-stage-14": artWebp("tree-stage-14"),
  "tree-stage-15": artWebp("tree-stage-15"),
  "tree-stage-16": artWebp("tree-stage-16"),
  "tree-stage-17": artWebp("tree-stage-17"),
  "tree-stage-18": artWebp("tree-stage-18"),
  "tree-stage-19": artWebp("tree-stage-19"),
});

export type ArtSpriteName = keyof typeof ART_SPRITES;
export const ART_SPRITE_NAMES = Object.keys(ART_SPRITES) as ArtSpriteName[];

/**
 * Optical-size correction measured from each approved alpha silhouette.
 * Progression families are omitted so their changing size remains meaningful.
 */
export const ART_VISUAL_WEIGHT: Partial<Record<ArtSpriteName, number>> = {
  bird: 1.25,
  "open-book": 0.88,
  book: 1,
  bookmark: 0.9,
  chapel: 0.88,
  compass: 1.06,
  cross: 0.89,
  crown: 0.98,
  door: 1,
  dove: 1.2,
  flower: 1.12,
  fountain: 1.03,
  hands: 0.92,
  key: 1.06,
  lantern: 1.01,
  leaf: 1.03,
  links: 1.25,
  map: 1.25,
  moon: 1.1,
  mountain: 0.94,
  myshepherd: 0.88,
  people: 0.88,
  scroll: 1.07,
  "service-basket": 0.96,
  sprout: 1.25,
  star: 1.07,
  stone: 1.22,
  sun: 1.25,
  tree: 0.94,
  wheat: 0.97,
};

// Larger still-life and character art used for onboarding and empty states.
export const ART_MASCOTS = defineAssets({
  lamb: artWebp("mascot-lamb"),
  lantern: ART_SPRITES.lantern,
  scroll: ART_SPRITES.scroll,
  dove: ART_SPRITES.dove,
  sprout: ART_SPRITES.sprout,
  key: ART_SPRITES.key,
  map: ART_SPRITES.map,
  campfire: artWebp("mascot-campfire"),
});

export type ArtMascotName = keyof typeof ART_MASCOTS;
export const ART_MASCOT_NAMES = Object.keys(ART_MASCOTS) as ArtMascotName[];
