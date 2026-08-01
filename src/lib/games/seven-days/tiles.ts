import type { PixelSpriteName } from "@/components/design-system/pixel-assets";
import { SEVEN_DAYS_TILE_IDS, type SevenDaysTileId } from "./types";

export interface SevenDaysTileArt {
  readonly id: SevenDaysTileId;
  /** Spoken by assistive tech and printed on goal rows. */
  readonly label: string;
  /** The pixel sprite drawn on the tile. */
  readonly sprite: PixelSpriteName;
  /**
   * Tile chips carry both a colour and a distinct silhouette, so a board is
   * still readable when colour alone is not. The fills mix toward paper rather
   * than toward transparency: a board drawn in washes of the wallpaper reads as
   * one beige field, and a match-three board has to be scannable at a glance.
   */
  readonly chipClassName: string;
  readonly goalClassName: string;
}

/**
 * The one place the board's artwork is chosen.
 *
 * Sprites are looked up by name from the pixel registry, so a sprite overhaul
 * that keeps these five names needs no change here at all — and a rename is a
 * five-line edit in this file rather than a hunt through the board.
 */
export const SEVEN_DAYS_TILES: Readonly<
  Record<SevenDaysTileId, SevenDaysTileArt>
> = {
  light: {
    id: "light",
    label: "Light",
    sprite: "sun",
    chipClassName:
      "bg-[color-mix(in_srgb,var(--color-gold-300)_92%,var(--color-paper))] ring-[color-mix(in_srgb,var(--color-gold-600)_62%,transparent)]",
    goalClassName: "text-gilt",
  },
  waters: {
    id: "waters",
    label: "Waters",
    sprite: "fountain",
    chipClassName:
      "bg-[color-mix(in_srgb,var(--color-marian-300)_92%,var(--color-paper))] ring-[color-mix(in_srgb,var(--color-marian-700)_52%,transparent)]",
    goalClassName: "text-marian-700",
  },
  land: {
    id: "land",
    label: "Land",
    sprite: "mountain",
    chipClassName:
      "bg-[color-mix(in_srgb,var(--color-rose-300)_88%,var(--color-paper))] ring-[color-mix(in_srgb,var(--color-rose-700)_50%,transparent)]",
    goalClassName: "text-rose-700",
  },
  seed: {
    id: "seed",
    label: "Seed",
    sprite: "leaf",
    chipClassName:
      "bg-[color-mix(in_srgb,var(--color-olive-300)_94%,var(--color-paper))] ring-[color-mix(in_srgb,var(--color-olive-700)_50%,transparent)]",
    goalClassName: "text-olive-700",
  },
  wing: {
    id: "wing",
    label: "Wing",
    sprite: "dove",
    chipClassName:
      "bg-[color-mix(in_srgb,var(--color-violet-300)_92%,var(--color-paper))] ring-[color-mix(in_srgb,var(--color-violet-700)_50%,transparent)]",
    goalClassName: "text-violet-700",
  },
};

export const SEVEN_DAYS_TILE_ORDER = SEVEN_DAYS_TILE_IDS;

export function tileLabel(id: SevenDaysTileId): string {
  return SEVEN_DAYS_TILES[id].label;
}
