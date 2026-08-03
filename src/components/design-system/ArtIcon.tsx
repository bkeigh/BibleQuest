/**
 * ArtIcon renders BibleQuest's small hand-painted 2.5D illustrations.
 *
 * A role-based size stays independent of the 512px source canvas. Candle GIFs
 * can opt into motion; every other illustration remains a polished still.
 */
import { cn } from "@/lib/utils/cn";
import {
  ART_SPRITES,
  ART_VISUAL_WEIGHT,
  type ArtSpriteName,
} from "./art-assets";

export { ART_SPRITE_NAMES } from "./art-assets";
export type { ArtSpriteName } from "./art-assets";

interface ArtIconProps {
  name: ArtSpriteName;
  size?: number;
  /** Plays only a registered candle loop and respects reduced motion. */
  animate?: boolean;
  className?: string;
  title?: string;
}

// Give screens semantic roles instead of scattered asset-specific dimensions.
export const ART_ICON = {
  inline: 32,
  row: 48,
  card: 64,
  feature: 88,
  hero: 128,
} as const;

export function ArtIcon({
  name,
  size = ART_ICON.row,
  animate = false,
  className,
  title,
}: ArtIconProps) {
  const asset = ART_SPRITES[name];
  if (!asset) return null;

  // Normalize perceived subject size without altering tree or candle growth.
  const renderedSize = Math.round(size * (ART_VISUAL_WEIGHT[name] ?? 1));
  const box = { width: renderedSize, height: renderedSize };

  // Render a source while preserving the shared layout and accessibility role.
  const frame = (
    src: string,
    motionClass?: string,
    announced = true,
  ) => (
    // eslint-disable-next-line @next/next/no-img-element -- local transparent art is already optimized for its exact use
    <img
      src={src}
      width={asset.nativeWidth}
      height={asset.nativeHeight}
      style={box}
      alt={announced ? (title ?? "") : ""}
      role={announced && title ? "img" : "presentation"}
      aria-hidden={announced && title ? undefined : true}
      draggable={false}
      decoding="async"
      data-art-name={name}
      className={cn(
        "artwork-2-5d block shrink-0 object-contain",
        motionClass,
        className,
      )}
    />
  );

  // Pair moving and still candle sources so either reduced-motion control wins.
  if (animate && asset.animatedSrc) {
    return (
      <span
        className="contents"
        role={title ? "img" : undefined}
        aria-label={title || undefined}
      >
        {frame(asset.animatedSrc, "art-in-motion", false)}
        {frame(asset.src, "art-at-rest", false)}
      </span>
    );
  }

  return frame(asset.src);
}

// Map every quest category to one distinct illustrated symbol.
export const CATEGORY_ART: Record<string, ArtSpriteName> = {
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
