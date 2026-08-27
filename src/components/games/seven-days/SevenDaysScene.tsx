"use client";

import { useEffect } from "react";
import Image from "next/image";

/** Dedicated key art keeps the game recognizable on every level and card. */
const SEVEN_DAYS_POSTER =
  "/wallpapers/01-let-there-be-light/poster.webp";

/**
 * The scene a level is played over.
 *
 * The same poster appears on the arcade card, so opening the game carries its
 * visual identity through instead of switching to an unrelated wallpaper.
 * It is a still because the match-three board needs the screen's attention.
 */
export function SevenDaysScene() {
  // The poster is still a full-screen art backdrop, so the shared glass rules
  // remain appropriate even though it is no longer a selectable wallpaper.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("has-wallpaper");
    return () => root.classList.remove("has-wallpaper");
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      <Image
        src={SEVEN_DAYS_POSTER}
        alt=""
        fill
        priority={false}
        sizes="100vw"
        className="object-cover"
      />
      {/* The actual board remains dominant while the poster is still legible. */}
      <span className="absolute inset-0 bg-parchment/45" />
      <span className="absolute inset-0 bg-gradient-to-b from-parchment/50 via-parchment/30 to-parchment/60" />
    </div>
  );
}
