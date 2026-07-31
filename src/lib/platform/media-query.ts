"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Phones, where a panel owns the screen instead of sharing it. */
export const COMPACT_VIEWPORT_QUERY = "(max-width: 39.9375rem)";

/**
 * Subscribes to a media query so behaviour — not only styling — can follow the
 * breakpoint. Modality is the case that matters: a sheet that covers a phone
 * needs a scrim and a focus trap, while the same panel tucked into a desktop
 * corner must leave the page usable behind it. Expressing that in CSS alone
 * would leave the accessibility tree describing a screen the reader isn't on.
 *
 * Returns `false` during SSR and reconciles after hydration.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined") return () => {};
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** True on phone-width screens, where sheets are modal. */
export function useCompactViewport(): boolean {
  return useMediaQuery(COMPACT_VIEWPORT_QUERY);
}
