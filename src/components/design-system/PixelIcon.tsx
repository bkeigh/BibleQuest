/**
 * PixelIcon — tiny hand-placed pixel sprites.
 *
 * A thin resolver over the pixel-asset registry (pixel-assets.ts).
 * Grid assets render as crisp SVG <rect>s so they scale without blur;
 * PNG assets render from their native source dimensions into a separate,
 * integer-sized logical layout box, so changing source resolution never
 * changes a call site's footprint.
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
    const cell = Math.max(1, Math.round(size * (asset.cellScale ?? 1)));
    const renderedWidth = asset.cols * cell;
    const renderedHeight = asset.rows * cell;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny local pixel art; next/image would blur and lazy-load it
      <img
        src={asset.src}
        width={asset.nativeWidth}
        height={asset.nativeHeight}
        style={{ width: renderedWidth, height: renderedHeight }}
        alt={title ?? ""}
        role={title ? "img" : "presentation"}
        aria-hidden={title ? undefined : true}
        draggable={false}
        decoding="async"
        className={cn(
          "pixelated block shrink-0 object-contain",
          animate && "ambient",
          animate && asset.ambientClassName,
          className
        )}
      />
    );
  }

  const rows = asset.rows;
  const cols = Math.max(...rows.map((r) => r.length));
  const cell = Math.max(1, Math.round(size * (asset.cellScale ?? 1)));
  const width = cols * cell;
  const height = rows.length * cell;
  const ambientChars = asset.ambient?.chars ?? "";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${cols} ${rows.length}`}
      shapeRendering="crispEdges"
      preserveAspectRatio="xMidYMid meet"
      focusable="false"
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
  prayer: "praying-hands",
  scripture: "open-book",
  service: "service-basket",
  kindness: "heart",
  forgiveness: "links",
  generosity: "wheat",
  discipline: "lantern",
  gratitude: "star",
  silence: "moon",
  worship: "chapel",
  family: "hands",
  community: "people",
  reflection: "fountain",
  patience: "tree",
  evangelization: "scroll",
  "self-control": "key",
  humility: "path",
};
