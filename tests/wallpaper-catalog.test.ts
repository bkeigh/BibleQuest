import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WALLPAPER_ID,
  FREE_WALLPAPERS,
  PLUS_WALLPAPERS,
  WALLPAPER_CATALOG,
  resolveWallpaper,
} from "@/lib/wallpapers/catalog";

describe("wallpaper catalog", () => {
  it("ships exactly five Free and nine Plus matched pairs", () => {
    expect(FREE_WALLPAPERS).toHaveLength(5);
    expect(PLUS_WALLPAPERS).toHaveLength(9);
    expect(WALLPAPER_CATALOG).toHaveLength(14);
  });

  it("backs every catalog URL with a production asset", () => {
    for (const wallpaper of WALLPAPER_CATALOG) {
      for (const url of [
        wallpaper.posterUrl,
        wallpaper.thumbnailUrl,
        wallpaper.videoUrl,
      ]) {
        expect(existsSync(path.join(process.cwd(), "public", url))).toBe(true);
      }
    }
  });

  it("falls back to the free default when a paid selection loses access", () => {
    const paid = PLUS_WALLPAPERS[0];
    expect(resolveWallpaper(paid.id, true).id).toBe(paid.id);
    expect(resolveWallpaper(paid.id, false).id).toBe(DEFAULT_WALLPAPER_ID);
    expect(resolveWallpaper("unknown", true).id).toBe(DEFAULT_WALLPAPER_ID);
  });
});
