"use client";

import { useEffect } from "react";
import Image from "next/image";
import { WALLPAPER_CATALOG } from "@/lib/wallpapers/catalog";

export function sceneById(id: string) {
  return WALLPAPER_CATALOG.find((wallpaper) => wallpaper.id === id);
}

/**
 * The scene a level is played over.
 *
 * Every level draws a different wallpaper from the same catalogue Plus sells,
 * and it is shown to everyone. That is the point: a reader meets the art while
 * playing, and if they want to keep it they now know what Plus is for. Nothing
 * here is gated, and nothing nags — the name sits on the level card, once.
 *
 * The poster still is used rather than the video loop: a match-three board
 * needs the screen's attention, and a looping video behind it would compete
 * with the tiles for it.
 */
export function SevenDaysScene({ sceneId }: { sceneId: string }) {
  const scene = sceneById(sceneId);

  // A level scene is a wallpaper by any other name, so the glass above it gets
  // to blur — see the `has-wallpaper` note in globals.css. Safe to switch on
  // here where it would not be on a long page: a level is one screen that does
  // not scroll, so the blur is composited once rather than every frame, and
  // showing these scenes at their best is the whole point of putting them here.
  useEffect(() => {
    if (!scene) return;
    const root = document.documentElement;
    root.classList.add("has-wallpaper");
    return () => root.classList.remove("has-wallpaper");
  }, [scene]);

  if (!scene) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      <Image
        src={scene.posterUrl}
        alt=""
        fill
        priority={false}
        sizes="100vw"
        className="object-cover"
      />
      {/* Light enough that the scene is the reason to look. The board sits on
          its own near-opaque panel, so the tiles never depend on this veil —
          it only has to keep the cards and the verse legible. */}
      <span className="absolute inset-0 bg-parchment/40" />
      <span className="absolute inset-0 bg-gradient-to-b from-parchment/45 via-parchment/25 to-parchment/55" />
    </div>
  );
}
