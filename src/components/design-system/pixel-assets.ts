/**
 * BibleQuest pixel art registry.
 *
 * Grid fallbacks are rasterised from integer-aligned shapes and drawn as crisp
 * SVG rectangles by PixelIcon / PixelMascot. Every production PNG uses one
 * physical 128x128 source canvas. `cols` and `rows` describe the smaller
 * logical layout grid used by call sites; they are not the PNG's native size.
 */

export const PRODUCTION_PIXEL_NATIVE_SIZE = 128;

export type PixelAsset =
  | {
      kind: "grid";
      rows: string[];
      palette: Record<string, string>;
      /** Multiplies the caller's historic cell-size prop before snapping. */
      cellScale?: number;
      ambient?: { chars: string; className: string };
    }
  | {
      kind: "png";
      src: string;
      /** Divisor-compatible logical layout grid, independent of source pixels. */
      cols: number;
      rows: number;
      /** Intrinsic file dimensions used by the browser before CSS layout. */
      nativeWidth: number;
      nativeHeight: number;
      cellScale?: number;
      ambientClassName?: string;
    };

const defineAssets = <K extends string>(assets: Record<K, PixelAsset>) => assets;

type RectShape = {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};
type EllipseShape = {
  kind: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  color: string;
};
type LineShape = {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  thickness?: number;
};
type PixelShape = RectShape | EllipseShape | LineShape;

const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  color: string
): RectShape => ({ kind: "rect", x, y, width, height, color });
const ellipse = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string
): EllipseShape => ({ kind: "ellipse", cx, cy, rx, ry, color });
const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  thickness = 1
): LineShape => ({ kind: "line", x1, y1, x2, y2, color, thickness });

function rasterise(width: number, height: number, shapes: PixelShape[]): string[] {
  const cells = Array.from({ length: height }, () => Array(width).fill("."));
  const paint = (x: number, y: number, color: string) => {
    if (x >= 0 && x < width && y >= 0 && y < height) cells[y][x] = color;
  };

  for (const shape of shapes) {
    if (shape.kind === "rect") {
      for (let y = shape.y; y < shape.y + shape.height; y += 1) {
        for (let x = shape.x; x < shape.x + shape.width; x += 1) {
          paint(x, y, shape.color);
        }
      }
      continue;
    }

    if (shape.kind === "ellipse") {
      const minX = Math.floor(shape.cx - shape.rx);
      const maxX = Math.ceil(shape.cx + shape.rx);
      const minY = Math.floor(shape.cy - shape.ry);
      const maxY = Math.ceil(shape.cy + shape.ry);
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const dx = (x + 0.5 - shape.cx) / shape.rx;
          const dy = (y + 0.5 - shape.cy) / shape.ry;
          if (dx * dx + dy * dy <= 1) paint(x, y, shape.color);
        }
      }
      continue;
    }

    let x = shape.x1;
    let y = shape.y1;
    const dx = Math.abs(shape.x2 - shape.x1);
    const sx = shape.x1 < shape.x2 ? 1 : -1;
    const dy = -Math.abs(shape.y2 - shape.y1);
    const sy = shape.y1 < shape.y2 ? 1 : -1;
    let error = dx + dy;
    const thickness = Math.max(1, shape.thickness ?? 1);
    const low = -Math.floor((thickness - 1) / 2);
    const high = Math.floor(thickness / 2);
    while (true) {
      for (let oy = low; oy <= high; oy += 1) {
        for (let ox = low; ox <= high; ox += 1) paint(x + ox, y + oy, shape.color);
      }
      if (x === shape.x2 && y === shape.y2) break;
      const nextError = 2 * error;
      if (nextError >= dy) {
        error += dy;
        x += sx;
      }
      if (nextError <= dx) {
        error += dx;
        y += sy;
      }
    }
  }

  return cells.map((row) => row.join(""));
}

// Reference-board palette. Sprite contours use true black; evergreen remains
// an intentional interior material color.
const TRANSPARENT = "transparent";
const OUTLINE = "#000000";
const INK = "#2c2c2c";
const GREEN_DARK = "#0a3f2e";
const GREEN = "#0e533c";
const MOSS = "#6f8155";
const MOSS_LIGHT = "#a8b98c";
const GOLD_DARK = "#6f531d";
const GOLD = "#d3a336";
const GOLD_LIGHT = "#f2cf63";
const LEATHER_DARK = "#5d3b24";
const LEATHER = "#8b5e34";
const LEATHER_LIGHT = "#b7834b";
const PARCHMENT_DARK = "#d9c49b";
const PARCHMENT = "#f6e9d1";
const WARM_WHITE = "#fffaf0";
const BLUE_DARK = "#295470";
const BLUE = "#4f7e9e";
const BLUE_LIGHT = "#91b8cd";
const ROSE_DARK = "#9f514b";
const ROSE = "#d9897d";
const ROSE_LIGHT = "#f0b1a2";
const FLAME = "#e8872d";
const FLAME_LIGHT = "#ffd45a";
const STONE_DARK = "#817b6d";
const STONE = "#bdb49f";
const STONE_LIGHT = "#e1d8c4";
const SKIN_DARK = "#9b633c";
const SKIN = "#d49b68";
const SKIN_LIGHT = "#f1c79b";

