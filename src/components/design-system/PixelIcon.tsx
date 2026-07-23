/**
 * PixelIcon — tiny hand-placed pixel sprites.
 *
 * A thin resolver over the production PNG registry (pixel-assets.ts).
 * Source dimensions stay separate from the integer-sized logical layout box,
 * so artwork upgrades never change a call site's footprint.
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

  const cell = Math.max(1, Math.round(size * (asset.cellScale ?? 1)));
  const renderedWidth = asset.cols * cell;
  const renderedHeight = asset.rows * cell;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- local pixel art must stay crisp and load without image optimization
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
