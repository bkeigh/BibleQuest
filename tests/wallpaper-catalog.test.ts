import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  WALLPAPER_CATALOG,
  resolveWallpaper,
} from "@/lib/wallpapers/catalog";

describe("wallpaper catalog", () => {
  it("reserves every artwork pair for Plus", () => {
    expect(WALLPAPER_CATALOG).toHaveLength(14);
    expect(WALLPAPER_CATALOG.every(({ tier }) => tier === "plus")).toBe(true);
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

  it("falls back to parchment when a wallpaper is unavailable", () => {
    const paid = WALLPAPER_CATALOG[0];
    expect(resolveWallpaper(paid.id, true)?.id).toBe(paid.id);
    expect(resolveWallpaper(paid.id, false)).toBeNull();
    expect(resolveWallpaper("unknown", true)).toBeNull();
  });
});