const PALETTE = {
  k: OUTLINE,
  i: INK,
  e: GREEN_DARK,
  E: GREEN,
  m: MOSS,
  M: MOSS_LIGHT,
  d: GOLD_DARK,
  g: GOLD,
  G: GOLD_LIGHT,
  q: LEATHER_DARK,
  b: LEATHER,
  B: LEATHER_LIGHT,
  p: PARCHMENT_DARK,
  P: PARCHMENT,
  w: WARM_WHITE,
  u: BLUE_DARK,
  U: BLUE,
  V: BLUE_LIGHT,
  r: ROSE_DARK,
  R: ROSE,
  h: ROSE_LIGHT,
  o: FLAME,
  O: FLAME_LIGHT,
  s: STONE_DARK,
  S: STONE,
  H: STONE_LIGHT,
  t: SKIN_DARK,
  T: SKIN,
  L: SKIN_LIGHT,
  ".": TRANSPARENT,
};

function art(
  width: number,
  height: number,
  shapes: PixelShape[],
  options: Pick<Extract<PixelAsset, { kind: "grid" }>, "cellScale" | "ambient"> = {}
): PixelAsset {
  return { kind: "grid", rows: rasterise(width, height, shapes), palette: PALETTE, ...options };
}

function scaleShape(shape: PixelShape, factor: number): PixelShape {
  if (shape.kind === "rect") {
    return rect(
      shape.x * factor,
      shape.y * factor,
      shape.width * factor,
      shape.height * factor,
      shape.color
    );
  }
  if (shape.kind === "ellipse") {
    return ellipse(
      shape.cx * factor,
      shape.cy * factor,
      shape.rx * factor,
      shape.ry * factor,
      shape.color
    );
  }
  return line(
    shape.x1 * factor,
    shape.y1 * factor,
    shape.x2 * factor,
    shape.y2 * factor,
    shape.color,
    (shape.thickness ?? 1) * factor
  );
}

const icon = (
  shapes: PixelShape[],
  ambient?: Extract<PixelAsset, { kind: "grid" }>["ambient"]
) => art(32, 32, shapes.map((shape) => scaleShape(shape, 2)), { cellScale: 0.2, ambient });

/** A directly authored 32x32 icon for silhouettes that need single-pixel detail. */
const icon32 = (
  shapes: PixelShape[],
  ambient?: Extract<PixelAsset, { kind: "grid" }>["ambient"]
) => art(32, 32, shapes, { cellScale: 0.2, ambient });

const flameAmbient = { chars: "oOgG", className: "origin-bottom [animation:var(--animate-flicker)]" };
const twinkleAmbient = { chars: "gG", className: "[animation:var(--animate-twinkle)]" };

