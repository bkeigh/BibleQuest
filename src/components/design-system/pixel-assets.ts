/**
 * pixel-assets — the single registry for every pixel sprite and mascot.
 *
 * Each asset is either a hand-placed character grid (rendered as crisp
 * SVG <rect>s by PixelIcon / PixelMascot) or a pre-drawn PNG dropped
 * into public/pixel/. Consumers only ever reference assets by name, so
 * swapping art means flipping one entry here — never a call site:
 *
 *   "candle-halo": { kind: "png", src: "/pixel/candle-halo.png", cols: 10, rows: 14 }
 *
 * `cols`/`rows` keep the logical grid, so `size` still means px per
 * cell and rendered dimensions never change. Rules and the PNG
 * replacement workflow live in docs/PIXEL_SYSTEM.md.
 */

export type PixelAsset =
  | {
      kind: "grid";
      rows: string[];
      palette: Record<string, string>;
      /** Optional per-cell animation class for living details. */
      ambient?: { chars: string; className: string };
    }
  | {
      kind: "png";
      /** Path under public/, e.g. "/pixel/candle-halo.png". */
      src: string;
      /** Logical grid width/height in cells — keeps `size` = px per cell. */
      cols: number;
      rows: number;
      /** Whole-image animation fallback (PNGs can't animate per cell). */
      ambientClassName?: string;
    };

/** Keeps literal keys for the name unions while typing values as PixelAsset. */
const defineAssets = <K extends string>(assets: Record<K, PixelAsset>) => assets;

const T = "transparent";

// Shared warm tones (tokens mirrored so sprites read against parchment).
const INK = "#3f4d31";
const OLIVE = "#6f8155";
const OLIVE_L = "#a8b98c";
const GOLD = "#e7c563";
const GOLD_B = "#d3a336"; // brand gold — solid sacred objects
const GOLD_D = "#b68b2f";
const EVERGREEN = "#0e533c"; // brand green — doors, banners, ink
const EVERGREEN_L = "#2f7c58";
const FLAME = "#f2b24a";
const FLAME_D = "#e8913f"; // deep flame orange — wick glow, flame roots
const WHITE = "#fffaf0";
const WARM_WHITE = "#fffdf7"; // mascot wool and pages
const PARCHMENT = "#efe4cf";
const ROSE = "#e5a8a1";
const ROSE_D = "#b9645d";
const BLUE = "#8fb9d4";
const BROWN = "#7a5a3a";
const BARK = "#6b4f34";
const STONE = "#c9c3b4";
const TWILIGHT = "#1e3329"; // deep-green outline for mascots + feature sprites
const FACE = "#8a6844"; // mascot face/limb brown
const TAN = "#cfa878"; // light tan (lamb muzzle)
const SKIN = "#e8cba8"; // warm skin tone (hands sprite)
const BIRD_EYE = "#2c2c2c";

/* ---- Feature-sprite palettes (candle streak set, journey tree set) ---- */

// The five streak candles share one body; only the flame grows.
const CANDLE_PALETTE = {
  k: TWILIGHT, // outline + wick
  c: WHITE, // wax
  s: PARCHMENT, // wax shade (lower right)
  h: GOLD, // wax highlight (upper left)
  b: GOLD_B, // holder
  d: GOLD_D, // holder shade
  f: FLAME, // flame
  y: GOLD, // flame core
  o: FLAME_D, // flame root
  g: GOLD, // floating sparks
  a: GOLD, // halo arc
  ".": T,
};
const CANDLE_FLICKER = {
  chars: "fyog",
  className: "origin-bottom [animation:var(--animate-flicker)]",
};
// Shared 10x14 candle body — wick/flame rows are prepended per state.
const CANDLE_BODY = [
  "..kkkkkk..",
  "..khhcsk..",
  "..khccsk..",
  "..kcccsk..",
  "..kccssk..",
  ".kbbbbbdk.",
  ".kddddddk.",
  ".kkkkkkkk.",
];

