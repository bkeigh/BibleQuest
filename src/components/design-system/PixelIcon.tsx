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
import {
  PIXEL_ART_WEIGHT,
  PIXEL_SPRITES,
  type PixelSpriteName,
} from "./pixel-assets";

export { PIXEL_SPRITE_NAMES } from "./pixel-assets";
export type { PixelSpriteName } from "./pixel-assets";

interface PixelIconProps {
  name: PixelSpriteName;
  /**
   * Rendered edge in CSS pixels. See `PIXEL_ICON` for the named ladder.
   *
   * This used to be a multiplier fed through each sprite's `cellScale` and
   * rounded to a whole art cell, which meant `max(1, round(size * 0.2)) * 32`
   * — so every size from 2 to 7 collapsed to exactly 32px and 8 jumped
   * straight to 64px. Eight distinct intents at the call sites rendered as
   * two actual sizes, and no call site could ask for anything in between.
   * Plain pixels cost the quantisation and buy a size that means what it says
   * and is the same across sprites with different art grids.
   */
  size?: number;
  /** Enable subtle ambient motion (flicker/sway/twinkle). */
  animate?: boolean;
  className?: string;
  title?: string;
}

/**
 * The icon ladder. Named so a screen picks a role rather than a number, and
 * so the whole app moves together when one step needs adjusting.
 */
export const PIXEL_ICON = {
  /** Inline with running text — a chip, a byline, a meta row. */
  inline: 32,
  /** A list row's leading glyph. */
  row: 48,
  /** A card's subject mark. */
  card: 64,
  /** The thing a screen is about. */
  feature: 88,
  /** Empty states and hero marks. */
  hero: 128,
} as const;

export function PixelIcon({
  name,
  size = PIXEL_ICON.row,
  animate = false,
  className,
  title,
}: PixelIconProps) {
  const asset = PIXEL_SPRITES[name];
  if (!asset) return null;

  // Aspect comes from the art grid so a non-square sprite is never stretched.
  // The weight correction makes one `size` mean one visual weight across
  // sprites whose art fills very different amounts of the same canvas — see
  // PIXEL_ART_WEIGHT.
  const weighted = size * (PIXEL_ART_WEIGHT[name] ?? 1);
  const renderedWidth = Math.round(weighted);
  const renderedHeight = Math.round(weighted * (asset.rows / asset.cols));
  const box = { width: renderedWidth, height: renderedHeight };

  const frame = (src: string, extra?: string) => (
    // eslint-disable-next-line @next/next/no-img-element -- local pixel art must stay crisp and load without image optimization
    <img
      src={src}
      width={asset.nativeWidth}
      height={asset.nativeHeight}
      style={box}
      alt={title ?? ""}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      draggable={false}
      decoding="async"
      className={cn(
        "pixelated block shrink-0 object-contain",
        animate && "ambient",
        animate && asset.ambientClassName,
        extra,
        className,
      )}
    />
  );

  /**
   * A hand-animated sprite plays as a GIF, which no stylesheet can pause — so
   * the still is rendered beside it and CSS chooses. That keeps both the OS
   * preference and BibleQuest's own reduced-motion switch authoritative, which
   * a bare `<img src="…gif">` would silently ignore.
   */
  if (animate && asset.animatedSrc) {
    return (
      <span
        className="contents"
        // The pair is one picture; assistive tech should hear it once.
        role={title ? "img" : undefined}
        aria-label={title || undefined}
      >
        {frame(asset.animatedSrc, "pixel-in-motion")}
        {frame(asset.src, "pixel-at-rest")}
      </span>
    );
  }

  return frame(asset.src);
}

/** Category → sprite, for quest glyphs. Every category gets its own mark. */
export const CATEGORY_SPRITE: Record<string, PixelSpriteName> = {
  prayer: "hands",
  scripture: "open-book",
  service: "service-basket",
  kindness: "flower",
  forgiveness: "links",
  generosity: "wheat",
  discipline: "lantern",
  gratitude: "star",
  silence: "moon",
  worship: "chapel",
  family: "door",
  community: "people",
  reflection: "fountain",
  patience: "tree",
  evangelization: "scroll",
  "self-control": "key",
  humility: "path",
};
