"use client";

import { MotionConfig } from "framer-motion";

/**
 * Marketing-side MotionConfig — honors the OS reduced-motion setting for
 * every framer-motion animation on marketing pages (Reveal, etc.). The app
 * shell has its own MotionProvider; this closes the same hole out here.
 */
export function MarketingMotion({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