/* ============================================================
   Small sprites + feature sprites (PixelIcon)
   ============================================================ */

export const PIXEL_SPRITES = defineAssets({
  candle: {
    kind: "grid",
    palette: { f: FLAME, o: FLAME_D, c: WHITE, s: PARCHMENT, b: GOLD_D, ".": T },
    rows: [
      "..f..",
      ".fff.",
      "..o..",
      ".ccc.",
      ".ccs.",
      ".css.",
      ".bbb.",
    ],
    ambient: { chars: "fo", className: "origin-bottom [animation:var(--animate-flicker)]" },
  },
  leaf: {
    kind: "grid",
    palette: { g: OLIVE, l: OLIVE_L, v: INK, ".": T },
    rows: [
      "...ll",
      "..llg",
      ".llgg",
      "llggv",
      "lgggv",
      ".gggv",
      "...vv",
    ],
  },
  star: {
    kind: "grid",
    palette: { s: GOLD, w: WHITE, ".": T },
    rows: [
      "..w..",
      "..s..",
      "wsssw",
      "..s..",
      ".s.s.",
    ],
    ambient: { chars: "sw", className: "[animation:var(--animate-twinkle)]" },
  },
  bird: {
    kind: "grid",
    palette: { b: OLIVE, d: INK, e: BIRD_EYE, ".": T },
    rows: [
      "........",
      "..bbb...",
      ".bbbbbb.",
      "bbbbbbe.",
      ".dbbbb..",
      "...d.d..",
    ],
  },
  flower: {
    kind: "grid",
    palette: { p: ROSE, d: ROSE_D, c: GOLD, g: OLIVE, ".": T },
    rows: [
      ".p.p.",
      "pdpdp",
      ".pcp.",
      "..g..",
      ".gg..",
      "..g..",
    ],
  },
  chapel: {
    kind: "grid",
    palette: { r: ROSE_D, w: STONE, d: BARK, c: INK, y: GOLD, ".": T },
    rows: [
      "..c..",
      "..c..",
      ".rrr.",
      "rrrrr",
      "wwwww",
      "wwyww",
      "wwyww",
    ],
  },
  book: {
    kind: "grid",
    palette: { c: BARK, p: WHITE, l: OLIVE, b: GOLD, ".": T },
    rows: [
      "ccccc",
      "cpppc",
      "cplpb",
      "cpppc",
      "cplpc",
      "ccccc",
    ],
  },
  bookmark: {
    kind: "grid",
    palette: { r: ROSE_D, l: ROSE, ".": T },
    rows: [
      "rrr",
      "rlr",
      "rlr",
      "rlr",
      "r.r",
    ],
  },
  lantern: {
    kind: "grid",
    palette: { m: INK, g: GOLD, f: FLAME, ".": T },
    rows: [
      "..m..",
      ".mmm.",
      "mgfgm",
      "mgfgm",
      "mgggm",
      ".mmm.",
    ],
    ambient: { chars: "f", className: "[animation:var(--animate-flicker)]" },
  },
  path: {
    kind: "grid",
    palette: { s: STONE, d: OLIVE_L, ".": T },
    rows: [
      ".s.d.",
      "d.s.s",
      ".d.s.",
      "s.d.d",
      ".s.d.",
    ],
  },
  tree: {
    kind: "grid",
    palette: { g: OLIVE, l: OLIVE_L, b: BARK, ".": T },
    rows: [
      ".lgl.",
      "lgggl",
      "gglgg",
      "lgggl",
      "..b..",
      "..b..",
    ],
    ambient: { chars: "gl", className: "origin-bottom [animation:var(--animate-sway-slow)]" },
  },
  sun: {
    kind: "grid",
    palette: { y: GOLD, o: FLAME, ".": T },
    rows: [
      "y.y.y",
      ".ooo.",
      "yoooy",
      ".ooo.",
      "y.y.y",
    ],
  },
  heart: {
    kind: "grid",
    palette: { r: ROSE_D, l: ROSE, ".": T },
    rows: [
      ".r.r.",
      "rlrlr",
      "rlllr",
      ".rlr.",
      "..r..",
    ],
  },
  hands: {
    kind: "grid",
    palette: { s: SKIN, d: BROWN, ".": T },
    rows: [
      "s...s",
      "ss.ss",
      "sssss",
      "ddddd",
      ".ddd.",
    ],
  },
  wheat: {
    kind: "grid",
    palette: { g: GOLD, d: GOLD_D, s: OLIVE, ".": T },
    rows: [
      "g.g.g",
      "dgdgd",
      ".dsd.",
      "..s..",
      "..s..",
    ],
  },
  dove: {
    kind: "grid",
    palette: { w: WHITE, g: STONE, b: BLUE, ".": T },
    rows: [
      "..www..",
      ".wwwwg.",
      "wwwwwwb",
      ".gwww..",
      "...g.g.",
    ],
  },
  cross: {
    kind: "grid",
    palette: { g: GOLD_B, d: GOLD_D, ".": T },
    rows: [
      "..g..",
      "..g..",
      "ggggg",
      "..g..",
      "..g..",
      "..d..",
      "..d..",
    ],
  },
  door: {
    kind: "grid",
    palette: { s: STONE, e: EVERGREEN, l: EVERGREEN_L, g: GOLD_B, ".": T },
    rows: [
      ".sss.",
      "seles",
      "seees",
      "seege",
      "seees",
      "seees",
      "sssss",
    ],
  },
  key: {
    kind: "grid",
    palette: { g: GOLD_B, d: GOLD_D, ".": T },
    rows: [
      "ggg..",
      "g.g..",
      "ggg..",
      ".d...",
      ".d.d.",
      ".ddd.",
    ],
  },
  scroll: {
    kind: "grid",
    palette: { g: GOLD_B, w: WHITE, e: EVERGREEN, ".": T },
    rows: [
      "ggggg",
      "wwwww",
      "weeww",
      "wwwww",
      "weeew",
      "wwwww",
      "ggggg",
    ],
  },
  compass: {
    kind: "grid",
    palette: { s: STONE, w: WHITE, e: EVERGREEN_L, r: ROSE_D, ".": T },
    rows: [
      "..s..",
      ".sws.",
      "swrws",
      ".sws.",
      "..e..",
    ],
  },
  crown: {
    kind: "grid",
    palette: { g: GOLD_B, d: GOLD_D, e: EVERGREEN_L, ".": T },
    rows: [
      "g.g.g",
      "ggggg",
      "gegeg",
      "ddddd",
    ],
  },
  mountain: {
    kind: "grid",
    palette: { e: EVERGREEN, l: EVERGREEN_L, w: WHITE, ".": T },
    rows: [
      "...w...",
      "..wew..",
      ".eelee.",
      ".elele.",
      "eeleele",
      "leeeeel",
    ],
  },

  /* ---- Streak candles (10x14) — the flame grows with the rhythm ---- */
  "candle-unlit": {
    kind: "grid",
    palette: CANDLE_PALETTE,
    rows: [
      "..........",
      "..........",
      "..........",
      "..........",
      "....k.....",
      "....k.....",
      ...CANDLE_BODY,
    ],
  },
  "candle-small": {
    kind: "grid",
    palette: CANDLE_PALETTE,
    rows: [
      "..........",
      "..........",
      "..........",
      "....ff....",
      "...fyyf...",
      "....oo....",
      ...CANDLE_BODY,
    ],
    ambient: CANDLE_FLICKER,
  },
  "candle-steady": {
    kind: "grid",
    palette: CANDLE_PALETTE,
    rows: [
      "..........",
      "....ff....",
      "...ffff...",
      "...fyyf...",
      "...fyyf...",
      "....oo....",
      ...CANDLE_BODY,
    ],
    ambient: CANDLE_FLICKER,
  },
  "candle-sparks": {
    kind: "grid",
    palette: CANDLE_PALETTE,
    rows: [
      "..g.ff....",
      "...ffff...",
      "...fyyf.g.",
      "...fyyf...",
      ".g.ffff...",
      "....oo....",
      ...CANDLE_BODY,
    ],
    ambient: CANDLE_FLICKER,
  },
  "candle-halo": {
    kind: "grid",
    palette: CANDLE_PALETTE,
    rows: [
      "...a..a...",
      ".a..ff..a.",
      "...ffff...",
      "..gfyyf...",
      "...fyyf.g.",
      "....oo....",
      ...CANDLE_BODY,
    ],
    ambient: CANDLE_FLICKER,
  },

  /* ---- Journey tree stages (28x28) — the living tree, drawn in pixels.
     Lobed canopies lit from the upper left, curved two-tone trunks with
     root flare, gold fruit at the canopy's lower edge. ---- */
  // Journey tree stages — PixelLab-generated PNGs (48x48) in public/pixel/.
  // Regenerate or hand-replace by dropping a new 48x48 PNG at the same path.
  "tree-stage-0": {
    kind: "png",
    src: "/pixel/tree-stage-0.png",
    cols: 48,
    rows: 48,
  },
  "tree-stage-1": {
    kind: "png",
    src: "/pixel/tree-stage-1.png",
    cols: 48,
    rows: 48,
  },
  "tree-stage-2": {
    kind: "png",
    src: "/pixel/tree-stage-2.png",
    cols: 48,
    rows: 48,
  },
  "tree-stage-3": {
    kind: "png",
    src: "/pixel/tree-stage-3.png",
    cols: 48,
    rows: 48,
  },
  "tree-stage-4": {
    kind: "png",
    src: "/pixel/tree-stage-4.png",
    cols: 48,
    rows: 48,
  },
  "tree-stage-5": {
    kind: "png",
    src: "/pixel/tree-stage-5.png",
    cols: 48,
    rows: 48,
  },
});

