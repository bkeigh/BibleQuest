/**
 * PixelIcon — tiny hand-placed pixel sprites.
 *
 * A thin resolver over the pixel-asset registry (pixel-assets.ts).
 * Grid assets render as crisp SVG <rect>s so they scale without blur;
 * png assets render as a plain pixelated <img> (drop a file in
 * public/pixel/ and flip the registry entry — no call site changes).
 * These are one of BibleQuest's signatures: a modern spiritual
 * storybook, never retro-arcade.
 */
import { cn } from "@/lib/utils/cn";
import { PIXEL_SPRITES, type PixelSpriteName } from "./pixel-assets";

export { PIXEL_SPRITE_NAMES } from "./pixel-assets";
export type { PixelSpriteName } from "./pixel-assets";

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
  const asset = PIXEL_SPRITES[name];
  if (!asset) return null;

  if (asset.kind === "png") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny local pixel art; next/image would blur and lazy-load it
      <img
        src={asset.src}
        width={asset.cols * size}
        height={asset.rows * size}
        alt={title ?? ""}
        role={title ? "img" : "presentation"}
        aria-hidden={title ? undefined : true}
        className={cn(
          "pixelated shrink-0",
          animate && "ambient",
          animate && asset.ambientClassName,
          className
        )}
      />
    );
  }

  const rows = asset.rows;
  const cols = Math.max(...rows.map((r) => r.length));
  const width = cols * size;
  const height = rows.length * size;
  const ambientChars = asset.ambient?.chars ?? "";

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
          const fill = asset.palette[ch];
          if (!fill || fill === "transparent") return null;
          const isAmbient = animate && ambientChars.includes(ch);
          return (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1.02}
              height={1.02}
              fill={fill}
              className={isAmbient ? asset.ambient?.className : undefined}
            />
          );
        })
      )}
    </svg>
  );
}

/** Category → sprite, for quest glyphs. Every category gets its own mark. */
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
  family: "sun",
  community: "door",
  reflection: "compass",
  patience: "tree",
  evangelization: "scroll",
  "self-control": "key",
  humility: "path",
};
