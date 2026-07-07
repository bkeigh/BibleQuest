/**
 * PixelIcon — tiny hand-placed pixel sprites.
 *
 * Each sprite is a small grid of characters mapped to a warm, limited palette.
 * Rendered as crisp SVG <rect>s so they scale without blur. These are one of
 * BibleQuest's signatures: a modern spiritual storybook, never retro-arcade.
 */
import { cn } from "@/lib/utils/cn";

type Palette = Record<string, string>;

interface Sprite {
  rows: string[];
  palette: Palette;
  /** Optional per-cell animation class for living details. */
  ambient?: { chars: string; className: string };
}

const T = "transparent";

// Shared warm tones (tokens mirrored so sprites read against parchment).
const INK = "#3f4d31";
const OLIVE = "#6f8155";
const OLIVE_L = "#a8b98c";
const GOLD = "#e5c36d";
const GOLD_D = "#b68b2f";
const FLAME = "#f2b24a";
const WHITE = "#fffaf0";
const ROSE = "#e5a8a1";
const ROSE_D = "#b9645d";
const BLUE = "#8fb9d4";
const BROWN = "#7a5a3a";
const BARK = "#6b4f34";
const STONE = "#c9c3b4";

const SPRITES: Record<string, Sprite> = {
  candle: {
    palette: { f: FLAME, w: GOLD, c: WHITE, b: GOLD_D, ".": T },
    rows: [
      "..f..",
      "..f..",
      "..w..",
      ".ccc.",
      ".ccc.",
      ".ccc.",
      ".bbb.",
    ],
    ambient: { chars: "f", className: "origin-bottom [animation:var(--animate-flicker)]" },
  },
  leaf: {
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
    palette: { b: OLIVE, d: INK, e: "#2c2c2c", ".": T },
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
    palette: { y: GOLD, o: FLAME, ".": T },
    rows: [
      "y.y.y",
      ".ooo.",
      "yooooy".slice(0, 5),
      ".ooo.",
      "y.y.y",
    ],
  },
  heart: {
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
    palette: { s: "#e8cba8", d: BROWN, ".": T },
    rows: [
      "s...s",
      "ss.ss",
      "sssss",
      "ddddd",
      ".ddd.",
    ],
  },
  wheat: {
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
    palette: { w: WHITE, g: STONE, b: BLUE, ".": T },
    rows: [
      "..www..",
      ".wwwwg.",
      "wwwwwwb",
      ".gwww..",
      "...g.g.",
    ],
  },
};

export type PixelSpriteName = keyof typeof SPRITES;

export const PIXEL_SPRITE_NAMES = Object.keys(SPRITES) as PixelSpriteName[];

interface PixelIconProps {
  name: PixelSpriteName;
  /** Rendered pixel size (each cell). */
  size?: number;
  /** Enable subtle ambient motion (flicker/sway/twinkle). */
  animate?: boolean;
  className?: string;
  title?: string;
}

export function PixelIcon({
  name,
  size = 6,
  animate = false,
  className,
  title,
}: PixelIconProps) {
  const sprite = SPRITES[name];
  if (!sprite) return null;
  const rows = sprite.rows;
  const cols = Math.max(...rows.map((r) => r.length));
  const width = cols * size;
  const height = rows.length * size;
  const ambientChars = sprite.ambient?.chars ?? "";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${cols} ${rows.length}`}
      className={cn("pixelated shrink-0", animate && "ambient", className)}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {rows.flatMap((row, y) =>
        row.split("").map((ch, x) => {
          const fill = sprite.palette[ch];
          if (!fill || fill === T) return null;
          const isAmbient = animate && ambientChars.includes(ch);
          return (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1.02}
              height={1.02}
              fill={fill}
              className={isAmbient ? sprite.ambient?.className : undefined}
            />
          );
        })
      )}
    </svg>
  );
}

/** Category → sprite, for quest glyphs. */
export const CATEGORY_SPRITE: Record<string, PixelSpriteName> = {
  prayer: "candle",
  scripture: "book",
  service: "hands",
  kindness: "heart",
  forgiveness: "dove",
  generosity: "wheat",
  discipline: "lantern",
  gratitude: "flower",
  silence: "leaf",
  worship: "chapel",
  family: "chapel",
  community: "chapel",
  reflection: "sun",
  patience: "tree",
};