export type PixelSpriteName = keyof typeof PIXEL_SPRITES;

export const PIXEL_SPRITE_NAMES = Object.keys(PIXEL_SPRITES) as PixelSpriteName[];

/* ============================================================
   Mascots (PixelMascot) — one shared palette, one twilight outline
   ============================================================ */

const MASCOT_PALETTE = {
  k: TWILIGHT, // outline — twilight deep green
  w: WARM_WHITE, // warm white (wool, pages)
  W: PARCHMENT, // parchment shade
  f: FACE, // face/limb brown
  F: BARK, // dark brown (soil, logs)
  g: GOLD_B, // brand gold
  G: GOLD_D, // gold shade
  y: GOLD, // light gold (glow, flame highlight)
  o: FLAME_D, // flame orange
  e: EVERGREEN, // brand evergreen
  E: EVERGREEN_L, // evergreen light
  l: OLIVE, // olive leaf
  L: OLIVE_L, // olive light
  b: BLUE, // marian blue accent
  p: ROSE, // rose (cheeks)
  t: TAN, // light tan (lamb muzzle)
  ".": T,
};

const mascot = (rows: string[]): PixelAsset => ({
  kind: "grid",
  rows,
  palette: MASCOT_PALETTE,
});

export const PIXEL_MASCOTS = defineAssets({
  /** Welcome — a small lamb, glad you're here. */
  lamb: mascot([
    "...kkkkkkkkk....",
    "..kwwwwwwwwwk...",
    ".kwwWwwwwwWwwk..",
    ".kwwwwwwwwwwwk..",
    ".kkwwwwwwwwwkk..",
    "kfkkffffffffkkfk",
    ".kkkffffffffkkk.",
    "...kfkffffkfk...",
    "...kfttttttfk...",
    "...kpttkkttpk...",
    "...kttttttttk...",
    "....kkkkkkkk....",
  ]),
  /** Daily rhythm — a lantern for the path. */
  lantern: mascot([
    "......kkkk......",
    "......k..k......",
    "....kkkkkkkk....",
    "...kggggggggk...",
    "...kg......gk...",
    "...kg..y...gk...",
    "...kg.yoy..gk...",
    "...kg.yoy..gk...",
    "...kg..o...gk...",
    "...kg......gk...",
    "...kggggggggk...",
    "....kkkkkkkk....",
    "......kGGk......",
    "......kkkk......",
  ]),
  /** Scripture — an open scroll. */
  scroll: mascot([
    ".kkkkkkkkkkkkkkkk.",
    "kgggggggggggggggGk",
    "kGgggggggggggggGGk",
    ".kkwwwwwwwwwwwwkk.",
    "..kwwwwwwwwwwwk...",
    "..kwweeeeewwwwk...",
    "..kwwwwwwwwwwwk...",
    "..kwweeeeeeewwk...",
    "..kwwwwwwwwwwwk...",
    "..kwweeeewwwwwk...",
    "..kwwwwwwwwwwwk...",
    ".kkwwwwwwwwwwwwkk.",
    "kgggggggggggggggGk",
    "kGgggggggggggggGGk",
    ".kkkkkkkkkkkkkkkk.",
  ]),
  /** Prayer — a dove in flight. */
  dove: mascot([
    ".........kk.......",
    "........kWWk......",
    ".......kWWWk......",
    "......kWWWWk......",
    "..kkk.kWWWWk......",
    ".kwkwkwWWWWwk.....",
    "kgkwwwwwwwwwwk....",
    ".kkwwwwwwwwwwkkk..",
    "...kwwwwwwwwwwwwk.",
    "...kwwwwwwwwkkk...",
    "....kwwwwwwk......",
    ".....kwwwk........",
    "......kkk.........",
  ]),
  /** Growth — a two-leaf seedling. */
  sprout: mascot([
    "...kk.....kk....",
    "..kLLk...kLLk...",
    ".kLlLLk.kLLlLk..",
    ".kLLLLklkLLLLk..",
    "..kLLk.l.kLLk...",
    "...kk.klk.kk....",
    "......klk.......",
    "......klk.......",
    "...kkkFlFkkk....",
    ".kkFFFFFFFFFkk..",
    ".kFFfFFFFfFFFk..",
    "..kkFFFFFFFkk...",
    "....kkkkkkk.....",
  ]),
  /** Sign-in — a key: your journey, kept. */
  key: mascot([
    "....kkkk........",
    "...kggggk.......",
    "..kg....gk......",
    "..kg.ee.gk......",
    "..kg.ee.gk......",
    "..kg....gk......",
    "...kggggk.......",
    "....kggk........",
    "....kggk........",
    "....kggk........",
    "....kggkgk......",
    "....kggkk.......",
    "....kggkgk......",
    ".....kkkk.......",
  ]),
  /** Quests — a map with a trail to follow. */
  map: mascot([
    ".kkkkkkkkkkkkkkkk.",
    "kwWwwwwwwwwwwwwWwk",
    "kwwwwwwwwwwwe.ewwk",
    "kwwwwwwwwwwwwewwwk",
    "kwwwwwwwwwgwe.ewwk",
    "kwwwwwwwwwwwwwwwwk",
    "kwwwwwwwgwwwwwwwwk",
    "kwwwwwgwwwwwwwwwwk",
    "kwwwgwwwwwwwwwwwwk",
    "kwegwwwwwwwwwwwwwk",
    "kwWwwwwwwwwwwwwWwk",
    ".kkkkkkkkkkkkkkkk.",
  ]),
  /** Reflection — a campfire to rest beside. */
  campfire: mascot([
    "................",
    ".......y........",
    "......yoy.......",
    ".....yooy.......",
    ".....yogoy......",
    "....yogggoy.....",
    "....yoggoy......",
    ".....yooy.......",
    "..kFFkkkkFFk....",
    ".kFfFFFFFFfFk...",
    "..kkFFFFFFkk....",
    "....kkkkkk......",
  ]),
});

export type PixelMascotName = keyof typeof PIXEL_MASCOTS;

export const PIXEL_MASCOT_NAMES = Object.keys(PIXEL_MASCOTS) as PixelMascotName[];
