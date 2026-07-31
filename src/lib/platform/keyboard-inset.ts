"use client";

import { useEffect, useState } from "react";

/**
 * Reports how much of the layout viewport the on-screen keyboard covers.
 *
 * `position: fixed` resolves against the *layout* viewport, which iOS does not
 * shrink when the keyboard opens — only the visual viewport shrinks. So a
 * bottom-anchored panel stays pinned underneath the keyboard while the rest of
 * the page appears to slide, which reads as a broken screen rather than a
 * covered one.
 *
 * Tracking `visualViewport` gives the covered height, which callers add to
 * their own bottom offset to stay glued above the keyboard.
 *
 * Returns 0 during SSR, on browsers without the API, and whenever the keyboard
 * is closed — so a caller can always add it unconditionally.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      // offsetTop covers the case where the page is scrolled within the visual
      // viewport; without it the inset over-reports while scrolling.
      const covered =
        window.innerHeight - viewport.height - viewport.offsetTop;
      // Sub-pixel noise and rubber-band scrolling produce tiny values that
      // would jitter the panel; treat anything under a key row as closed.
      setInset(covered > 80 ? Math.round(covered) : 0);
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
