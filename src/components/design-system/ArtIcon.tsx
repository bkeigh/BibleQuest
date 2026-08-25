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

  // Normalize perceived subject size inside a stable box so differently
  // cropped paintings never shift the text or controls beside them.
  const renderedSize = Math.round(size * (ART_VISUAL_WEIGHT[name] ?? 1));
  const layoutBox = { width: size, height: size };
  const artworkBox = { width: renderedSize, height: renderedSize };

  // Render each source as decorative content because the stable outer frame
  // owns the optional accessible name for both still and animated artwork.
  const frame = (src: string, motionClass?: string) => (
    // eslint-disable-next-line @next/next/no-img-element -- local transparent art is already optimized for its exact use
    <img
      src={src}
      width={asset.nativeWidth}
      height={asset.nativeHeight}
      style={artworkBox}
      alt=""
      role="presentation"
      aria-hidden="true"
      draggable={false}
      decoding="async"
      className={cn(
        "artwork-2-5d block max-w-none shrink-0 object-contain",
        motionClass,
      )}
    />
  );

  return (
    <span
      style={layoutBox}
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-visible",
        className,
      )}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      data-art-name={name}
    >
      {/* Pair candle sources so the global reduced-motion rule can choose one. */}
      {animate && asset.animatedSrc ? (
        <>
          {frame(asset.animatedSrc, "art-in-motion")}
          {frame(asset.src, "art-at-rest")}
        </>
      ) : (
        frame(asset.src)
      )}
    </span>
  );
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