const GRID_PIXEL_SPRITES = defineAssets({
  candle: icon([
    ellipse(8, 14, 5, 1.5, "k"), ellipse(8, 13.5, 4, 1, "d"),
    rect(5, 5, 6, 8, "k"), rect(6, 6, 4, 6, "P"), rect(6, 6, 1, 5, "w"), rect(9, 7, 1, 5, "p"),
    rect(7, 3, 2, 3, "k"), ellipse(8, 3, 2, 2.5, "o"), ellipse(7.5, 2.5, 0.8, 1.5, "O"),
  ], flameAmbient),
  leaf: icon([
    line(4, 13, 11, 3, "k", 3), line(4, 13, 11, 3, "e"),
    ellipse(6, 8, 4, 2.5, "k"), ellipse(6, 8, 3, 1.6, "m"), ellipse(5, 7, 1.2, 0.7, "M"),
    ellipse(10.5, 5, 3.5, 2.3, "k"), ellipse(10.5, 5, 2.5, 1.4, "E"), ellipse(9.5, 4.2, 1, 0.6, "M"),
  ]),
  star: icon32([
    line(16, 2, 16, 29, "k", 5), line(2, 16, 29, 16, "k", 5),
    line(8, 8, 24, 24, "k", 3), line(24, 8, 8, 24, "k", 3),
    line(16, 4, 16, 27, "g", 2), line(4, 16, 27, 16, "g", 2),
    line(9, 9, 23, 23, "g"), line(23, 9, 9, 23, "g"),
    ellipse(14.5, 14.5, 4, 4, "G"), rect(12, 11, 4, 3, "w"),
  ], twinkleAmbient),
  bird: icon([
    ellipse(8, 9, 5, 3.5, "k"), ellipse(8, 8.5, 4, 2.5, "P"),
    ellipse(10.5, 6, 2.5, 2.5, "k"), ellipse(10.5, 6, 1.5, 1.5, "w"), rect(11, 5, 1, 1, "i"),
    line(5, 9, 2, 6, "k", 2), line(5, 10, 2, 12, "k", 2), line(7, 9, 10, 11, "p", 2),
    line(12, 7, 15, 8, "g", 2), line(7, 12, 6, 14, "k"), line(9, 12, 10, 14, "k"),
  ]),
  flower: icon([
    line(8, 8, 8, 15, "k", 3), line(8, 8, 8, 15, "e"),
    ellipse(8, 7, 2, 2, "g"), ellipse(8, 3.8, 2.3, 2.6, "r"), ellipse(11.2, 6.2, 2.5, 2.2, "r"),
    ellipse(8, 9.2, 2.3, 2.5, "r"), ellipse(4.8, 6.2, 2.5, 2.2, "r"),
    ellipse(8, 3.8, 1.4, 1.7, "h"), ellipse(11, 6, 1.5, 1.3, "R"), ellipse(8, 6.2, 1.2, 1.2, "G"),
  ]),
  chapel: icon([
    line(3, 7, 8, 2, "k", 3), line(8, 2, 13, 7, "k", 3), rect(3, 7, 10, 8, "k"),
    line(4, 7, 8, 3, "r", 2), line(8, 3, 12, 7, "r", 2), rect(4, 8, 8, 6, "P"),
    rect(7, 10, 3, 4, "e"), rect(8, 11, 1, 1, "g"), line(8, 0, 8, 4, "g"), line(6, 1, 10, 1, "g"),
  ]),
  book: icon([
    rect(2, 2, 12, 13, "k"), rect(3, 3, 10, 11, "e"), rect(4, 4, 8, 9, "P"),
    rect(4, 4, 1, 8, "w"), rect(11, 5, 1, 8, "p"), rect(7, 6, 2, 6, "g"), rect(5, 8, 6, 2, "g"),
    rect(6, 14, 4, 2, "d"), rect(7, 14, 2, 2, "g"),
  ]),
  "open-book": icon([
    line(1, 4, 7, 3, "k", 2), line(7, 3, 8, 14, "k", 2), line(8, 14, 15, 4, "k", 2),
    rect(2, 4, 5, 9, "P"), rect(9, 4, 5, 9, "P"), rect(3, 4, 3, 1, "w"), rect(10, 4, 3, 1, "w"),
    line(3, 7, 6, 7, "b"), line(3, 9, 6, 9, "b"), line(10, 7, 13, 7, "b"), line(10, 9, 13, 9, "b"),
    line(2, 14, 7, 14, "e", 2), line(9, 14, 14, 14, "e", 2),
  ]),
  bookmark: icon([
    rect(4, 1, 8, 14, "k"), rect(5, 2, 6, 11, "e"),
    line(5, 12, 8, 15, "k", 2), line(11, 12, 8, 15, "k", 2),
    line(5, 11, 8, 14, "e"), line(10, 11, 8, 14, "e"), rect(7, 4, 2, 5, "g"), rect(5, 6, 6, 2, "g"),
  ]),
  lantern: icon([
    line(5, 4, 5, 1, "k", 2), line(5, 1, 11, 1, "k", 2), line(11, 1, 11, 4, "k", 2),
    rect(3, 4, 10, 10, "k"), rect(4, 5, 8, 8, "g"), rect(5, 6, 6, 6, "e"),
    ellipse(8, 9, 2.3, 3, "o"), ellipse(7.5, 8, 1, 2, "O"), rect(5, 14, 6, 2, "d"),
  ], flameAmbient),
  path: icon([
    ellipse(5, 13, 4, 2, "k"), ellipse(5, 13, 3, 1.2, "S"),
    ellipse(10.5, 9, 3.5, 2, "k"), ellipse(10.5, 9, 2.5, 1.2, "H"),
    ellipse(7, 5, 3, 1.8, "k"), ellipse(7, 5, 2, 1, "S"),
    ellipse(11, 2, 2, 1.3, "k"), ellipse(11, 2, 1.2, 0.7, "H"),
  ]),
  tree: icon([
    line(8, 14, 8, 7, "k", 4), line(8, 14, 8, 7, "b", 2), line(8, 9, 5, 6, "k", 2), line(8, 9, 11, 6, "k", 2),
    ellipse(5, 5, 4, 3.5, "k"), ellipse(11, 5, 4, 3.5, "k"), ellipse(8, 3.5, 4, 3.5, "k"),
    ellipse(5, 5, 3, 2.5, "m"), ellipse(11, 5, 3, 2.5, "E"), ellipse(8, 3.5, 3, 2.5, "M"),
    line(4, 14, 12, 14, "k", 2),
  ]),
  sun: icon([
    ellipse(8, 8, 5, 5, "k"), ellipse(8, 8, 4, 4, "g"), ellipse(7, 7, 2, 2, "G"),
    line(8, 0, 8, 2, "g", 2), line(8, 14, 8, 15, "g", 2), line(0, 8, 2, 8, "g", 2), line(14, 8, 15, 8, "g", 2),
    line(2, 2, 4, 4, "g"), line(12, 12, 14, 14, "g"), line(14, 2, 12, 4, "g"), line(4, 12, 2, 14, "g"),
  ], twinkleAmbient),
  heart: icon([
    ellipse(5.2, 5.5, 4, 4, "k"), ellipse(10.8, 5.5, 4, 4, "k"),
    line(2, 6, 8, 14, "k", 4), line(14, 6, 8, 14, "k", 4),
    ellipse(5.4, 5.5, 3, 3, "R"), ellipse(10.6, 5.5, 3, 3, "r"),
    line(3, 6, 8, 13, "R", 3), line(13, 6, 8, 13, "r", 3), ellipse(4.5, 4.5, 1, 1, "h"),
  ]),
  hands: icon32([
    rect(2, 23, 9, 7, "k"), rect(21, 23, 9, 7, "k"),
    rect(3, 24, 8, 5, "e"), rect(21, 24, 8, 5, "m"),
    line(4, 20, 11, 24, "k", 7), line(28, 20, 21, 24, "k", 7),
    line(4, 20, 11, 24, "L", 4), line(28, 20, 21, 24, "T", 4),
    ellipse(10, 20, 7, 4.5, "k"), ellipse(22, 20, 7, 4.5, "k"),
    ellipse(10.5, 19.5, 5.5, 3, "L"), ellipse(21.5, 19.5, 5.5, 3, "T"),
    line(6, 17, 13, 21, "L", 2), line(26, 17, 19, 21, "T", 2),
    ellipse(12.5, 11.5, 4.5, 4.5, "k"), ellipse(19.5, 11.5, 4.5, 4.5, "k"),
    line(9, 12, 16, 21, "k", 5), line(23, 12, 16, 21, "k", 5),
    ellipse(12.5, 11.5, 3, 3, "R"), ellipse(19.5, 11.5, 3, 3, "r"),
    line(10, 12, 16, 20, "R", 3), line(22, 12, 16, 20, "r", 3),
    rect(11, 9, 3, 2, "h"),
  ]),
  "praying-hands": icon32([
    rect(6, 24, 9, 7, "k"), rect(17, 24, 9, 7, "k"),
    rect(7, 25, 8, 6, "e"), rect(17, 25, 8, 6, "m"),
    ellipse(13, 17, 5, 9, "k"), ellipse(19, 17, 5, 9, "k"),
    ellipse(13, 16.5, 3.5, 7.5, "L"), ellipse(19, 16.5, 3.5, 7.5, "T"),
    ellipse(13.5, 6.5, 3.5, 5.5, "k"), ellipse(18.5, 6.5, 3.5, 5.5, "k"),
    ellipse(13.5, 6.5, 2, 4.5, "L"), ellipse(18.5, 6.5, 2, 4.5, "T"),
    line(10, 20, 15, 15, "k", 4), line(22, 20, 17, 15, "k", 4),
    line(10, 20, 15, 15, "L", 2), line(22, 20, 17, 15, "T", 2),
    rect(15, 4, 2, 19, "k"), rect(16, 5, 1, 17, "p"),
  ]),
  wheat: icon32([
    line(16, 30, 16, 6, "k", 5), line(16, 30, 16, 6, "E", 2),
    ellipse(12, 8, 5, 3, "k"), ellipse(12, 8, 3.5, 1.5, "G"),
    ellipse(20, 11, 5, 3, "k"), ellipse(20, 11, 3.5, 1.5, "g"),
    ellipse(12, 14, 5, 3, "k"), ellipse(12, 14, 3.5, 1.5, "g"),
    ellipse(20, 17, 5, 3, "k"), ellipse(20, 17, 3.5, 1.5, "d"),
    ellipse(12, 20, 5, 3, "k"), ellipse(12, 20, 3.5, 1.5, "g"),
    ellipse(16, 4, 3.5, 5, "k"), ellipse(15.5, 4, 2, 3.5, "G"),
    line(16, 25, 7, 19, "k", 3), line(16, 25, 8, 20, "m"),
  ]),
  dove: icon([
    ellipse(9, 9, 5, 3.5, "k"), ellipse(9, 8.5, 4, 2.5, "w"),
    ellipse(12, 5.5, 2.5, 2.5, "k"), ellipse(12, 5.5, 1.5, 1.5, "w"), rect(12, 5, 1, 1, "i"),
    line(7, 9, 2, 3, "k", 3), line(7, 8, 3, 4, "P", 2),
    line(6, 10, 2, 13, "k", 2), line(7, 11, 4, 14, "k", 2), line(14, 6, 15, 7, "g", 2),
  ]),
  cross: icon([
    rect(6, 1, 4, 14, "k"), rect(2, 5, 12, 4, "k"),
    rect(7, 2, 2, 12, "g"), rect(3, 6, 10, 2, "g"), rect(7, 2, 1, 4, "G"),
  ]),
  door: icon([
    line(3, 15, 3, 6, "k", 3), line(13, 15, 13, 6, "k", 3), ellipse(8, 6, 6, 5, "k"),
    rect(4, 6, 8, 9, "e"), ellipse(8, 6, 4, 3.5, "e"), rect(5, 7, 1, 7, "E"),
    rect(10, 10, 2, 2, "g"), rect(2, 14, 12, 2, "k"),
  ]),
  key: icon([
    ellipse(5, 5, 4.5, 4.5, "k"), ellipse(5, 5, 2.5, 2.5, "P"), ellipse(5, 5, 1.2, 1.2, "e"),
    line(8, 8, 14, 14, "k", 4), line(8, 8, 14, 14, "g", 2),
    line(11, 11, 14, 9, "k", 2), line(13, 13, 15, 11, "k", 2),
  ]),
  scroll: icon([
    rect(3, 2, 10, 12, "k"), rect(4, 3, 8, 10, "P"),
    ellipse(4, 3, 3, 2, "k"), ellipse(12, 13, 3, 2, "k"), ellipse(4, 3, 2, 1, "G"), ellipse(12, 13, 2, 1, "d"),
    line(6, 6, 10, 6, "b"), line(6, 8, 11, 8, "b"), line(5, 10, 9, 10, "b"),
  ]),
  compass: icon([
    ellipse(8, 8, 7, 7, "k"), ellipse(8, 8, 5.5, 5.5, "P"), ellipse(8, 8, 1.2, 1.2, "g"),
    line(8, 3, 9, 8, "r", 2), line(8, 13, 7, 8, "e", 2), line(3, 8, 13, 8, "S"),
  ]),
  crown: icon([
    line(2, 5, 4, 11, "k", 3), line(4, 11, 12, 11, "k", 3), line(12, 11, 14, 5, "k", 3),
    line(2, 5, 6, 8, "k", 3), line(6, 8, 8, 3, "k", 3), line(8, 3, 10, 8, "k", 3), line(10, 8, 14, 5, "k", 3),
    line(3, 6, 6, 9, "g", 2), line(6, 9, 8, 4, "G", 2), line(8, 4, 10, 9, "g", 2), line(10, 9, 13, 6, "d", 2),
    rect(4, 11, 8, 3, "g"), rect(5, 12, 6, 1, "G"),
  ]),
  mountain: icon([
    line(1, 14, 7, 3, "k", 3), line(7, 3, 12, 11, "k", 3), line(10, 9, 13, 6, "k", 3), line(13, 6, 16, 14, "k", 3),
    line(2, 14, 7, 4, "e", 2), line(7, 4, 12, 12, "E", 2), line(11, 10, 13, 7, "m", 2), line(13, 7, 15, 14, "m", 2),
    line(5, 7, 7, 4, "w", 2), line(7, 4, 9, 7, "P", 2), rect(2, 14, 13, 2, "k"),
  ]),
  moon: icon([
    ellipse(8, 8, 7, 7, "k"), ellipse(8, 8, 5.5, 5.5, "U"), ellipse(11, 5, 5, 5, "."),
    rect(5, 4, 2, 2, "V"), rect(4, 8, 1, 2, "u"), rect(7, 12, 2, 1, "u"),
  ]),
  "service-basket": icon32([
    ellipse(16, 11, 10, 9, "k"), ellipse(16, 12, 7, 6, "."),
    ellipse(12.5, 13, 3.5, 3.5, "k"), ellipse(19.5, 13, 3.5, 3.5, "k"),
    line(9, 14, 16, 22, "k", 5), line(23, 14, 16, 22, "k", 5),
    ellipse(12.5, 13, 2.2, 2.2, "R"), ellipse(19.5, 13, 2.2, 2.2, "r"),
    line(10, 14, 16, 21, "R", 3), line(22, 14, 16, 21, "r", 3),
    line(5, 16, 8, 29, "k", 4), line(27, 16, 24, 29, "k", 4),
    line(7, 29, 25, 29, "k", 4), rect(7, 17, 18, 11, "b"),
    line(6, 18, 26, 18, "k", 3), line(8, 22, 24, 22, "q", 2),
    line(9, 26, 23, 26, "B", 2), line(11, 18, 11, 28, "q", 2),
    line(16, 18, 16, 28, "B", 2), line(21, 18, 21, 28, "q", 2),
  ]),
  links: icon([
    ellipse(5, 10, 4, 3, "k"), ellipse(5, 10, 2.5, 1.5, "P"),
    ellipse(11, 6, 4, 3, "k"), ellipse(11, 6, 2.5, 1.5, "P"),
    line(6, 9, 10, 7, "g", 3), line(2, 13, 5, 15, "e", 2), line(12, 3, 15, 1, "e", 2),
  ]),
  people: icon([
    ellipse(5, 5, 3, 3, "k"), ellipse(11, 5, 3, 3, "k"), ellipse(5, 5, 2, 2, "L"), ellipse(11, 5, 2, 2, "T"),
    ellipse(5, 12, 4.5, 4, "k"), ellipse(11, 12, 4.5, 4, "k"), ellipse(5, 12, 3.3, 3, "e"), ellipse(11, 12, 3.3, 3, "g"),
    rect(7, 12, 2, 4, "k"),
  ]),
  fountain: icon32([
    ellipse(16, 23, 15, 8, "k"), ellipse(16, 22.5, 13, 6, "u"),
    ellipse(16, 21.5, 10.5, 4, "U"), ellipse(15, 20.5, 7, 2.2, "V"),
    rect(13, 12, 6, 9, "k"), rect(15, 12, 3, 8, "S"),
    ellipse(16, 11, 6, 5.5, "k"), ellipse(15, 10, 4, 3.8, "S"),
    ellipse(14, 8.5, 2, 1.5, "H"),
    rect(5, 26, 22, 3, "k"), rect(7, 26, 18, 1, "V"),
  ]),

  "candle-unlit": makeCandle(0),
  "candle-small": makeCandle(1),
  "candle-steady": makeCandle(2),
  "candle-sparks": makeCandle(3),
  "candle-halo": makeCandle(4),

  "tree-stage-0": makeTreeStage(0),
  "tree-stage-1": makeTreeStage(1),
  "tree-stage-2": makeTreeStage(2),
  "tree-stage-3": makeTreeStage(3),
  "tree-stage-4": makeTreeStage(4),
  "tree-stage-5": makeTreeStage(5),
});

