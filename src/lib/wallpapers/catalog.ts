export type WallpaperTier = "free" | "plus";

export interface WallpaperDefinition {
  readonly id: string;
  readonly title: string;
  readonly tier: WallpaperTier;
  readonly posterUrl: string;
  readonly thumbnailUrl: string;
  readonly videoUrl: string;
}

// Lists only wallpapers with both a retained still and a delivery-approved live loop.
export const WALLPAPER_CATALOG = [
  {
    id: "galilee-be-still",
    title: "Galilee, Be Still",
    tier: "plus",
    posterUrl: "/wallpapers/galilee-be-still/poster.webp",
    thumbnailUrl: "/wallpapers/galilee-be-still/thumbnail.webp",
    videoUrl: "/wallpapers/galilee-be-still/loop.mp4",
  },
  {
    id: "the-olive-grove",
    title: "The Olive Grove",
    tier: "plus",
    posterUrl: "/wallpapers/the-olive-grove/poster.webp",
    thumbnailUrl: "/wallpapers/the-olive-grove/thumbnail.webp",
    videoUrl: "/wallpapers/the-olive-grove/loop.mp4",
  },
  {
    id: "01-let-there-be-light",
    title: "Let There Be Light",
    tier: "plus",
    posterUrl: "/wallpapers/01-let-there-be-light/poster.webp",
    thumbnailUrl: "/wallpapers/01-let-there-be-light/thumbnail.webp",
    videoUrl: "/wallpapers/01-let-there-be-light/loop.mp4",
  },
  {
    id: "12-baptism-in-the-jordan",
    title: "Baptism in the Jordan",
    tier: "plus",
    posterUrl: "/wallpapers/12-baptism-in-the-jordan/poster.webp",
    thumbnailUrl: "/wallpapers/12-baptism-in-the-jordan/thumbnail.webp",
    videoUrl: "/wallpapers/12-baptism-in-the-jordan/loop.mp4",
  },
  {
    id: "20-empty-tomb-at-dawn",
    title: "Empty Tomb at Dawn",
    tier: "plus",
    posterUrl: "/wallpapers/20-empty-tomb-at-dawn/poster.webp",
    thumbnailUrl: "/wallpapers/20-empty-tomb-at-dawn/thumbnail.webp",
    videoUrl: "/wallpapers/20-empty-tomb-at-dawn/loop.mp4",
  },
  {
    id: "candlelit-scriptorium",
    title: "Candlelit Scriptorium",
    tier: "plus",
    posterUrl: "/wallpapers/candlelit-scriptorium/poster.webp",
    thumbnailUrl: "/wallpapers/candlelit-scriptorium/thumbnail.webp",
    videoUrl: "/wallpapers/candlelit-scriptorium/loop.mp4",
  },
  {
    id: "the-sheltering-tree",
    title: "The Sheltering Tree",
    tier: "plus",
    posterUrl: "/wallpapers/the-sheltering-tree/poster.webp",
    thumbnailUrl: "/wallpapers/the-sheltering-tree/thumbnail.webp",
    videoUrl: "/wallpapers/the-sheltering-tree/loop.mp4",
  },
  {
    id: "03-abraham-under-the-stars",
    title: "Abraham Under the Stars",
    tier: "plus",
    posterUrl: "/wallpapers/03-abraham-under-the-stars/poster.webp",
    thumbnailUrl: "/wallpapers/03-abraham-under-the-stars/thumbnail.webp",
    videoUrl: "/wallpapers/03-abraham-under-the-stars/loop.mp4",
  },
  {
    id: "04-the-burning-bush",
    title: "The Burning Bush",
    tier: "plus",
    posterUrl: "/wallpapers/04-the-burning-bush/poster.webp",
    thumbnailUrl: "/wallpapers/04-the-burning-bush/thumbnail.webp",
    videoUrl: "/wallpapers/04-the-burning-bush/loop.mp4",
  },
  {
    id: "06-sinai-and-the-tablets",
    title: "Sinai and the Tablets",
    tier: "plus",
    posterUrl: "/wallpapers/06-sinai-and-the-tablets/poster.webp",
    thumbnailUrl: "/wallpapers/06-sinai-and-the-tablets/thumbnail.webp",
    videoUrl: "/wallpapers/06-sinai-and-the-tablets/loop.mp4",
  },
  {
    id: "08-the-still-small-voice",
    title: "The Still Small Voice",
    tier: "plus",
    posterUrl: "/wallpapers/08-the-still-small-voice/poster.webp",
    thumbnailUrl: "/wallpapers/08-the-still-small-voice/thumbnail.webp",
    videoUrl: "/wallpapers/08-the-still-small-voice/loop.mp4",
  },
  {
    id: "09-daniel-in-the-lions-den",
    title: "Daniel in the Lions' Den",
    tier: "plus",
    posterUrl: "/wallpapers/09-daniel-in-the-lions-den/poster.webp",
    thumbnailUrl: "/wallpapers/09-daniel-in-the-lions-den/thumbnail.webp",
    videoUrl: "/wallpapers/09-daniel-in-the-lions-den/loop.mp4",
  },
  {
    id: "17-the-last-supper",
    title: "The Last Supper",
    tier: "plus",
    posterUrl: "/wallpapers/17-the-last-supper/poster.webp",
    thumbnailUrl: "/wallpapers/17-the-last-supper/thumbnail.webp",
    videoUrl: "/wallpapers/17-the-last-supper/loop.mp4",
  },
  {
    id: "18-gethsemane-at-night",
    title: "Gethsemane at Night",
    tier: "plus",
    posterUrl: "/wallpapers/18-gethsemane-at-night/poster.webp",
    thumbnailUrl: "/wallpapers/18-gethsemane-at-night/thumbnail.webp",
    videoUrl: "/wallpapers/18-gethsemane-at-night/loop.mp4",
  },
] as const satisfies readonly WallpaperDefinition[];

export type Wallpaper = (typeof WALLPAPER_CATALOG)[number];
export type WallpaperId = Wallpaper["id"];

// Parchment is the only non-Plus canvas; every catalogued artwork is paid.
export const FREE_WALLPAPERS: readonly Wallpaper[] = [];
export const PLUS_WALLPAPERS = WALLPAPER_CATALOG;

const WALLPAPERS_BY_ID = new Map<WallpaperId, Wallpaper>(
  WALLPAPER_CATALOG.map((wallpaper) => [wallpaper.id, wallpaper]),
);

// Validates persisted or user-provided values before using them as catalog IDs.
export function isWallpaperId(value: unknown): value is WallpaperId {
  return typeof value === "string" && WALLPAPERS_BY_ID.has(value as WallpaperId);
}

// Returns a catalog entry only when the supplied value is a known wallpaper ID.
export function getWallpaperById(value: unknown): Wallpaper | undefined {
  return isWallpaperId(value) ? WALLPAPERS_BY_ID.get(value) : undefined;
}

// Enforces the catalog's free/Plus boundary for a known wallpaper.
export function canAccessWallpaper(
  _wallpaper: Wallpaper,
  hasPlusAccess: boolean,
): boolean {
  return hasPlusAccess;
}

// Resolves stale, invalid, or no-longer-entitled selections to parchment.
export function resolveWallpaper(
  value: unknown,
  hasPlusAccess: boolean,
): Wallpaper | null {
  const wallpaper = getWallpaperById(value);
  if (wallpaper && canAccessWallpaper(wallpaper, hasPlusAccess)) {
    return wallpaper;
  }

  return null;
}
