import type { ArtSpriteName } from "@/components/design-system/art-assets";
import { SEVEN_DAYS_TILE_IDS, type SevenDaysTileId } from "./types";

export interface SevenDaysTileArt {
  readonly id: SevenDaysTileId;
  /** Spoken by assistive tech and printed on goal rows. */
  readonly label: string;
  /** The painted 2.5D symbol drawn on the tile. */
  readonly sprite: ArtSpriteName;
  /**
   * Tile chips carry both a colour and a distinct silhouette, so a board is
   * still readable when colour alone is not.
   *
   * The fills are translucent, like every other surface in the app. They mixed
   * toward paper before, on the reasoning that washes of wallpaper would read
   * as one beige field — but the board already sits on its own blurred panel,
   * so a tile is glass over glass rather than glass over a photograph, and the
   * hues stay separable. What keeps them scannable at a translucent fill is the
   * ring: each is its own colour at full strength, so the edge carries the
   * identity even where the fill borrows from the scene.
   *
   * Deliberately no `backdrop-filter` here. Twenty-five blurring tiles on a
   * board that animates every move is the one place in the app that cost would
   * actually be felt, and the panel beneath has already blurred the scene.
   */
  readonly chipClassName: string;
  readonly goalClassName: string;
}

/**
 * The one place the board's artwork is chosen.
 *
 * Illustrations are looked up by name from the art registry, so an art upgrade
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
      "bg-[color-mix(in_srgb,var(--color-gold-300)_58%,transparent)] ring-[color-mix(in_srgb,var(--color-gold-600)_78%,transparent)]",
    goalClassName: "text-gilt",
  },
  waters: {
    id: "waters",
    label: "Waters",
    sprite: "fountain",
    chipClassName:
      "bg-[color-mix(in_srgb,var(--color-marian-300)_56%,transparent)] ring-[color-mix(in_srgb,var(--color-marian-700)_70%,transparent)]",
    goalClassName: "text-marian-700",
  },
  land: {
    id: "land",
    label: "Land",
    sprite: "mountain",
    chipClassName:
      "bg-[color-mix(in_srgb,var(--color-rose-300)_54%,transparent)] ring-[color-mix(in_srgb,var(--color-rose-700)_68%,transparent)]",
    goalClassName: "text-rose-700",
  },
  seed: {
    id: "seed",
    label: "Seed",
    sprite: "leaf",
    chipClassName:
      "bg-[color-mix(in_srgb,var(--color-olive-300)_58%,transparent)] ring-[color-mix(in_srgb,var(--color-olive-700)_68%,transparent)]",
    goalClassName: "text-olive-700",
  },
  wing: {
    id: "wing",
    label: "Wing",
    sprite: "dove",
    chipClassName:
      "bg-[color-mix(in_srgb,var(--color-violet-300)_56%,transparent)] ring-[color-mix(in_srgb,var(--color-violet-700)_68%,transparent)]",
    goalClassName: "text-violet-700",
  },
};

export const SEVEN_DAYS_TILE_ORDER = SEVEN_DAYS_TILE_IDS;

export function tileLabel(id: SevenDaysTileId): string {
  return SEVEN_DAYS_TILES[id].label;
}
