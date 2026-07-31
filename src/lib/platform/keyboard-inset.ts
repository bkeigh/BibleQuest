"use client";

import { useSyncExternalStore } from "react";

/** The region of the layout viewport a reader can actually see right now. */
export interface VisualViewportFrame {
  /** Height of the visible region, in CSS pixels. */
  height: number;
  /** Distance from the layout viewport's top edge to the visible region. */
  offsetTop: number;
  /** How much of the layout viewport the on-screen keyboard covers. */
  keyboardInset: number;
}

/**
 * `position: fixed` resolves against the *layout* viewport, which iOS does not
 * shrink when the keyboard opens — only the visual viewport shrinks. So a
 * bottom-anchored panel stays pinned underneath the keyboard while the rest of
 * the page appears to slide, which reads as a broken screen rather than a
 * covered one.
 *
 * Earlier this module reported only the covered height, and each caller
 * rebuilt the visible area from it with viewport arithmetic — one guess for
 * the offset, another for the panel's maximum height. A single stale guess
 * left a band of page showing between the panel and the keyboard.
 *
 * Reporting the visible region instead removes the arithmetic: a fixed element
 * given this `top` and `height` covers exactly what the reader can see, and
 * lays its own contents out with ordinary flexbox.
 *
 * Falls back to the layout viewport during SSR and on browsers without the
 * API, so callers never have to branch.
 */
const SERVER_FRAME: VisualViewportFrame = Object.freeze({
  height: 0,
  offsetTop: 0,
  keyboardInset: 0,
});

let cached: VisualViewportFrame = SERVER_FRAME;

function measure(): VisualViewportFrame {
  const layoutHeight = window.innerHeight;
  const viewport = window.visualViewport;
  if (!viewport) {
    return { height: layoutHeight, offsetTop: 0, keyboardInset: 0 };
  }
  const height = Math.round(viewport.height);
  // offsetTop covers the case where the visual viewport has been scrolled
  // within the layout viewport; without it the frame drifts while rubber-banding.
  const offsetTop = Math.round(viewport.offsetTop);
  const covered = layoutHeight - height - offsetTop;
  // Sub-pixel noise and rubber-banding produce tiny values that would jitter
  // anything anchored to the keyboard; treat anything under a key row as shut.
  return {
    height,
    offsetTop,
    keyboardInset: covered > 80 ? Math.round(covered) : 0,
  };
}

function getSnapshot(): VisualViewportFrame {
  if (typeof window === "undefined") return SERVER_FRAME;
  const next = measure();
  // useSyncExternalStore compares snapshots by identity, so an unchanged
  // viewport must return the very same object or every scroll frame re-renders.
  if (
    next.height !== cached.height ||
    next.offsetTop !== cached.offsetTop ||
    next.keyboardInset !== cached.keyboardInset
  ) {
    cached = next;
  }
  return cached;
}

function getServerSnapshot(): VisualViewportFrame {
  return SERVER_FRAME;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", onChange);
  viewport?.addEventListener("scroll", onChange);
  // Browsers without visualViewport still resize and rotate.
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    viewport?.removeEventListener("resize", onChange);
    viewport?.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

/** Tracks the visible region so fixed panels can sit inside it, not behind it. */
export function useVisualViewport(): VisualViewportFrame {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
