"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuestOS } from "@/lib/questos/store";
import { usePlus } from "@/lib/billing/usePlus";
import { resolveWallpaper } from "@/lib/wallpapers/catalog";
import type { Wallpaper } from "@/lib/wallpapers/catalog";
import { useShouldReduceMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils/cn";

interface SaveDataConnection {
  saveData?: boolean;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
}

/** Returns the optional Network Information API without widening Navigator globally. */
function getConnection(): SaveDataConnection | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: SaveDataConnection })
    .connection;
}

/** Subscribes to tab visibility so hidden wallpaper video is fully unloaded. */
function subscribeToVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** Reads the current tab visibility for useSyncExternalStore. */
function getVisibilitySnapshot(): boolean {
  return document.visibilityState === "visible";
}

/** Subscribes to data-saving changes where the browser exposes them. */
function subscribeToSaveData(onChange: () => void): () => void {
  const connection = getConnection();
  connection?.addEventListener?.("change", onChange);
  return () => connection?.removeEventListener?.("change", onChange);
}

/** Reads whether the browser asks sites to conserve network data. */
function getSaveDataSnapshot(): boolean {
  return getConnection()?.saveData === true;
}

/** Delays personalized artwork until the client can read persisted settings. */
function subscribeToHydration(): () => void {
  return () => {};
}

/**
 * Persistent app artwork layer. Only the selected loop is ever mounted, and
 * its still poster remains identical whenever playback is unavailable.
 */
export function WallpaperBackdrop() {
  const appearance = useQuestOS((state) => state.settings.appearance);
  const { isPlus } = usePlus();
  const shouldReduceMotion = useShouldReduceMotion();
  const visible = useSyncExternalStore(
    subscribeToVisibility,
    getVisibilitySnapshot,
    () => true,
  );
  const saveData = useSyncExternalStore(
    subscribeToSaveData,
    getSaveDataSnapshot,
    () => false,
  );
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const wallpaper =
    appearance.wallpaperId === "none"
      ? null
      : resolveWallpaper(appearance.wallpaperId, isPlus);
  const playLive =
    wallpaper !== null &&
    appearance.wallpaperMode === "live" &&
    !shouldReduceMotion &&
    !saveData &&
    visible;

  if (!hydrated || !wallpaper) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-parchment"
    >
      <div
        className="absolute inset-0 scale-[1.015] bg-cover bg-center"
        style={{ backgroundImage: `url(${wallpaper.posterUrl})` }}
      />
      {playLive && <LiveWallpaperVideo wallpaper={wallpaper} />}
      <div className="wallpaper-scrim absolute inset-0" />
    </div>
  );
}

/** Owns one playback attempt so unmounting live mode also releases its state. */
function LiveWallpaperVideo({ wallpaper }: { wallpaper: Wallpaper }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Catch autoplay failures that do not emit a media error and hold the still.
  useEffect(() => {
    if (!videoRef.current) return;
    void videoRef.current.play().catch(() => setFailed(true));
  }, []);

  if (failed) return null;

  return (
    <video
      ref={videoRef}
      className={cn(
        "absolute inset-0 h-full w-full scale-[1.015] object-cover",
        "transition-opacity duration-500",
        ready ? "opacity-100" : "opacity-0",
      )}
      src={wallpaper.videoUrl}
      poster={wallpaper.posterUrl}
      muted
      loop
      autoPlay
      playsInline
      preload="metadata"
      disablePictureInPicture
      onCanPlay={() => setReady(true)}
      onError={() => setFailed(true)}
    />
  );
}