/**
 * Reviewed production PNG art. Source illustrations are conditioned on the
 * approved BibleQuest reference sheet and anchors, then reconstructed on the
 * native grid with the deterministic processor. The grid recipes above stay
 * as an editable fallback/reference language. All PNGs share one physical
 * 128px square canvas while their logical layout grids preserve intended UI
 * scale. Keeping those concepts separate prevents source-size changes from
 * inflating or distorting call sites.
 */
const pixelPng = (
  src: string,
  cols: number,
  rows: number,
  cellScale?: number,
  ambientClassName?: string
): PixelAsset => ({
  kind: "png",
  src,
  cols,
  rows,
  nativeWidth: PRODUCTION_PIXEL_NATIVE_SIZE,
  nativeHeight: PRODUCTION_PIXEL_NATIVE_SIZE,
  ...(cellScale == null ? {} : { cellScale }),
  ...(ambientClassName ? { ambientClassName } : {}),
});

const PRODUCTION_PNG_SPRITES = defineAssets({
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

export const PIXEL_SPRITES = defineAssets({
  ...GRID_PIXEL_SPRITES,
  ...PRODUCTION_PNG_SPRITES,
});

function makeCandle(stage: 0 | 1 | 2 | 3 | 4): PixelAsset {
  const shapes: PixelShape[] = [
    ellipse(8, 16, 6, 1.8, "k"), ellipse(8, 15.5, 5, 1.2, "d"),
    rect(4, 6, 8, 9, "k"), rect(5, 7, 6, 7, "P"), rect(5, 7, 2, 6, "w"), rect(10, 8, 1, 6, "p"),
    rect(7, 4, 2, 3, "k"),
  ];
  if (stage > 0) {
    const flameRy = stage >= 2 ? 3.5 : 2.5;
    shapes.push(ellipse(8, 4, stage >= 3 ? 2.7 : 2.2, flameRy, "o"));
    shapes.push(ellipse(7.5, 3.2, 1, stage >= 2 ? 2.2 : 1.5, "O"));
  }
  if (stage >= 3) shapes.push(rect(2, 3, 1, 1, "g"), rect(13, 5, 1, 1, "G"));
  if (stage >= 4) {
    shapes.push(line(3, 2, 5, 0, "g"), line(11, 0, 13, 2, "g"), rect(1, 7, 1, 1, "G"), rect(14, 8, 1, 1, "g"));
  }
  return art(16, 18, shapes, { cellScale: 0.75, ambient: stage > 0 ? flameAmbient : undefined });
}

function addSoil(shapes: PixelShape[], radius: number) {
  shapes.push(ellipse(16, 28.5, radius, 2.8, "k"));
  shapes.push(ellipse(15, 27.8, radius - 1.5, 1.7, "q"));
  shapes.push(rect(Math.max(3, 16 - radius + 3), 27, 4, 1, "B"));
  shapes.push(rect(Math.min(26, 16 + radius - 6), 29, 3, 1, "b"));
}

function addCanopyLobe(
  shapes: PixelShape[],
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: "e" | "E" | "m" | "M"
) {
  shapes.push(ellipse(cx, cy, rx + 1, ry + 1, "k"));
  shapes.push(ellipse(cx, cy, rx, ry, fill));
  shapes.push(ellipse(cx - rx * 0.35, cy - ry * 0.35, Math.max(1, rx * 0.28), Math.max(1, ry * 0.24), "M"));
}

function makeTreeStage(stage: 0 | 1 | 2 | 3 | 4 | 5): PixelAsset {
  const shapes: PixelShape[] = [];

  if (stage === 0) {
    addSoil(shapes, 7);
    shapes.push(ellipse(16, 25, 2.4, 2, "q"), ellipse(15.5, 24.5, 1.2, 1, "B"));
    shapes.push(line(16, 26, 16, 18, "k", 3), line(16, 25, 16, 18, "E"));
    shapes.push(line(16, 21, 11, 18, "k", 2), line(16, 21, 11, 18, "m"));
    shapes.push(line(16, 20, 21, 16, "k", 2), line(16, 20, 21, 16, "M"));
    shapes.push(ellipse(11, 17.5, 4, 2.5, "k"), ellipse(10.5, 17, 2.7, 1.4, "m"));
    shapes.push(ellipse(21, 15.5, 4, 2.5, "k"), ellipse(20.5, 15, 2.7, 1.4, "M"));
    return art(32, 32, shapes);
  }

  if (stage === 1) {
    addSoil(shapes, 9);
    shapes.push(line(16, 28, 16, 9, "k", 4), line(15, 27, 16, 9, "b", 2));
    shapes.push(line(16, 20, 10, 15, "k", 3), line(16, 20, 10, 15, "B"));
    shapes.push(line(16, 17, 23, 12, "k", 3), line(16, 17, 23, 12, "b"));
    for (const [cx, cy, fill] of [
      [10, 14, "m"], [13, 10, "M"], [17, 7, "m"], [22, 11, "M"], [23, 15, "E"], [11, 18, "E"],
    ] as const) {
      shapes.push(ellipse(cx, cy, 3.5, 2.7, "k"), ellipse(cx - 0.4, cy - 0.4, 2.3, 1.6, fill));
    }
    return art(32, 32, shapes);
  }

  addSoil(shapes, stage === 2 ? 11 : stage === 3 ? 13 : 15);

  const trunkWidth = stage === 2 ? 5 : stage === 3 ? 6 : 7;
  shapes.push(line(16, 26, 16, stage === 2 ? 12 : 11, "k", trunkWidth + 2));
  shapes.push(line(15, 26, 16, stage === 2 ? 12 : 11, "b", trunkWidth));
  shapes.push(line(14, 27, 9, 29, "k", 3), line(18, 27, 24, 29, "k", 3));
  shapes.push(line(14, 25, 9, 17, "k", 4), line(14, 24, 9, 17, "b", 2));
  shapes.push(line(18, 23, 24, 15, "k", 4), line(18, 22, 24, 15, "B", 2));

  const lobesByStage: Record<2 | 3 | 4 | 5, Array<[number, number, number, number, "e" | "E" | "m" | "M"]>> = {
    2: [[9, 14, 5, 4, "m"], [15, 9, 6, 5, "M"], [23, 13, 5, 4, "E"], [16, 16, 6, 4, "m"]],
    3: [[7, 15, 5, 5, "m"], [11, 10, 6, 5, "M"], [17, 7, 6, 5, "m"], [23, 10, 6, 5, "E"], [25, 15, 4, 4, "e"], [16, 15, 7, 5, "E"]],
    4: [[6, 16, 4, 4, "m"], [9, 11, 6, 5, "M"], [15, 7, 6, 5, "m"], [21, 9, 5, 5, "M"], [26, 14, 4, 4, "E"], [23, 17, 5, 4, "e"], [16, 15, 7, 5, "E"]],
    5: [[7, 14, 5, 4, "m"], [8, 10, 6, 4, "M"], [14, 9, 7, 4, "m"], [20, 9, 7, 4, "M"], [25, 11, 5, 4, "E"], [25, 15, 5, 4, "e"], [19, 15, 9, 4, "E"], [11, 15, 8, 4, "m"]],
  };

  for (const [cx, cy, rx, ry, fill] of lobesByStage[stage]) {
    addCanopyLobe(shapes, cx, cy, rx, ry, fill);
  }

  // Re-establish a visible fork and trunk after the clustered foliage. It is
  // the consistent species cue that keeps the mature stages from becoming a blob.
  shapes.push(line(16, 26, 16, 18, "k", trunkWidth + 1));
  shapes.push(line(15, 26, 16, 18, "b", trunkWidth - 1));
  shapes.push(line(15, 20, 11, 16, "q", 2), line(18, 20, 22, 16, "B", 2));

  if (stage === 4) {
    for (const [x, y] of [[8, 14], [14, 11], [21, 10], [26, 15]] as const) {
      shapes.push(ellipse(x, y, 1.5, 1.5, "d"), rect(x - 1, y - 1, 1, 1, "G"));
    }
  }
  if (stage === 5) {
    for (const [x, y] of [[6, 25], [10, 27], [23, 27], [27, 25]] as const) {
      shapes.push(line(x, y + 2, x, y, "e"), ellipse(x, y, 1.5, 1.5, "r"), rect(x - 1, y - 1, 1, 1, "G"));
    }
  }

  return art(32, 32, shapes, { ambient: stage >= 4 ? twinkleAmbient : undefined });
}

export type PixelSpriteName = keyof typeof PIXEL_SPRITES;
export const PIXEL_SPRITE_NAMES = Object.keys(PIXEL_SPRITES) as PixelSpriteName[];

const mascot = (width: number, height: number, shapes: PixelShape[]): PixelAsset =>
  art(width, height, shapes, { cellScale: 0.75 });

const GRID_PIXEL_MASCOTS = defineAssets({
  lamb: mascot(20, 16, [
    ellipse(12, 8, 7.5, 5, "k"), ellipse(12, 7.5, 6.5, 4, "w"),
    ellipse(5, 9, 4, 4, "k"), ellipse(5, 9, 3, 3, "T"), ellipse(4, 7, 2, 1.5, "w"),
    ellipse(2, 7, 2, 1.5, "k"), ellipse(2, 7, 1, 0.7, "P"), rect(4, 8, 1, 1, "i"), rect(2, 10, 2, 1, "q"),
    ellipse(18, 6, 2, 2, "k"), ellipse(18, 6, 1, 1, "w"),
    rect(8, 11, 3, 5, "k"), rect(14, 11, 3, 5, "k"), rect(9, 11, 1, 4, "b"), rect(15, 11, 1, 4, "b"),
  ]),
  lantern: mascot(16, 18, [
    line(4, 5, 4, 1, "k", 2), line(4, 1, 12, 1, "k", 2), line(12, 1, 12, 5, "k", 2),
    rect(2, 5, 12, 11, "k"), rect(3, 6, 10, 9, "g"), rect(5, 7, 6, 7, "e"),
    ellipse(8, 10, 2.5, 3.5, "o"), ellipse(7.5, 9, 1, 2.2, "O"), rect(5, 16, 6, 2, "d"),
  ]),
  scroll: mascot(20, 16, [
    rect(3, 2, 14, 12, "k"), rect(4, 3, 12, 10, "P"),
    ellipse(4, 3, 4, 2.5, "k"), ellipse(16, 13, 4, 2.5, "k"), ellipse(4, 3, 3, 1.5, "G"), ellipse(16, 13, 3, 1.5, "d"),
    line(7, 6, 14, 6, "b"), line(6, 8, 13, 8, "b"), line(7, 10, 12, 10, "b"), ellipse(5, 12, 2, 2, "e"),
  ]),
  dove: mascot(20, 16, [
    ellipse(11, 10, 6, 4, "k"), ellipse(11, 9.5, 5, 3, "w"), ellipse(15, 6, 3, 3, "k"), ellipse(15, 6, 2, 2, "w"), rect(15, 5, 1, 1, "i"),
    line(9, 9, 3, 2, "k", 4), line(9, 8, 4, 3, "P", 2), line(7, 11, 2, 15, "k", 3), line(8, 12, 5, 15, "P", 2),
    line(17, 7, 20, 8, "g", 2), line(18, 8, 20, 6, "e"),
  ]),
  sprout: mascot(18, 16, [
    ellipse(9, 14, 8, 2.5, "k"), ellipse(9, 13.5, 6.5, 1.5, "b"),
    line(9, 13, 9, 5, "k", 3), line(9, 13, 9, 5, "E"),
    ellipse(5.5, 6, 4, 2.8, "k"), ellipse(5.5, 6, 3, 1.8, "m"), ellipse(12.5, 4.5, 4, 2.8, "k"), ellipse(12.5, 4.5, 3, 1.8, "M"),
    ellipse(3, 13, 1.5, 1.5, "G"),
  ]),
  key: mascot(16, 18, [
    ellipse(6, 6, 5, 5, "k"), ellipse(6, 6, 3, 3, "g"), ellipse(6, 6, 1.5, 1.5, "e"),
    line(9, 9, 14, 15, "k", 5), line(9, 9, 14, 15, "g", 3), line(11, 12, 15, 9, "k", 2), line(13, 14, 16, 11, "k", 2),
  ]),
  map: mascot(20, 16, [
    rect(1, 2, 18, 12, "k"), rect(2, 3, 16, 10, "P"), line(7, 3, 7, 13, "p"), line(13, 3, 13, 13, "p"),
    line(3, 11, 6, 9, "g", 2), line(6, 9, 10, 7, "g", 2), line(10, 7, 15, 4, "g", 2), ellipse(3, 11, 1.5, 1.5, "e"),
    line(15, 3, 17, 5, "e", 2), line(17, 3, 15, 5, "e", 2), rect(2, 3, 2, 2, "w"), rect(16, 11, 2, 2, "w"),
  ]),
  campfire: mascot(18, 16, [
    line(2, 13, 15, 13, "k", 4), line(3, 12, 14, 14, "b", 3), line(4, 14, 15, 12, "q", 3),
    ellipse(9, 9, 4, 6, "k"), ellipse(9, 9, 3, 5, "o"), ellipse(8.5, 9, 1.5, 3.5, "O"), ellipse(10, 11, 1, 2, "g"),
    rect(4, 4, 1, 1, "G"), rect(13, 5, 1, 1, "g"),
  ]),
});

const PRODUCTION_PNG_MASCOTS = defineAssets({
  lamb: pixelPng("/pixel/mascot-lamb.png", 32, 32, 0.625),
  lantern: pixelPng("/pixel/mascot-lantern.png", 32, 32, 0.625, "[animation:var(--animate-flicker)]"),
  scroll: pixelPng("/pixel/mascot-scroll.png", 32, 32, 0.625),
  dove: pixelPng("/pixel/mascot-dove.png", 32, 32, 0.625),
  sprout: pixelPng("/pixel/mascot-sprout.png", 32, 32, 0.625),
  key: pixelPng("/pixel/mascot-key.png", 32, 32, 0.625),
  map: pixelPng("/pixel/mascot-map.png", 32, 32, 0.625),
  campfire: pixelPng("/pixel/mascot-campfire.png", 32, 32, 0.625, "[animation:var(--animate-flicker)]"),
});

export const PIXEL_MASCOTS = defineAssets({
  ...GRID_PIXEL_MASCOTS,
  ...PRODUCTION_PNG_MASCOTS,
});

export type PixelMascotName = keyof typeof PIXEL_MASCOTS;
export const PIXEL_MASCOT_NAMES = Object.keys(PIXEL_MASCOTS) as PixelMascotName[];
