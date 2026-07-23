"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

interface NetworkConnectionLike {
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
}

/** Adds the live wallpaper only when the visitor's screen and data preferences suit it. */
export function HeroBackdrop() {
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    const wideScreen = window.matchMedia("(min-width: 64rem)");
    const motionAllowed = window.matchMedia(
      "(prefers-reduced-motion: no-preference)",
    );
    const connection = (
      navigator as Navigator & { connection?: NetworkConnectionLike }
    ).connection;

    // Keep mobile, reduced-motion, data-saver, and slow-network visits on the small still.
    const updatePlayback = () => {
      const slowConnection =
        connection?.effectiveType === "slow-2g" ||
        connection?.effectiveType === "2g";
      const shouldPlay =
        wideScreen.matches &&
        motionAllowed.matches &&
        connection?.saveData !== true &&
        !slowConnection;

      setVideoEnabled(shouldPlay);
      if (!shouldPlay) setVideoReady(false);
    };

    updatePlayback();
    wideScreen.addEventListener("change", updatePlayback);
    motionAllowed.addEventListener("change", updatePlayback);
    connection?.addEventListener?.("change", updatePlayback);

    return () => {
      wideScreen.removeEventListener("change", updatePlayback);
      motionAllowed.removeEventListener("change", updatePlayback);
      connection?.removeEventListener?.("change", updatePlayback);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-20 overflow-hidden"
    >
      <Image
        src="/marketing/hero-galilee-dawn.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[58%_center] sm:object-center"
      />

      {videoEnabled && (
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster="/marketing/hero-galilee-dawn.webp"
          onCanPlay={() => setVideoReady(true)}
          onError={() => setVideoEnabled(false)}
          className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-1000 ${
            videoReady ? "opacity-100" : "opacity-0"
          }`}
        >
          <source
            src="/marketing/hero-galilee-dawn-loop.mp4"
            type="video/mp4"
          />
        </video>
      )}

      {/* The parchment wash preserves text contrast while keeping the scene present. */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,253,247,0.9)_0%,rgba(255,253,247,0.82)_48%,rgba(255,253,247,0.92)_100%)] lg:bg-[linear-gradient(90deg,rgba(255,253,247,0.95)_0%,rgba(255,253,247,0.86)_46%,rgba(255,253,247,0.62)_100%)]" />
    </div>
  );
}
